"""Admin views over the replay store: filtered listing, per-replay detail,
upload/ingest stats, and the operator actions (re-queue, soft delete,
restore). Never returns the blob itself; the router streams that separately.
"""

import re
from collections import Counter
from datetime import datetime, timedelta, timezone

from bson import ObjectId

from . import replays_db
from .timeutil import pacific_date

STATES = ("pending", "claimed", "retry", "quarantined", "done", "deleted")

_LIST_FIELDS = {
    "sha256": 1,
    "gz_bytes": 1,
    "raw_bytes": 1,
    "lines": 1,
    "replay_version": 1,
    "mod_version": 1,
    "character": 1,
    "ascension": 1,
    "win": 1,
    "game_mode": 1,
    "build_id": 1,
    "player_count": 1,
    "player_idx": 1,
    "seed": 1,
    "played_at": 1,
    "steam_id": 1,
    "user_id": 1,
    "submitted_at": 1,
    "deleted_at": 1,
    "ingest_state": 1,
    "attempts": 1,
    "error": 1,
    "ingested_at": 1,
    "exploder_version": 1,
    "batch_id": 1,
    "published": 1,
}

_STATS_FIELDS = {
    "ingest_state": 1,
    "deleted_at": 1,
    "replay_version": 1,
    "mod_version": 1,
    "character": 1,
    "submitted_at": 1,
    "gz_bytes": 1,
}


class AdminReplayError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _iso(v):
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v.isoformat().replace("+00:00", "Z")
    return v


def state_of(doc: dict) -> str:
    if doc.get("deleted_at"):
        return "deleted"
    return doc.get("ingest_state") or "pending"


def _user_ids(value):
    out = [value]
    if isinstance(value, str) and ObjectId.is_valid(value):
        out.append(ObjectId(value))
    return out


def _state_filter(state: str | None) -> dict:
    if state is None or state == "all":
        return {} if state == "all" else {"deleted_at": None}
    if state not in STATES:
        raise AdminReplayError(400, f"unknown state {state!r}")
    if state == "deleted":
        return {"deleted_at": {"$ne": None}}
    if state == "pending":
        return {"deleted_at": None, "ingest_state": None}
    return {"deleted_at": None, "ingest_state": state}


def _parse_when(value: str | None, name: str):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise AdminReplayError(400, f"{name} must be an ISO 8601 date or datetime")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _user_filter(user: str | None) -> dict | None:
    q = (user or "").strip()
    if not q:
        return None
    if q.isdigit() and len(q) == 17:
        return {"steam_id": q}
    if ObjectId.is_valid(q):
        return {"user_id": {"$in": _user_ids(q)}}
    pattern = "^" + re.escape(q) + "$"
    ids: list = []
    for run in replays_db._runs().find(
        {"username": {"$regex": pattern, "$options": "i"}}, {"user_id": 1}
    ):
        uid = run.get("user_id")
        if uid is not None:
            ids.extend(_user_ids(uid) if isinstance(uid, str) else [uid, str(uid)])
    return {"user_id": {"$in": ids}}


def build_query(
    state: str | None = None,
    run_hash: str | None = None,
    user: str | None = None,
    character: str | None = None,
    replay_version: int | None = None,
    mod_version: str | None = None,
    win: bool | None = None,
    since: str | None = None,
    until: str | None = None,
) -> dict:
    query = _state_filter(state)
    if run_hash:
        query["_id"] = run_hash.strip()
    uf = _user_filter(user)
    if uf:
        query.update(uf)
    if character:
        query["character"] = character.strip().upper()
    if replay_version is not None:
        query["replay_version"] = replay_version
    if mod_version:
        query["mod_version"] = mod_version.strip()
    if win is not None:
        query["win"] = win
    lo, hi = _parse_when(since, "since"), _parse_when(until, "until")
    if lo or hi:
        rng = {}
        if lo:
            rng["$gte"] = lo
        if hi:
            rng["$lte"] = hi
        query["submitted_at"] = rng
    return query


def _usernames(docs: list[dict]) -> dict[str, str]:
    hashes = [d["_id"] for d in docs]
    if not hashes:
        return {}
    out: dict[str, str] = {}
    runs = replays_db._runs().find(
        {"$or": [{"_id": {"$in": hashes}}, {"run_hash": {"$in": hashes}}]},
        {"run_hash": 1, "username": 1, "user_id": 1, "hidden": 1},
    )
    by_hash: dict[str, list[dict]] = {}
    for r in runs:
        h = r.get("run_hash") or r.get("_id")
        by_hash.setdefault(h, []).append(r)
    for d in docs:
        cands = by_hash.get(d["_id"]) or []
        pick = next(
            (r for r in cands if str(r.get("user_id")) == str(d.get("user_id"))),
            cands[0] if cands else None,
        )
        if pick:
            out[d["_id"]] = pick
    return out


def shape(doc: dict, run: dict | None = None) -> dict:
    run = run or {}
    published = doc.get("published") or {}
    return {
        "run_hash": doc["_id"],
        "state": state_of(doc),
        "username": run.get("username"),
        "run_hidden": bool(run.get("hidden")),
        "steam_id": doc.get("steam_id"),
        "user_id": str(doc["user_id"]) if doc.get("user_id") is not None else None,
        "character": doc.get("character"),
        "ascension": doc.get("ascension"),
        "win": doc.get("win"),
        "game_mode": doc.get("game_mode"),
        "player_count": doc.get("player_count"),
        "player_idx": doc.get("player_idx"),
        "build_id": doc.get("build_id"),
        "seed": doc.get("seed"),
        "replay_version": doc.get("replay_version"),
        "mod_version": doc.get("mod_version"),
        "lines": doc.get("lines"),
        "gz_bytes": doc.get("gz_bytes"),
        "raw_bytes": doc.get("raw_bytes"),
        "sha256": doc.get("sha256"),
        "played_at": _iso(doc.get("played_at")),
        "submitted_at": _iso(doc.get("submitted_at")),
        "ingested_at": _iso(doc.get("ingested_at")),
        "deleted_at": _iso(doc.get("deleted_at")),
        "attempts": doc.get("attempts") or 0,
        "error": doc.get("error"),
        "exploder_version": doc.get("exploder_version"),
        "batch_id": doc.get("batch_id"),
        "published_versions": sorted(published.keys()),
        "viewer_url": f"/runs/{doc['_id']}/replay",
    }


def list_replays(page: int = 1, limit: int = 50, **filters) -> dict:
    page = max(1, page)
    limit = max(1, min(limit, 100))
    query = build_query(**filters)
    coll = replays_db._coll()
    total = coll.count_documents(query)
    docs = list(
        coll.find(query, _LIST_FIELDS)
        .sort([("submitted_at", -1)])
        .skip((page - 1) * limit)
        .limit(limit)
    )
    runs = _usernames(docs)
    return {
        "replays": [shape(d, runs.get(d["_id"])) for d in docs],
        "total": total,
        "page": page,
        "limit": limit,
        "states": list(STATES),
    }


def get_replay(run_hash: str) -> dict:
    doc = replays_db._coll().find_one({"_id": run_hash}, _LIST_FIELDS)
    if not doc:
        raise AdminReplayError(404, "replay not found")
    runs = _usernames([doc])
    return shape(doc, runs.get(run_hash))


def stats(days: int = 14) -> dict:
    days = max(1, min(days, 90))
    by_state: Counter = Counter()
    by_version: Counter = Counter()
    by_mod: Counter = Counter()
    by_character: Counter = Counter()
    per_day: Counter = Counter()
    total_bytes = 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    for doc in replays_db._coll().find({}, _STATS_FIELDS):
        st = state_of(doc)
        by_state[st] += 1
        if st == "deleted":
            continue
        by_version[str(doc.get("replay_version"))] += 1
        by_mod[str(doc.get("mod_version"))] += 1
        by_character[str(doc.get("character"))] += 1
        total_bytes += doc.get("gz_bytes") or 0
        sub = doc.get("submitted_at")
        if isinstance(sub, datetime):
            if sub.tzinfo is None:
                sub = sub.replace(tzinfo=timezone.utc)
            if sub >= cutoff:
                d = pacific_date(sub)
                if d:
                    per_day[d.isoformat()] += 1
    return {
        "total": sum(by_state.values()),
        "by_state": {s: by_state.get(s, 0) for s in STATES},
        "by_replay_version": dict(sorted(by_version.items())),
        "by_mod_version": dict(sorted(by_mod.items())),
        "by_character": dict(by_character.most_common()),
        "per_day": [{"day": k, "uploads": v} for k, v in sorted(per_day.items())],
        "days": days,
        "stored_gz_bytes": total_bytes,
    }


def requeue(run_hash: str) -> dict:
    coll = replays_db._coll()
    doc = coll.find_one({"_id": run_hash}, {"ingest_state": 1, "deleted_at": 1})
    if not doc:
        raise AdminReplayError(404, "replay not found")
    if doc.get("deleted_at"):
        raise AdminReplayError(409, "restore the replay before re-queueing it")
    if doc.get("ingest_state") == "claimed":
        raise AdminReplayError(409, "an ingest run currently holds this replay")
    coll.update_one(
        {"_id": run_hash},
        {
            "$set": {
                "ingest_state": None,
                "attempts": 0,
                "error": None,
                "lease_expires_at": None,
                "batch_id": None,
            }
        },
    )
    return get_replay(run_hash)


def soft_delete(run_hash: str) -> dict:
    coll = replays_db._coll()
    if not coll.find_one({"_id": run_hash}, {"_id": 1}):
        raise AdminReplayError(404, "replay not found")
    coll.update_one(
        {"_id": run_hash, "deleted_at": None},
        {"$set": {"deleted_at": datetime.now(timezone.utc)}},
    )
    replays_db._runs().update_one({"_id": run_hash}, {"$unset": {"has_replay": ""}})
    return get_replay(run_hash)


def restore(run_hash: str) -> dict:
    coll = replays_db._coll()
    if not coll.find_one({"_id": run_hash}, {"_id": 1}):
        raise AdminReplayError(404, "replay not found")
    coll.update_one({"_id": run_hash}, {"$set": {"deleted_at": None}})
    replays_db._runs().update_one({"_id": run_hash}, {"$set": {"has_replay": True}})
    return get_replay(run_hash)


def blob(run_hash: str) -> tuple[bytes, str]:
    doc = replays_db._coll().find_one({"_id": run_hash}, {"blob": 1, "sha256": 1})
    if not doc:
        raise AdminReplayError(404, "replay not found")
    return bytes(doc["blob"]), doc.get("sha256") or ""
