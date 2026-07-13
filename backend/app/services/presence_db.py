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

# Cap on the gap credited to a player's all-time live total per heartbeat. The
# mod beats ~every 30s; anything longer (a missed beat streak, or a crash/quit
# and a later return) is treated as a break and not counted, so the total
# tracks real continuous play rather than wall-clock between sessions.
CREDIT_CAP_SECONDS = 150

_coll = None  # lazy — set by _presence_coll
_totals_coll = None  # lazy — set by _live_totals_coll
_meta_coll = None  # lazy — set by _live_meta_coll


def _presence_coll():
    global _coll
    if _coll is None:
        from .runs_db_mongo import get_database

        coll = get_database().presence
        # Mongo's TTL sweep only runs ~every 60s, so reads also filter by freshness.
        coll.create_index("updated_at", expireAfterSeconds=PRESENCE_TTL_SECONDS)
        _coll = coll
    return _coll


def _live_totals_coll():
    """Permanent per-player accumulator of live seconds (no TTL), keyed by
    steam_id like the presence doc. Fed by _credit_live_time on each heartbeat."""
    global _totals_coll
    if _totals_coll is None:
        from .runs_db_mongo import get_database

        coll = get_database().live_totals
        coll.create_index("total_seconds")
        _totals_coll = coll
    return _totals_coll


def _live_meta_coll():
    """Small key/value collection for live-stats singletons (currently just the
    all-time peak of concurrent players). No TTL."""
    global _meta_coll
    if _meta_coll is None:
        from .runs_db_mongo import get_database

        _meta_coll = get_database().live_meta
    return _meta_coll


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
    res = _presence_coll().update_one({"_id": steam_id}, update, upsert=True)
    _credit_live_time(steam_id, fields.get("username"), now)
    # A new presence doc means a session just started, i.e. concurrency ticked
    # up — the only moment the peak can rise. Existing players' beats are updates
    # and skip the count entirely.
    if res.upserted_id is not None:
        note_peak(now)


def _credit_live_time(steam_id: str, username: str | None, now: datetime) -> None:
    """Add the time since this player's previous heartbeat to their all-time live
    total. Best-effort: accounting never breaks a heartbeat. Gaps longer than
    CREDIT_CAP_SECONDS (a crash/quit and a later return) aren't counted, so the
    total reflects real continuous play. Because credit accrues per beat, it
    captures sessions that end by crash/TTL, not just clean stops."""
    try:
        from pymongo import ReturnDocument

        set_fields: dict[str, Any] = {"last_seen": now}
        if username:
            set_fields["username"] = username
        prev = _live_totals_coll().find_one_and_update(
            {"_id": steam_id},
            {
                "$set": set_fields,
                "$setOnInsert": {"first_seen": now, "total_seconds": 0},
            },
            upsert=True,
            return_document=ReturnDocument.BEFORE,
        )
        last = (prev or {}).get("last_seen")
        if isinstance(last, datetime):
            delta = (now - last.replace(tzinfo=timezone.utc)).total_seconds()
            if 0 < delta <= CREDIT_CAP_SECONDS:
                _live_totals_coll().update_one(
                    {"_id": steam_id}, {"$inc": {"total_seconds": int(delta)}}
                )
    except Exception:
        pass


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
                "pets": 0,
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


def current_summary(limit: int = 50) -> list[dict]:
    """Live roster for the admin view: who's playing, their depth, and how long
    the current session has run (seconds). Deepest run first. Empty on error."""
    try:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=PRESENCE_TTL_SECONDS)
        docs = (
            _presence_coll()
            .find(
                {"updated_at": {"$gte": cutoff}},
                {
                    "username": 1,
                    "character": 1,
                    "ascension": 1,
                    "total_floor": 1,
                    "act": 1,
                    "started_at": 1,
                },
            )
            .sort([("total_floor", -1), ("updated_at", -1)])
            .limit(limit)
        )
        out: list[dict] = []
        for d in docs:
            started = d.get("started_at")
            secs = (
                int((now - started.replace(tzinfo=timezone.utc)).total_seconds())
                if isinstance(started, datetime)
                else None
            )
            out.append(
                {
                    "steam_id": str(d.get("_id")),
                    "username": d.get("username"),
                    "character": d.get("character"),
                    "ascension": d.get("ascension"),
                    "total_floor": d.get("total_floor"),
                    "act": d.get("act"),
                    "session_seconds": secs,
                }
            )
        return out
    except Exception:
        return []


def top_live_totals(limit: int = 20) -> list[dict]:
    """All-time cumulative live seconds per player, highest first. Empty on error."""
    try:
        rows = (
            _live_totals_coll()
            .find({}, {"username": 1, "total_seconds": 1, "last_seen": 1})
            .sort("total_seconds", -1)
            .limit(limit)
        )
        out: list[dict] = []
        for r in rows:
            last = r.get("last_seen")
            out.append(
                {
                    "steam_id": str(r.get("_id")),
                    "username": r.get("username"),
                    "total_seconds": int(r.get("total_seconds") or 0),
                    "last_seen": last.replace(tzinfo=timezone.utc).isoformat()
                    if isinstance(last, datetime)
                    else None,
                }
            )
        return out
    except Exception:
        return []


def note_peak(now: datetime | None = None) -> None:
    """Bump the all-time peak of concurrent live players when the current count
    exceeds it. Cheap: an indexed count plus a write only when a new high is set.
    Called on each new session (a heartbeat insert) and when the admin live view
    is polled, so the mark is captured whether or not anyone is watching."""
    try:
        now = now or datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=PRESENCE_TTL_SECONDS)
        current = _presence_coll().count_documents({"updated_at": {"$gte": cutoff}})
        doc = _live_meta_coll().find_one({"_id": "peak_concurrent"})
        if not doc or current > int(doc.get("value") or 0):
            _live_meta_coll().update_one(
                {"_id": "peak_concurrent"},
                {"$set": {"value": current, "at": now}},
                upsert=True,
            )
    except Exception:
        pass


def peak_concurrent() -> dict | None:
    """The all-time high-water mark of simultaneous live players, or None."""
    try:
        d = _live_meta_coll().find_one({"_id": "peak_concurrent"})
        if not d:
            return None
        at = d.get("at")
        return {
            "value": int(d.get("value") or 0),
            "at": at.replace(tzinfo=timezone.utc).isoformat()
            if isinstance(at, datetime)
            else None,
        }
    except Exception:
        return None


def _public(d: dict) -> dict:
    d = dict(d)
    d["steam_id"] = d.pop("_id")
    for k in ("updated_at", "started_at"):
        if isinstance(d.get(k), datetime):
            d[k] = d[k].replace(tzinfo=timezone.utc).isoformat()
    return d
