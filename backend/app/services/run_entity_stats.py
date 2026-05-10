"""Per-entity run statistics — cached aggregator.

For each relic / card / potion, walks every submitted run JSON once,
counts how many runs include it (per character), how many of those
runs were wins, and tracks the most-recent submission. The result is
served from `/api/runs/stats/{entity_type}/{entity_id}` to power the
"Stats" tab on each detail page.

Cache strategy:
- First request triggers a full walk of `data/runs/*.json` joined
  against the runs DB (for character, win, submitted_at, run_hash).
- Result lives in process memory keyed by (entity_type, entity_id).
- TTL is `_CACHE_TTL_SECONDS`; a request after expiry kicks off a
  rebuild. Rebuild is single-shot (a re-entry while building gets the
  stale snapshot and skips the rebuild).
- Run submissions are infrequent enough that a 30-minute TTL is fine
  without invalidation hooks.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any, Iterable

from .runs_db import get_conn

logger = logging.getLogger(__name__)

# `RELIC.SOZU` → ("relics", "SOZU"). We strip the namespace prefix so
# the cache key matches the URL slug used by every other endpoint.
_PREFIX_TO_TYPE = {
    "RELIC": "relics",
    "CARD": "cards",
    "POTION": "potions",
}

_CACHE_TTL_SECONDS = 30 * 60  # 30 minutes
_RUNS_DIR = (
    Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data"))
    / "runs"
)

# In-memory cache: { (entity_type, entity_id): aggregate_dict }
# `_cache_built_at` is the unix timestamp of the last full rebuild.
# `_global_totals` holds total_runs / total_wins so callers can compute
# pick rate without re-querying the DB.
_lock = threading.Lock()
_cache: dict[tuple[str, str], dict[str, Any]] = {}
_global_totals: dict[str, int] = {"total_runs": 0, "total_wins": 0}
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


def _build_cache() -> None:
    """Walk every run JSON + DB row, populate the per-entity aggregate."""
    new_cache: dict[tuple[str, str], dict[str, Any]] = {}
    new_totals = {"total_runs": 0, "total_wins": 0}

    with get_conn() as conn:
        rows = conn.execute(
            "SELECT run_hash, character, win, submitted_at FROM runs"
        ).fetchall()

    for row in rows:
        new_totals["total_runs"] += 1
        if row["win"]:
            new_totals["total_wins"] += 1
        run_hash = row["run_hash"]
        character = _strip_character_prefix(row["character"])
        is_win = bool(row["win"])
        submitted = row["submitted_at"]

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

    global _cache, _cache_built_at, _global_totals
    _cache = new_cache
    _global_totals = new_totals
    _cache_built_at = time.time()
    logger.info(
        "run-entity-stats cache rebuilt: %d entities across %d runs",
        len(new_cache),
        new_totals["total_runs"],
    )


def _maybe_rebuild() -> None:
    global _building
    age = time.time() - _cache_built_at
    if age < _CACHE_TTL_SECONDS:
        return
    with _lock:
        if _building:
            return
        if time.time() - _cache_built_at < _CACHE_TTL_SECONDS:
            return
        _building = True
    try:
        _build_cache()
    finally:
        with _lock:
            _building = False


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
    return {
        "entity_type": entity_type,
        "entity_id": entity_id.upper(),
        "picks": picks,
        "wins": wins,
        "win_rate": round(wins / picks * 100, 1) if picks else 0.0,
        "pick_rate": round(picks / total_runs * 100, 1) if total_runs else 0.0,
        "total_runs": total_runs,
        "by_character": by_character,
        "last_submitted_at": agg["last_submitted_at"],
        "last_run_hash": agg["last_run_hash"],
    }
