"""Dark-launched hot-counter overlay for near-real-time stats.

Submit path: each accepted run's additive delta lands in Redis hashes the
moment it uploads. Tick path: the rebuilder logs how the hot totals compare
to what it folded, then rebases the hot state to exactly the runs newer
than the snapshot's data_through cursor. Nothing reads these keys yet.

    hot:totals            {runs, wins}
    hot:bracket:{ck}      {runs, wins}
    hot:ent:{etype}:{id}  {all:picks, all:wins, all:offered, all:picked,
                           {ck}:picks, {ck}:wins, {ck}:offered, {ck}:picked}
    hot:community:{key}   {runs, wins}
    hot:cursor            "<iso submitted_at>|<run_hash>"

Skill brackets (wr30/50/75) are excluded from hot deltas - they need the
submitter's win rate, and the tick rebases them within minutes anyway.
LIVE_OVERLAY=off disables the whole layer.
"""

from __future__ import annotations

import logging
import os
import threading

logger = logging.getLogger(__name__)

_ENABLED = os.environ.get("LIVE_OVERLAY", "on").strip().lower() not in (
    "off",
    "0",
    "false",
    "no",
)
_TTL = 24 * 3600


def _client():
    if not _ENABLED:
        return None
    from . import cache

    return cache.raw_client()


def delta_fields(partial: dict) -> dict[tuple[str, str], int]:
    """Flatten a raw accumulator into {(redis_key, field): increment}."""
    out: dict[tuple[str, str], int] = {}

    def add(key: str, field: str, n: int) -> None:
        if n:
            out[(key, field)] = out.get((key, field), 0) + n

    t = partial["new_totals"]
    add("hot:totals", "runs", t["total_runs"])
    add("hot:totals", "wins", t["total_wins"])
    for (etype, eid), agg in partial["new_cache"].items():
        key = f"hot:ent:{etype}:{eid}"
        add(key, "all:picks", agg.get("picks", 0))
        add(key, "all:wins", agg.get("wins", 0))
    for cid, pc in partial["pick_counts"].items():
        key = f"hot:ent:cards:{cid}"
        add(key, "all:offered", pc.get("offered", 0))
        add(key, "all:picked", pc.get("picked", 0))
    for ck, acc in partial["bracket_accs"].items():
        bt = acc["totals"]
        if not bt["total_runs"]:
            continue
        add(f"hot:bracket:{ck}", "runs", bt["total_runs"])
        add(f"hot:bracket:{ck}", "wins", bt["total_wins"])
        for (etype, eid), agg in acc["cache"].items():
            key = f"hot:ent:{etype}:{eid}"
            add(key, f"{ck}:picks", agg.get("picks", 0))
            add(key, f"{ck}:wins", agg.get("wins", 0))
        for cid, pc in acc["pick_counts"].items():
            key = f"hot:ent:cards:{cid}"
            add(key, f"{ck}:offered", pc.get("offered", 0))
            add(key, f"{ck}:picked", pc.get("picked", 0))
    for ck, sub in partial["community_acc"].items():
        if sub.get("total_runs"):
            add(f"hot:community:{ck}", "runs", sub["total_runs"])
            add(f"hot:community:{ck}", "wins", sub.get("total_wins", 0))
    return out


def _accumulate_rows(rows: list[dict], blobs: dict[str, dict]) -> dict:
    from .run_entity_stats import (
        _accumulate,
        _official_character_ids,
        get_recent_stat_versions,
    )

    return _accumulate(
        rows,
        _official_character_ids(),
        {},
        get_recent_stat_versions(),
        preloaded_blobs=blobs,
    )


def _write(r, fields: dict[tuple[str, str], int], cursor: tuple | None) -> None:
    pipe = r.pipeline(transaction=False)
    keys = set()
    for (key, field), n in fields.items():
        pipe.hincrby(key, field, n)
        keys.add(key)
    for key in keys:
        pipe.expire(key, _TTL)
    if cursor is not None:
        ts = cursor[0]
        iso = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
        pipe.set("hot:cursor", f"{iso}|{cursor[1]}", ex=_TTL)
    pipe.execute()


def fetch_row(run_hash: str) -> dict | None:
    from .runs_db_mongo import _get_collection

    d = _get_collection().find_one({"_id": run_hash})
    if not d:
        return None
    return {
        "run_hash": d["_id"],
        "character": d.get("character") or "",
        "win": bool(d.get("win")),
        "submitted_at": d.get("submitted_at"),
        "player_count": d.get("player_count") or 1,
        "ascension": d.get("ascension") or 0,
        "game_mode": d.get("game_mode") or "standard",
        "killed_by": d.get("killed_by"),
        "username": d.get("username") or "",
        "build_id": d.get("build_id") or "",
    }


def apply_run(run_hash: str, blob: dict) -> bool:
    """Apply one just-submitted run's delta to the hot state. Never raises."""
    try:
        r = _client()
        if r is None:
            return False
        row = fetch_row(run_hash)
        if row is None:
            return False
        partial = _accumulate_rows([row], {run_hash: blob})
        fields = delta_fields(partial)
        if not fields:
            return False
        cursor = (
            (row["submitted_at"], str(run_hash))
            if row.get("submitted_at") is not None
            else None
        )
        _write(r, fields, cursor)
        return True
    except Exception:
        logger.warning("live overlay apply failed for %s", run_hash, exc_info=True)
        return False


def apply_run_async(run_hash: str, blob: dict) -> None:
    if not _ENABLED:
        return
    threading.Thread(
        target=apply_run, args=(run_hash, blob), daemon=True, name="live-overlay"
    ).start()


def rebase_after_persist(last_key: tuple, folded_runs: int) -> None:
    """Reset the hot state to exactly the runs newer than the snapshot
    cursor. Called by the rebuilder after each persist; the transient
    races around the reset window are bounded and healed by the next
    rebase. Never raises into the tick."""
    try:
        r = _client()
        if r is None:
            return
        before = r.hgetall("hot:totals") or {}
        keys = list(r.scan_iter(match="hot:*", count=500))
        if keys:
            for i in range(0, len(keys), 500):
                r.delete(*keys[i : i + 500])
        from .run_entity_stats import _load_rows_after
        from .runs_db_mongo import get_run_blobs

        tail = _load_rows_after(last_key)
        applied = 0
        if tail:
            blobs = get_run_blobs([row["run_hash"] for row in tail])
            partial = _accumulate_rows(tail, blobs)
            fields = delta_fields(partial)
            t = tail[-1]
            _write(r, fields, (t["submitted_at"], str(t["run_hash"])))
            applied = len(tail)
        logger.info(
            "live overlay: hot totals were runs=%s wins=%s before rebase "
            "(tick folded %d); rebased onto %d tail runs",
            before.get("runs", 0),
            before.get("wins", 0),
            folded_runs,
            applied,
        )
    except Exception:
        logger.warning("live overlay rebase failed", exc_info=True)
