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
        "turn": ..., "fighting": [...],        # combat context (absent between fights)
        "events": [{k, v, turn, t}, ...],      # rolling play-by-play window
        "map": {act, nodes, edges}, "path": [[col,row], ...], "pos": [col,row],
        "event": {id, title, prompt, options}, # live event (only in an event room)
        "shop": {cards, relics, potions, removal},  # shop inventory (only in a merchant)
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


# Rolling per-player window of ticker events ("played X", "fighting Y"); old entries
# fall off as new beats arrive, and the whole doc still dies with the 90s TTL.
EVENT_WINDOW = 50


def heartbeat(
    steam_id: str,
    fields: dict[str, Any],
    events: list[dict] | None = None,
    unset: list[str] | None = None,
) -> None:
    now = datetime.now(timezone.utc)
    update: dict[str, Any] = {
        "$set": {**fields, "updated_at": now},
        "$setOnInsert": {"started_at": now},
    }
    # Clear transient fields the mod explicitly nulled (combat just ended), so the
    # roster never shows a stale "Turn 7 vs Gremlin Nob" for someone now in a shop.
    # unset keys never overlap $set (the router only unsets keys it left out of fields).
    if unset:
        update["$unset"] = {k: "" for k in unset}
    if events:
        update["$push"] = {"events": {"$each": events, "$slice": -EVENT_WINDOW}}
    _presence_coll().update_one({"_id": steam_id}, update, upsert=True)


def end(steam_id: str) -> None:
    _presence_coll().delete_one({"_id": steam_id})


def active(limit: int = 50) -> list[dict]:
    """Fresh live players, deepest run first. Excludes the heavy per-run detail
    (deck/relics/potions, the event window, the map node/edge graph, the combat
    hand, the act route, loot, floor history, co-op seats, and the local player's
    powers): the
    per-player endpoint serves those for the live run view. Keeps path/pos so the
    roster can show a player's position on a mini progress indicator. The light
    scalars (run_time/block/energy/damage/pile counts) stay for a richer card."""
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=PRESENCE_TTL_SECONDS)
    docs = (
        _presence_coll()
        .find(
            {"updated_at": {"$gte": cutoff}},
            {
                "deck": 0,
                "relics": 0,
                "potions": 0,
                "events": 0,
                "map": 0,
                "reveals": 0,
                "event": 0,
                "shop": 0,
                "rest": 0,
                "death": 0,
                "enemies": 0,
                "hand": 0,
                "draw_pile": 0,
                "discard_pile": 0,
                "exhaust_pile": 0,
                "route": 0,
                "loot": 0,
                "floor_history": 0,
                "players": 0,
                "player_powers": 0,
                "orbs": 0,
            },
        )
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
