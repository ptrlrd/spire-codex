"""Per-entity run statistics — cached aggregator.

For each relic / card / potion, walks every submitted run JSON once,
counts how many runs include it (per character), how many of those
runs were wins, and tracks the most-recent submission. The result is
served from `/api/runs/stats/{entity_type}/{entity_id}` to power the
"Stats" tab on each detail page.

Cache strategy:
- The heavy walk of `data/runs/*.json` (100k+ files) runs in a SINGLE
  leader process via the existing stats-refresher Mongo lease, and the
  result is persisted to the `entity_stats_snapshot` collection.
- Every worker reads that shared snapshot into process memory (keyed by
  (entity_type, entity_id)) instead of walking the files itself. This
  is what stops N workers each pegging a CPU rebuilding the same data
  and serving inconsistent (some empty) tier lists.
- Workers reload the snapshot every `_SNAPSHOT_LOAD_SECONDS`; the leader
  rebuilds it every `_SNAPSHOT_REBUILD_SECONDS`.
- On the SQLite path (no Mongo) there's no shared snapshot, so each
  process builds locally on demand — fine at that scale.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from .runs_db import get_conn

_USING_MONGO = bool(os.environ.get("MONGO_URL", "").strip())

logger = logging.getLogger(__name__)

# `RELIC.SOZU` → ("relics", "SOZU"). We strip the namespace prefix so
# the cache key matches the URL slug used by every other endpoint.
_PREFIX_TO_TYPE = {
    "RELIC": "relics",
    "CARD": "cards",
    "POTION": "potions",
}

# Codex Score formula constants — see _compute_score for derivation.
# PRIOR_WEIGHT is how many "virtual baseline picks" we add to every
# entity to shrink low-N noise toward the baseline. 50 means a
# 5-pick perfect-record card lands ~mid-tier, not S-tier. SCALE_RANGE
# is the win-rate delta (vs the per-type baseline) that maps to the
# edges of the 0-100 scale; ±15pp covers the real-world spread of card/
# relic win rates around the per-type average without saturating
# moderate over/underperformers.
_SCORE_PRIOR_WEIGHT = 50
_SCORE_SCALE_RANGE = 0.15

_RUNS_DIR = (
    Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data"))
    / "runs"
)

# Materialized-snapshot config. The expensive 100k-file walk runs in a
# SINGLE leader process (via the existing stats-refresher lease) and is
# persisted to Mongo. Every worker reads that shared snapshot instead of
# walking the files itself — this is what stops N workers each pegging a
# CPU rebuilding the same data. Mirrors the stats_summary pattern.
SNAPSHOT_COLLECTION_NAME = "entity_stats_snapshot"
# Leader rebuilds the heavy walk at most this often.
_SNAPSHOT_REBUILD_SECONDS = 10 * 60
# Workers reload the snapshot from Mongo this often (cheap read).
_SNAPSHOT_LOAD_SECONDS = 5 * 60

# In-memory cache: { (entity_type, entity_id): aggregate_dict }
# `_cache_built_at` is the unix timestamp of the last full rebuild.
# `_global_totals` holds total_runs / total_wins so callers can compute
# pick rate without re-querying the DB.
_lock = threading.Lock()
_cache: dict[tuple[str, str], dict[str, Any]] = {}
_global_totals: dict[str, int] = {"total_runs": 0, "total_wins": 0}
# Pick-weighted average win-rate per entity type (cards/relics/potions).
# Used as the scoring baseline instead of the global run win rate: an
# entity is graded against the typical entity OF ITS TYPE, not against
# the global run win rate. The global rate is dragged down by abandoned
# / early-quit runs that contain almost no entities, which pushed nearly
# every card and relic above baseline and piled everything into S-tier.
_type_baselines: dict[str, float] = {}
_cache_built_at: float = 0.0
_building: bool = False


def _strip_prefix(raw: str) -> tuple[str, str] | None:
    """`RELIC.SOZU` → ('relics', 'SOZU'); unrecognized prefix → None."""
    if not raw or "." not in raw:
        return None
    prefix, rest = raw.split(".", 1)
    entity_type = _PREFIX_TO_TYPE.get(prefix.upper())
    if not entity_type:
        return None
    return entity_type, rest


def _strip_character_prefix(raw: str | None) -> str:
    """`CHARACTER.DEFECT` → 'DEFECT'; bare values pass through."""
    if not raw:
        return ""
    return raw.split(".", 1)[1] if raw.startswith("CHARACTER.") else raw


def _walk_run_entities(blob: dict) -> Iterable[tuple[str, str]]:
    """Emit every (entity_type, entity_id) seen in this run.

    Cards from the deck dedupe per-instance — if a deck has 5 Strikes
    we count 5 picks of Strike, NOT one. That matches user intuition
    ("how often does this card appear in runs"). To switch to "runs
    that contain at least one X" instead, set() the iterable.
    """
    for player in blob.get("players") or []:
        for relic in player.get("relics") or []:
            stripped = _strip_prefix(relic.get("id", ""))
            if stripped:
                yield stripped
        for card in player.get("deck") or []:
            stripped = _strip_prefix(card.get("id", ""))
            if stripped:
                yield stripped
        for potion in player.get("potions") or []:
            stripped = _strip_prefix(potion.get("id", ""))
            if stripped:
                yield stripped


def _build_cache_data() -> tuple[dict, dict, dict]:
    """Walk every run JSON + DB row and return (cache, totals,
    type_baselines) WITHOUT mutating module globals. The heavy 100k-file
    walk lives here so the leader refresher can compute + persist a
    snapshot, and the in-process fallback can reuse the same logic."""
    new_cache: dict[tuple[str, str], dict[str, Any]] = {}
    new_totals = {"total_runs": 0, "total_wins": 0}

    # Source of truth depends on which DB the app is using. Either way
    # we end up with an iterable of (run_hash, character, win, submitted_at).
    if _USING_MONGO:
        from .runs_db_mongo import _get_collection

        coll = _get_collection()
        rows = list(
            coll.find(
                {},
                {"_id": 1, "character": 1, "win": 1, "submitted_at": 1},
            )
        )
        # Normalise to a common dict-like shape so the loop below
        # doesn't have to branch.
        rows = [
            {
                "run_hash": d["_id"],
                "character": d.get("character") or "",
                "win": bool(d.get("win")),
                "submitted_at": d.get("submitted_at"),
            }
            for d in rows
        ]
    else:
        with get_conn() as conn:
            rows = conn.execute(
                "SELECT run_hash, character, win, submitted_at FROM runs"
            ).fetchall()
            rows = [dict(r) for r in rows]

    for row in rows:
        new_totals["total_runs"] += 1
        if row["win"]:
            new_totals["total_wins"] += 1
        run_hash = row["run_hash"]
        character = _strip_character_prefix(row["character"])
        is_win = bool(row["win"])
        submitted = row["submitted_at"]
        # Mongo returns datetimes; SQLite returns ISO strings. Normalise
        # to ISO string so the max() comparison below sorts correctly.
        if submitted is not None and hasattr(submitted, "isoformat"):
            submitted = submitted.isoformat()

        path = _RUNS_DIR / f"{run_hash}.json"
        if not path.exists():
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                blob = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            logger.warning("skipping unreadable run %s: %s", run_hash, e)
            continue

        # Dedupe per-run: a deck with 5 Strikes still only counts ONE
        # pick of "this run had Strike". We count run-level membership
        # so the win-rate metric is "win rate when X is in your deck"
        # rather than skewed by deck composition.
        seen: set[tuple[str, str]] = set()
        for entity in _walk_run_entities(blob):
            seen.add(entity)

        for entity in seen:
            agg = new_cache.setdefault(
                entity,
                {
                    "picks": 0,
                    "wins": 0,
                    "by_character": {},
                    "last_submitted_at": None,
                    "last_run_hash": None,
                },
            )
            agg["picks"] += 1
            if is_win:
                agg["wins"] += 1
            char_agg = agg["by_character"].setdefault(
                character, {"picks": 0, "wins": 0}
            )
            char_agg["picks"] += 1
            if is_win:
                char_agg["wins"] += 1
            # ISO-string timestamps sort lexicographically with the
            # right semantics, so a max() comparison "just works".
            if not agg["last_submitted_at"] or (
                submitted and submitted > agg["last_submitted_at"]
            ):
                agg["last_submitted_at"] = submitted
                agg["last_run_hash"] = run_hash

    # Per-type baselines: pick-weighted average win rate across all
    # entities of each type. Computed once per rebuild so scoring reads
    # are O(1).
    type_totals: dict[str, dict[str, int]] = {}
    for (etype, _), agg in new_cache.items():
        tt = type_totals.setdefault(etype, {"wins": 0, "picks": 0})
        tt["wins"] += agg["wins"]
        tt["picks"] += agg["picks"]
    new_type_baselines = {
        etype: (tt["wins"] / tt["picks"]) if tt["picks"] else 0.5
        for etype, tt in type_totals.items()
    }
    return new_cache, new_totals, new_type_baselines


def _apply_cache(cache: dict, totals: dict, baselines: dict) -> None:
    """Swap freshly-built (or snapshot-loaded) data into module globals."""
    global _cache, _cache_built_at, _global_totals, _type_baselines
    _cache = cache
    _global_totals = totals
    _type_baselines = baselines
    _cache_built_at = time.time()


def _build_cache() -> None:
    """Local fallback: build from files and apply to globals in-process.

    Only used when the Mongo snapshot is unavailable (SQLite path, or a
    cold start before the leader has written the first snapshot)."""
    cache, totals, baselines = _build_cache_data()
    _apply_cache(cache, totals, baselines)
    logger.info(
        "run-entity-stats cache rebuilt (local): %d entities across %d runs",
        len(cache),
        totals["total_runs"],
    )


# ── Shared Mongo snapshot ────────────────────────────────────────────────


def _snapshot_coll():
    from .runs_db_mongo import _get_collection

    return _get_collection().database[SNAPSHOT_COLLECTION_NAME]


def _persist_snapshot(cache: dict, totals: dict, baselines: dict) -> None:
    """Write the built cache to Mongo as one doc per entity type plus a
    meta doc. Entities are stored as arrays (not dicts) so entity IDs
    never collide with Mongo field-name restrictions."""
    coll = _snapshot_coll()
    by_type: dict[str, list] = {}
    for (etype, eid), agg in cache.items():
        by_type.setdefault(etype, []).append(
            {
                "id": eid,
                "picks": agg["picks"],
                "wins": agg["wins"],
                "by_character": [
                    {"character": ch, "picks": s["picks"], "wins": s["wins"]}
                    for ch, s in agg["by_character"].items()
                ],
                "last_submitted_at": agg["last_submitted_at"],
                "last_run_hash": agg["last_run_hash"],
            }
        )
    now = datetime.now(timezone.utc)
    for etype, entities in by_type.items():
        coll.replace_one(
            {"_id": etype},
            {"_id": etype, "entities": entities, "updated_at": now},
            upsert=True,
        )
    coll.replace_one(
        {"_id": "__meta__"},
        {
            "_id": "__meta__",
            "global_totals": totals,
            "type_baselines": baselines,
            "entity_types": list(by_type.keys()),
            "built_at": now,
        },
        upsert=True,
    )


def _load_snapshot() -> bool:
    """Load the shared snapshot from Mongo into module globals. Returns
    False if no snapshot exists yet (caller falls back to local build)."""
    coll = _snapshot_coll()
    meta = coll.find_one({"_id": "__meta__"})
    if not meta:
        return False
    new_cache: dict[tuple[str, str], dict[str, Any]] = {}
    for etype in meta.get("entity_types", []):
        doc = coll.find_one({"_id": etype})
        if not doc:
            continue
        for e in doc.get("entities", []):
            by_char = {
                c["character"]: {"picks": c["picks"], "wins": c["wins"]}
                for c in e.get("by_character", [])
            }
            new_cache[(etype, e["id"])] = {
                "picks": e["picks"],
                "wins": e["wins"],
                "by_character": by_char,
                "last_submitted_at": e.get("last_submitted_at"),
                "last_run_hash": e.get("last_run_hash"),
            }
    _apply_cache(
        new_cache,
        meta.get("global_totals", {"total_runs": 0, "total_wins": 0}),
        meta.get("type_baselines", {}),
    )
    return True


def refresh_entity_stats_snapshot() -> int:
    """Leader-only: rebuild the cache from run files and persist it to
    Mongo for every worker to read. Skips the heavy walk if the existing
    snapshot is younger than _SNAPSHOT_REBUILD_SECONDS. Returns the
    entity count written (0 if skipped)."""
    coll = _snapshot_coll()
    meta = coll.find_one({"_id": "__meta__"}, {"built_at": 1})
    if meta and meta.get("built_at"):
        built = meta["built_at"]
        if built.tzinfo is None:
            built = built.replace(tzinfo=timezone.utc)
        if (datetime.now(timezone.utc) - built).total_seconds() < (
            _SNAPSHOT_REBUILD_SECONDS
        ):
            return 0  # snapshot still fresh

    cache, totals, baselines = _build_cache_data()
    _persist_snapshot(cache, totals, baselines)
    _apply_cache(cache, totals, baselines)
    logger.info(
        "entity-stats snapshot rebuilt: %d entities across %d runs",
        len(cache),
        totals["total_runs"],
    )
    return len(cache)


def _maybe_rebuild() -> None:
    global _building
    age = time.time() - _cache_built_at
    if age < _SNAPSHOT_LOAD_SECONDS:
        return
    with _lock:
        if _building:
            return
        if time.time() - _cache_built_at < _SNAPSHOT_LOAD_SECONDS:
            return
        _building = True
    try:
        # On the Mongo path, request threads NEVER walk the run files.
        # They only load the shared snapshot the leader refresher builds.
        # If the snapshot doesn't exist yet (cold start before the first
        # leader cycle), we leave the cache as-is and let the next read
        # pick it up once the refresher has written it — a few seconds of
        # an empty tier list beats every worker pegging a CPU.
        if _USING_MONGO:
            try:
                _load_snapshot()
            except Exception as e:
                logger.warning("entity-stats snapshot load failed: %s", e)
            return
        # SQLite path: no shared snapshot, build locally.
        _build_cache()
    finally:
        with _lock:
            _building = False


def _baseline_win_rate() -> float:
    """Global win rate across every submitted run, or 0.5 if empty."""
    total = _global_totals["total_runs"]
    if not total:
        return 0.5
    return _global_totals["total_wins"] / total


def _type_baseline(entity_type: str) -> float:
    """Pick-weighted average win rate across entities of one type.

    This is the scoring baseline: an entity is graded relative to the
    typical entity of its type. Falls back to the global run win rate
    if the type hasn't been aggregated yet (cold cache)."""
    return _type_baselines.get(entity_type, _baseline_win_rate())


def _compute_score(wins: int, picks: int, baseline: float) -> int | None:
    """0-100 Codex Score for an entity.

    Step 1 — Bayesian shrinkage: blend the entity's wins/picks with
    `_SCORE_PRIOR_WEIGHT` virtual picks at the baseline win rate. This
    keeps a 5-pick card at 100% win rate from outranking a 500-pick
    card at 60% (the high-confidence one wins).

    Step 2 — Map the shrunk delta to 0-100. baseline → 50 (neutral),
    +SCORE_SCALE_RANGE → 100 (S-tier), -SCORE_SCALE_RANGE → 0 (F-tier).
    Clamped — saturating cards genuinely belong at the edges.
    """
    if picks <= 0:
        return None
    shrunk = (wins + baseline * _SCORE_PRIOR_WEIGHT) / (picks + _SCORE_PRIOR_WEIGHT)
    delta = shrunk - baseline
    raw = (delta / _SCORE_SCALE_RANGE + 1) * 50
    return max(0, min(100, round(raw)))


def get_all_entity_scores(entity_type: str) -> dict[str, dict[str, Any]]:
    """All entities of one type, keyed by ID, with score + counts.

    Drives list-page tier sorting and the (planned) tooltip-widget
    score badge — fetched once by the client and cached locally instead
    of N round-trips to /stats/{type}/{id}.
    """
    _maybe_rebuild()
    baseline = _type_baseline(entity_type)
    out: dict[str, dict[str, Any]] = {}
    for (etype, eid), agg in _cache.items():
        if etype != entity_type:
            continue
        picks = agg["picks"]
        wins = agg["wins"]
        out[eid] = {
            "score": _compute_score(wins, picks, baseline),
            "picks": picks,
            "wins": wins,
            "win_rate": round(wins / picks * 100, 1) if picks else 0.0,
        }
    return out


def get_entity_stats(entity_type: str, entity_id: str) -> dict[str, Any] | None:
    """Public accessor — returns the aggregate for one entity or None.

    Triggers a cache rebuild if the existing one is stale. First call
    blocks while the initial build runs (a few seconds at current run
    counts); subsequent calls within the TTL window are O(1).
    """
    _maybe_rebuild()
    key = (entity_type, entity_id.upper())
    agg = _cache.get(key)
    if agg is None:
        return None
    picks = agg["picks"]
    wins = agg["wins"]
    by_character = [
        {
            "character": ch,
            "picks": stats["picks"],
            "wins": stats["wins"],
            "win_rate": round(stats["wins"] / stats["picks"] * 100, 1)
            if stats["picks"]
            else 0.0,
        }
        for ch, stats in sorted(
            agg["by_character"].items(),
            key=lambda kv: kv[1]["picks"],
            reverse=True,
        )
    ]
    total_runs = _global_totals["total_runs"]
    baseline = _type_baseline(entity_type)
    return {
        "entity_type": entity_type,
        "entity_id": entity_id.upper(),
        "picks": picks,
        "wins": wins,
        "win_rate": round(wins / picks * 100, 1) if picks else 0.0,
        "pick_rate": round(picks / total_runs * 100, 1) if total_runs else 0.0,
        "total_runs": total_runs,
        "baseline_win_rate": round(baseline * 100, 1),
        "score": _compute_score(wins, picks, baseline),
        "by_character": by_character,
        "last_submitted_at": agg["last_submitted_at"],
        "last_run_hash": agg["last_run_hash"],
    }
