"""Competitive runs that were started, so one that never sends a clean replay
still counts.

The mod posts a start when a run begins with competitive mode on. A replay
that arrives later settles it with the judge's verdict. A start left open
past COMPETITIVE_FORFEIT_HOURS becomes a forfeit: its run, if one uploaded
without a replay, is marked flagged ("no_replay"); with no run at all the
start itself is the record of the loss (state "forfeit", run_hash None).
A replay that shows up after that still wins and overwrites the forfeit.
"""

import logging
import os
from datetime import datetime, timedelta, timezone

from pymongo import ASCENDING

from . import replay_competitive

logger = logging.getLogger(__name__)

FORFEIT_HOURS = float(os.environ.get("COMPETITIVE_FORFEIT_HOURS", "") or 24)
SWEEP_BATCH = 500
_coll_cache = None


class BadStart(Exception):
    pass


def _runs():
    from .runs_db_mongo import _get_collection

    return _get_collection()


def _starts():
    global _coll_cache
    if _coll_cache is None:
        coll = _runs().database["competitive_starts"]
        try:
            coll.create_index(
                [("state", ASCENDING), ("started_at", ASCENDING)], name="open_starts"
            )
            coll.create_index(
                [("state", ASCENDING), ("bracket", ASCENDING)], name="state_bracket"
            )
        except Exception:
            pass
        _coll_cache = coll
    return _coll_cache


def _owner(user: dict) -> str:
    return str(user.get("steam_id") or "") or str(user.get("_id") or "")


def start_id(user: dict, seed, start_time) -> str | None:
    owner = _owner(user)
    try:
        when = int(start_time or 0)
    except (TypeError, ValueError):
        return None
    seed = str(seed or "")
    if not owner or not seed or when <= 0:
        return None
    return f"{owner}:{seed}:{when}"


def _count(value, cap: int) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return 0
    return max(0, min(int(value), cap))


def record_start(user: dict, body: dict) -> dict:
    """Idempotent: the mod sends it again each time the run is continued."""
    if not isinstance(body, dict):
        raise BadStart("body must be an object")
    seed = str(body.get("seed") or "")[:64]
    key = start_id(user, seed, body.get("start_time"))
    if key is None:
        raise BadStart("seed and start_time are required")
    game_mode = str(body.get("game_mode") or "")[:32].lower()
    ascension = _count(body.get("ascension"), 99)
    players = _count(body.get("player_count"), 16) or 1
    modifiers = _count(body.get("modifiers"), 99)
    bracket = replay_competitive.bracket_for(game_mode, ascension, players, modifiers)
    doc = {
        "steam_id": str(user.get("steam_id") or "") or None,
        "user_id": user.get("_id"),
        "seed": seed,
        "start_time": int(body["start_time"]),
        "character": str(body.get("character") or "")[:64].upper() or None,
        "game_mode": game_mode or None,
        "ascension": ascension,
        "player_count": players,
        "modifiers": modifiers,
        "bracket": bracket,
        "state": "open",
        "run_hash": None,
        "started_at": datetime.now(timezone.utc),
    }
    _starts().update_one({"_id": key}, {"$setOnInsert": doc}, upsert=True)
    return {"success": True, "bracket": bracket}


def settle(
    user: dict, header: dict, run_hash: str, verdict: dict | None
) -> dict | None:
    """Close the start a replay belongs to. A replay that claims the mode was
    never on, for a run that was started in it, is flagged as toggled."""
    key = start_id(user, header.get("seed"), header.get("start_time"))
    if key is None:
        return verdict
    start = _starts().find_one({"_id": key})
    if not start:
        return verdict
    if verdict is None:
        verdict = {
            "state": "flagged",
            "bracket": start.get("bracket"),
            "reasons": ["toggled"],
            "mods": [],
            "commands": [],
            "crash_recoveries": 0,
            "unexplained_exits": 0,
            "check_version": replay_competitive.CHECK_VERSION,
        }
    _starts().update_one(
        {"_id": key},
        {
            "$set": {
                "state": "judged",
                "run_hash": run_hash,
                "settled_at": datetime.now(timezone.utc),
            }
        },
    )
    return verdict


def _run_for(start: dict) -> dict | None:
    owner = start.get("steam_id")
    if not owner:
        return None
    played = datetime.fromtimestamp(int(start["start_time"]), timezone.utc)
    return _runs().find_one(
        {"seed": start.get("seed"), "steam_id": owner, "played_at": played},
        {
            "competitive": 1,
            "game_mode": 1,
            "ascension": 1,
            "player_count": 1,
            "deleted_at": 1,
        },
    )


def forfeit_stale(now: datetime | None = None) -> int:
    """Turn starts left open past the window into forfeits. Returns how many."""
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=FORFEIT_HOURS)
    starts = list(
        _starts()
        .find({"state": "open", "started_at": {"$lt": cutoff}})
        .limit(SWEEP_BATCH)
    )
    done = 0
    for start in starts:
        try:
            run = _run_for(start)
            state, run_hash = "forfeit", None
            if run and not run.get("deleted_at"):
                run_hash = str(run["_id"])
                if run.get("competitive"):
                    state = "judged"
                else:
                    bracket = replay_competitive.bracket_for(
                        run.get("game_mode"),
                        run.get("ascension"),
                        run.get("player_count"),
                        int(start.get("modifiers") or 0),
                    )
                    reasons = ["no_replay"] + ([] if bracket else ["bracket"])
                    _runs().update_one(
                        {"_id": run["_id"]},
                        {
                            "$set": {
                                "competitive": "flagged",
                                "competitive_bracket": bracket,
                                "competitive_reasons": reasons,
                            }
                        },
                    )
            _starts().update_one(
                {"_id": start["_id"], "state": "open"},
                {"$set": {"state": state, "run_hash": run_hash, "settled_at": now}},
            )
            done += 1
        except Exception as e:
            logger.error(
                "competitive forfeit failed for %s: %s", start.get("_id"), str(e)[:300]
            )
    return done
