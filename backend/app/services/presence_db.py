"""Live presence ("who is in a run right now") storage.

One Mongo doc per actively-playing player, upserted by the in-game mod's ~30s heartbeat
and expired by a TTL index ~90s after the last beat, so crashes and quits fall off the
list on their own. Mongo-only: without MONGO_URL the presence endpoints return 503 and
nothing else depends on this module.

Document shape (one doc per live player):

    {
        "_id": <steam_id>,
        "username": ..., "character": ..., "ascension": ...,
        "act": ..., "act_floor": ..., "total_floor": ...,
        "hp": ..., "max_hp": ..., "gold": ..., "screen": ..., "seed": ...,
        "player_count": ..., "sts2_version": ...,
        "deck": ["STRIKE+", ...], "relics": [...], "potions": [...],
        "started_at": ISODate(...),   # first heartbeat of this session
        "updated_at": ISODate(...),   # last heartbeat (TTL anchor)
    }
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

PRESENCE_TTL_SECONDS = 90

_coll = None  # lazy — set by _presence_coll


def _presence_coll():
    global _coll
    if _coll is None:
        from .runs_db_mongo import get_database

        coll = get_database().presence
        # Mongo's TTL sweep only runs ~every 60s, so reads also filter by freshness.
        coll.create_index("updated_at", expireAfterSeconds=PRESENCE_TTL_SECONDS)
        _coll = coll
    return _coll


def heartbeat(steam_id: str, fields: dict[str, Any]) -> None:
    now = datetime.now(timezone.utc)
    _presence_coll().update_one(
        {"_id": steam_id},
        {"$set": {**fields, "updated_at": now}, "$setOnInsert": {"started_at": now}},
        upsert=True,
    )


def end(steam_id: str) -> None:
    _presence_coll().delete_one({"_id": steam_id})


def active(limit: int = 50) -> list[dict]:
    """Fresh live players, deepest run first. Excludes deck/relic/potion detail —
    the per-player endpoint serves those for the live run view."""
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=PRESENCE_TTL_SECONDS)
    docs = (
        _presence_coll()
        .find({"updated_at": {"$gte": cutoff}}, {"deck": 0, "relics": 0, "potions": 0})
        .sort([("total_floor", -1), ("updated_at", -1)])
        .limit(limit)
    )
    return [_public(d) for d in docs]


def get(steam_id: str) -> dict | None:
    """One player's full live doc (incl. deck/relics/potions), or None when not live."""
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=PRESENCE_TTL_SECONDS)
    d = _presence_coll().find_one({"_id": steam_id, "updated_at": {"$gte": cutoff}})
    return _public(d) if d else None


def _public(d: dict) -> dict:
    d = dict(d)
    d["steam_id"] = d.pop("_id")
    for k in ("updated_at", "started_at"):
        if isinstance(d.get(k), datetime):
            d[k] = d[k].replace(tzinfo=timezone.utc).isoformat()
    return d
