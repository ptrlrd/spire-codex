"""Moderator review queue for suspicious wins.

Candidates come from a handful of index-walked, time-limited queries (the
fastest visible wins overall and the top of each speed board), get scored
on cheap stored facts, and the page that is returned is checked against the
submit-time detector. Clearing a run stamps it so it never comes back."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from .cheat_detect import MIN_WIN_SECONDS, detect_cheats

logger = logging.getLogger("spire-codex.cheat-review")

QUERY_MS = 2000
DEADLINE_SECONDS = 10.0
FAST_POOL = 200
FAST_POOL_MAX_SECONDS = 1800
BOARD_DEPTH = 10
COOP_SIZES = (2, 3, 4)
PLAYER_HIDE_MAX = 5000
MOD_PREFIX = "mod:"
OWNER_HIDDEN = "owner"

_WINS = {"$in": [True, 1]}
_FAST_HINT = "win_runtime"
_SOLO_HINT = [
    ("win", 1),
    ("game_mode", 1),
    ("character", 1),
    ("player_count", 1),
    ("run_time", 1),
]
_COOP_HINT = [("win", 1), ("game_mode", 1), ("player_count", 1), ("run_time", 1)]
_ROW_FIELDS = {
    "seed": 1,
    "character": 1,
    "ascension": 1,
    "game_mode": 1,
    "player_count": 1,
    "run_time": 1,
    "floors_reached": 1,
    "username": 1,
    "username_lower": 1,
    "user_id": 1,
    "steam_id": 1,
    "build_id": 1,
    "submitted_at": 1,
    "played_at": 1,
    "has_replay": 1,
    "deck_size": 1,
    "relic_count": 1,
    "review_cleared_at": 1,
}
_STATE_FIELDS = {
    "seed": 1,
    "player_count": 1,
    "run_time": 1,
    "hidden": 1,
    "hidden_reason": 1,
    "hidden_before": 1,
    "deleted_at": 1,
    "character": 1,
    "win": 1,
    "was_abandoned": 1,
    "ascension": 1,
    "user_id": 1,
    "steam_id": 1,
    "username": 1,
    "username_lower": 1,
}


def _coll():
    from .runs_db_mongo import get_database

    return get_database()["runs"]


def _characters() -> dict[str, str]:
    from .charts_stats import _official_characters
    from .runs_db_mongo import OFFICIAL_CHARACTERS

    return _official_characters() or {c: c.title() for c in OFFICIAL_CHARACTERS}


def _fastest(coll, extra: dict, hint, limit: int) -> list[dict]:
    query = {
        "win": _WINS,
        **extra,
        "hidden": {"$ne": True},
        "deleted_at": None,
    }
    query.setdefault("run_time", {"$gt": 0})
    return list(
        coll.find(query, _ROW_FIELDS)
        .sort("run_time", 1)
        .limit(limit)
        .hint(hint)
        .max_time_ms(QUERY_MS)
    )


def _group_key(doc: dict) -> str:
    if int(doc.get("player_count") or 1) > 1:
        return f"{doc.get('seed')}|{doc.get('run_time')}|{doc.get('player_count')}"
    return str(doc["_id"])


def _iso(value) -> str | None:
    return value.isoformat() if hasattr(value, "isoformat") else None


def _player_key(doc: dict) -> str | None:
    if doc.get("user_id"):
        return f"u:{doc['user_id']}"
    if doc.get("steam_id"):
        return f"s:{doc['steam_id']}"
    name = doc.get("username_lower") or (doc.get("username") or "").lower()
    return f"n:{name}" if name else None


def _seat(doc: dict, winrates: dict) -> dict:
    name = doc.get("username_lower") or (doc.get("username") or "").lower()
    tally = winrates.get(name) if name else None
    runs = int(tally[0]) if tally else None
    wins = int(tally[1]) if tally else None
    return {
        "run_hash": str(doc["_id"]),
        "character": doc.get("character"),
        "username": doc.get("username"),
        "user_id": str(doc["user_id"]) if doc.get("user_id") else None,
        "steam_id": doc.get("steam_id"),
        "player_key": _player_key(doc),
        "runs": runs,
        "wins": wins,
        "has_replay": bool(doc.get("has_replay")),
    }


def _time_points(run_time: int) -> int:
    if run_time < 420:
        return 40
    if run_time < 600:
        return 30
    if run_time < 900:
        return 20
    if run_time < 1200:
        return 8
    return 0


def _pace_points(pace: float | None) -> int:
    if pace is None:
        return 0
    if pace < 9:
        return 25
    if pace < 13:
        return 15
    if pace < 18:
        return 8
    return 0


def _rank_points(rank: int | None) -> int:
    if not rank:
        return 0
    if rank == 1:
        return 30
    if rank <= 3:
        return 22
    return 12


def score_row(row: dict) -> tuple[int, list[str]]:
    """Suspicion score and the reasons behind it, from the row's own facts."""
    score = 0
    flags: list[str] = []
    run_time = int(row.get("run_time") or 0)
    floors = int(row.get("floors") or 0)
    for reason in row.get("detector") or []:
        score += 60
        flags.append(reason)
    board = row.get("board") or {}
    points = _rank_points(board.get("rank"))
    if points:
        score += points
        flags.append(f"#{board['rank']} {board['label']}")
    points = _time_points(run_time)
    if points:
        score += points
        flags.append(f"win in {run_time // 60}m{run_time % 60:02d}s")
    pace = row.get("seconds_per_floor")
    points = _pace_points(pace)
    if points:
        score += points
        flags.append(f"{pace:.1f}s per floor")
    if 0 < floors < 40 and (row.get("game_mode") or "standard") == "standard":
        score += 25
        flags.append(f"only {floors} floors")
    turns = [t for t in row.get("boss_turns") or [] if isinstance(t, (int, float))]
    if turns and min(turns) <= 2:
        score += 20
        flags.append(f"boss down in {int(min(turns))} turns")
    seats = row.get("seats") or []
    known = [s["runs"] for s in seats if s.get("runs") is not None]
    if not any(s.get("player_key") for s in seats):
        score += 10
        flags.append("anonymous upload")
    elif known and min(known) <= 3:
        score += 15
        flags.append(f"uploader has {min(known)} runs")
    repeats = int(row.get("player_rows") or 0)
    if repeats > 1:
        score += 10
        flags.append(f"{repeats} runs by this player in the queue")
    return score, flags


def _boss_turns(history) -> list[int]:
    turns: list[int] = []
    for act in history or []:
        for floor in act or []:
            if not isinstance(floor, dict):
                continue
            for room in floor.get("rooms") or []:
                if not isinstance(room, dict):
                    continue
                if (room.get("room_type") or "").lower() != "boss":
                    continue
                taken = room.get("turns_taken")
                if isinstance(taken, (int, float)):
                    turns.append(int(taken))
    return turns


def build_rows(pool: list[dict], boards: list[dict], winrates: dict) -> list[dict]:
    """Collapse candidate docs into one row per run (co-op seats share a
    row), attach board ranks and player tallies, and sort by suspicion.
    `boards` is a list of {"label", "docs"} with docs fastest first; cleared
    runs keep their rank there but never become rows."""
    ranks: dict[str, dict] = {}
    by_key: dict[str, list[dict]] = {}
    order: list[str] = []

    def add(doc: dict) -> str:
        key = _group_key(doc)
        seats = by_key.setdefault(key, [])
        if not seats:
            order.append(key)
        if all(s["_id"] != doc["_id"] for s in seats):
            seats.append(doc)
        return key

    for doc in pool:
        add(doc)
    for board in boards:
        seen: list[str] = []
        for doc in board["docs"]:
            key = add(doc)
            if key not in seen:
                seen.append(key)
            rank = seen.index(key) + 1
            best = ranks.get(key)
            if rank <= BOARD_DEPTH and (best is None or rank < best["rank"]):
                ranks[key] = {"label": board["label"], "rank": rank}

    rows: list[dict] = []
    for key in order:
        docs = by_key[key]
        if any(d.get("review_cleared_at") for d in docs):
            continue
        first = docs[0]
        run_time = int(first.get("run_time") or 0)
        floors = int(first.get("floors_reached") or 0)
        rows.append(
            {
                "id": str(first["_id"]),
                "hashes": [str(d["_id"]) for d in docs],
                "seats": [_seat(d, winrates) for d in docs],
                "seed": first.get("seed"),
                "ascension": first.get("ascension"),
                "game_mode": first.get("game_mode") or "standard",
                "player_count": int(first.get("player_count") or 1),
                "run_time": run_time,
                "floors": floors,
                "seconds_per_floor": round(run_time / floors, 1) if floors else None,
                "build_id": first.get("build_id"),
                "played_at": _iso(first.get("played_at")),
                "submitted_at": _iso(first.get("submitted_at")),
                "deck_size": first.get("deck_size"),
                "relic_count": first.get("relic_count"),
                "board": ranks.get(key),
                "detector": [],
                "boss_turns": [],
            }
        )
    per_player: dict[str, int] = {}
    for row in rows:
        for pk in {s["player_key"] for s in row["seats"] if s["player_key"]}:
            per_player[pk] = per_player.get(pk, 0) + 1
    for row in rows:
        row["player_rows"] = max(
            (per_player.get(s["player_key"], 0) for s in row["seats"]), default=0
        )
        row["score"], row["flags"] = score_row(row)
    rows.sort(key=lambda r: (-r["score"], r["run_time"]))
    return rows


def _enrich(coll, rows: list[dict]) -> None:
    ids = [h for row in rows for h in row["hashes"]]
    if not ids:
        return
    stored = {
        d["_id"]: d
        for d in coll.find(
            {"_id": {"$in": ids}},
            {"map_point_history": 1, "relics.id": 1, "deck.id": 1},
        ).max_time_ms(QUERY_MS * 2)
    }
    for row in rows:
        docs = [stored[h] for h in row["hashes"] if h in stored]
        if not docs:
            continue
        history = docs[0].get("map_point_history") or []
        seats = [{"relics": d.get("relics"), "deck": d.get("deck")} for d in docs]
        if row["player_count"] > 1 and len(seats) == 1:
            seats = seats * 2
        reasons = detect_cheats(
            {
                "win": True,
                "run_time": row["run_time"],
                "floors_reached": row["floors"],
                "game_mode": row["game_mode"],
                "map_point_history": history,
                "players": seats,
            }
        )
        row["detector"] = sorted(set(reasons))
        row["boss_turns"] = _boss_turns(history)
        row["score"], row["flags"] = score_row(row)


def review_queue(limit: int = 50) -> dict:
    """The rows most worth a moderator's look, most suspicious first."""
    from .runs_db_mongo import get_user_winrates

    limit = max(1, min(int(limit), 100))
    coll = _coll()
    started = time.monotonic()
    errors: list[str] = []

    def run(label: str, extra: dict, hint, depth: int) -> list[dict]:
        if time.monotonic() - started > DEADLINE_SECONDS:
            errors.append(f"{label}: skipped, out of time")
            return []
        try:
            return _fastest(coll, extra, hint, depth)
        except Exception as exc:
            logger.warning("cheat review query failed: %s", label, exc_info=True)
            errors.append(f"{label}: {type(exc).__name__}")
            return []

    pool = run(
        "fastest wins",
        {
            "run_time": {"$gt": 0, "$lt": FAST_POOL_MAX_SECONDS},
            "review_cleared_at": None,
        },
        _FAST_HINT,
        FAST_POOL,
    )
    boards: list[dict] = []
    for cid, name in sorted(_characters().items()):
        label = f"{name} solo"
        docs = run(
            label,
            {"game_mode": "standard", "character": cid, "player_count": 1},
            _SOLO_HINT,
            BOARD_DEPTH,
        )
        boards.append({"label": label, "docs": docs})
    for size in COOP_SIZES:
        label = f"co-op {size}p"
        docs = run(
            label,
            {"game_mode": "standard", "player_count": size},
            _COOP_HINT,
            BOARD_DEPTH * size,
        )
        boards.append({"label": label, "docs": docs})

    try:
        winrates = get_user_winrates()
    except Exception:
        logger.warning("cheat review winrates unavailable", exc_info=True)
        winrates = {}
    rows = build_rows(pool, boards, winrates)
    total = len(rows)
    rows = rows[:limit]
    try:
        _enrich(coll, rows)
    except Exception as exc:
        logger.warning("cheat review enrich failed", exc_info=True)
        errors.append(f"detector pass: {type(exc).__name__}")
    rows.sort(key=lambda r: (-r["score"], r["run_time"]))
    return {
        "rows": rows,
        "total": total,
        "auto_hide_seconds": MIN_WIN_SECONDS,
        "errors": errors,
        "seconds": round(time.monotonic() - started, 2),
    }


def _with_seats(coll, hashes: list[str]) -> list[dict]:
    """The docs for these hashes plus the other seats of any co-op run."""
    docs = {
        d["_id"]: d
        for d in coll.find({"_id": {"$in": hashes}}, _STATE_FIELDS).max_time_ms(
            QUERY_MS * 2
        )
    }
    for doc in list(docs.values()):
        if int(doc.get("player_count") or 1) <= 1 or not doc.get("seed"):
            continue
        siblings = (
            coll.find(
                {
                    "seed": doc["seed"],
                    "player_count": doc.get("player_count"),
                    "run_time": doc.get("run_time"),
                },
                _STATE_FIELDS,
            )
            .limit(8)
            .max_time_ms(QUERY_MS)
        )
        for sibling in siblings:
            docs.setdefault(sibling["_id"], sibling)
    return list(docs.values())


def _apply_hidden(coll, docs: list[dict], hidden: bool, reason: str | None) -> list:
    from .runs_db_mongo import (
        bump_stats_counters,
        drop_moderation_tombstones,
        evict_run_pages,
    )

    changed = [d for d in docs if bool(d.get("hidden")) != hidden]
    ids = [d["_id"] for d in changed]
    if hidden:
        update: dict = {
            "$set": {"hidden": True, "hidden_reason": reason},
            "$unset": {"hidden_before": ""},
        }
    else:
        update = {"$unset": {"hidden": "", "hidden_reason": "", "hidden_before": ""}}
    for start in range(0, len(ids), 500):
        coll.update_many({"_id": {"$in": ids[start : start + 500]}}, update)
    for doc in changed:
        if not doc.get("deleted_at"):
            bump_stats_counters(doc, -1 if hidden else 1)
    evict_run_pages([str(i) for i in ids])
    if not hidden:
        drop_moderation_tombstones([str(i) for i in ids])
    return ids


def _restamp(coll, docs: list[dict], update: dict) -> list:
    from .runs_db_mongo import evict_run_pages

    ids = [d["_id"] for d in docs]
    for start in range(0, len(ids), 500):
        coll.update_many({"_id": {"$in": ids[start : start + 500]}}, update)
    evict_run_pages([str(i) for i in ids])
    return ids


def mod_reason(reason: str | None) -> str:
    text = " ".join(str(reason or "").split())[:120]
    return MOD_PREFIX + (text or "cheated")


def hide_runs(hashes: list[str], reason: str | None) -> dict:
    coll = _coll()
    ids = _apply_hidden(coll, _with_seats(coll, hashes), True, mod_reason(reason))
    return {"hidden": len(ids), "hashes": ids}


def unhide_runs(hashes: list[str]) -> dict:
    """Undo for the queue: only gives back runs this tool hid."""
    coll = _coll()
    docs = [
        d
        for d in _with_seats(coll, hashes)
        if str(d.get("hidden_reason") or "").startswith(MOD_PREFIX)
    ]
    ids = _apply_hidden(coll, docs, False, None)
    return {"unhidden": len(ids), "hashes": ids}


def set_cleared(hashes: list[str], cleared: bool, by: str | None) -> dict:
    coll = _coll()
    ids = [d["_id"] for d in _with_seats(coll, hashes)]
    if cleared:
        update: dict = {
            "$set": {
                "review_cleared_at": datetime.now(timezone.utc),
                "review_cleared_by": by,
            }
        }
    else:
        update = {"$unset": {"review_cleared_at": "", "review_cleared_by": ""}}
    result = coll.update_many({"_id": {"$in": ids}}, update)
    return {"cleared": cleared, "matched": result.matched_count, "hashes": ids}


def _player_query(doc: dict) -> tuple[dict, str] | None:
    if doc.get("user_id"):
        return {"user_id": doc["user_id"]}, "account"
    if doc.get("steam_id"):
        return {"steam_id": doc["steam_id"]}, "steam id"
    name = doc.get("username_lower") or (doc.get("username") or "").lower()
    if name:
        return {"username_lower": name}, "username"
    return None


def set_player_hidden(run_hash: str, hidden: bool, reason: str | None) -> dict:
    """Hide every run by the player behind one run, or undo exactly that:
    the undo only touches runs carrying the same player reason. Runs the
    player hid themselves take the moderator reason so they cannot unhide
    them, and the undo hands those back as owner-hidden."""
    coll = _coll()
    doc = coll.find_one({"_id": run_hash}, _STATE_FIELDS)
    if not doc:
        return {"error": "Run not found"}
    found = _player_query(doc)
    if not found:
        return {"error": "This run has no player attached"}
    query, matched_on = found
    stamp = mod_reason(f"player: {' '.join(str(reason or '').split()) or 'cheated'}")
    if hidden:
        wanted = {
            **query,
            "$or": [{"hidden": {"$ne": True}}, {"hidden_reason": OWNER_HIDDEN}],
        }
    else:
        wanted = {**query, "hidden": True, "hidden_reason": stamp}
    docs = list(
        coll.find(wanted, _STATE_FIELDS)
        .limit(PLAYER_HIDE_MAX + 1)
        .max_time_ms(QUERY_MS * 5)
    )
    truncated = len(docs) > PLAYER_HIDE_MAX
    docs = docs[:PLAYER_HIDE_MAX]
    if hidden:
        owned = [d for d in docs if d.get("hidden")]
        ids = _apply_hidden(coll, [d for d in docs if not d.get("hidden")], True, stamp)
        ids += _restamp(
            coll,
            owned,
            {"$set": {"hidden_reason": stamp, "hidden_before": OWNER_HIDDEN}},
        )
    else:
        owned = [d for d in docs if d.get("hidden_before") == OWNER_HIDDEN]
        rest = [d for d in docs if d.get("hidden_before") != OWNER_HIDDEN]
        ids = _apply_hidden(coll, rest, False, None)
        ids += _restamp(
            coll,
            owned,
            {
                "$set": {"hidden_reason": OWNER_HIDDEN},
                "$unset": {"hidden_before": ""},
            },
        )
    return {
        "hidden": hidden,
        "changed": len(ids),
        "matched_on": matched_on,
        "player": doc.get("username"),
        "reason": stamp,
        "truncated": truncated,
    }
