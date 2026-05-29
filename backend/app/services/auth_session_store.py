"""Shared store for in-flight Steam OpenID sign-in sessions.

The Steam flow is a rendezvous: /start (or /redirect) mints a session id,
Steam returns the user to /callback with that id, and the overlay polls
/poll for the resolved identity. In production uvicorn runs with
`--workers N`, so those three requests can each land on a different
process. A per-process dict therefore breaks the rendezvous: the callback
can't find the session /start created, and the web flow silently lands on
/profile signed-out.

When MONGO_URL is set we keep sessions in a Mongo collection with a TTL
index so every worker sees the same state. Without Mongo (local dev, which
runs a single uvicorn worker) we fall back to an in-memory dict, preserving
the original behavior.
"""

from __future__ import annotations

import os
import secrets
import time
from datetime import datetime, timezone

SESSION_TTL_SECONDS = 300
MAX_SESSIONS = 5000  # in-memory cap only; Mongo uses a TTL index
_COLLECTION_NAME = "steam_auth_sessions"

_SESSION_FIELDS = (
    "steamid",
    "persona_name",
    "user_id",
    "token",
    "needs_email",
    "error",
)


def _use_mongo() -> bool:
    return bool(os.environ.get("MONGO_URL", "").strip())


def _blank_session() -> dict:
    return {
        "steamid": None,
        "persona_name": None,
        "user_id": None,
        "token": None,
        "needs_email": False,
        "error": None,
    }


# ── Mongo-backed store ───────────────────────────────────────────────────
_indexed = False


def _coll():
    global _indexed
    from .runs_db_mongo import get_database

    coll = get_database()[_COLLECTION_NAME]
    if not _indexed:
        # Lazily delete expired docs server-side. Mongo's TTL monitor runs
        # ~every 60s, so a session can outlive the TTL briefly; get_session
        # enforces the precise cutoff on read.
        coll.create_index("created_at", expireAfterSeconds=SESSION_TTL_SECONDS)
        _indexed = True
    return coll


# ── In-memory store (no Mongo / single worker) ───────────────────────────
_mem: dict[str, dict] = {}


def _purge_mem() -> None:
    cutoff = time.time() - SESSION_TTL_SECONDS
    stale = [sid for sid, s in _mem.items() if s["created_at"] < cutoff]
    for sid in stale:
        _mem.pop(sid, None)


# ── Public API ───────────────────────────────────────────────────────────
def create_session() -> str:
    sid = secrets.token_urlsafe(24)
    if _use_mongo():
        doc = _blank_session()
        doc["_id"] = sid
        doc["created_at"] = datetime.now(timezone.utc)
        _coll().insert_one(doc)
        return sid

    _purge_mem()
    if len(_mem) >= MAX_SESSIONS:
        oldest = min(_mem.items(), key=lambda kv: kv[1]["created_at"])
        _mem.pop(oldest[0], None)
    session = _blank_session()
    session["created_at"] = time.time()
    _mem[sid] = session
    return sid


def get_session(sid: str) -> dict | None:
    if not sid:
        return None
    if _use_mongo():
        doc = _coll().find_one({"_id": sid})
        if not doc:
            return None
        created = doc.get("created_at")
        if isinstance(created, datetime):
            age = (datetime.now(timezone.utc) - created).total_seconds()
            if age > SESSION_TTL_SECONDS:
                _coll().delete_one({"_id": sid})
                return None
        return doc

    _purge_mem()
    return _mem.get(sid)


def update_session(sid: str, **fields) -> None:
    updates = {k: v for k, v in fields.items() if k in _SESSION_FIELDS}
    if not updates:
        return
    if _use_mongo():
        _coll().update_one({"_id": sid}, {"$set": updates})
        return
    session = _mem.get(sid)
    if session is not None:
        session.update(updates)


def pop_session(sid: str) -> dict | None:
    if not sid:
        return None
    if _use_mongo():
        return _coll().find_one_and_delete({"_id": sid})
    return _mem.pop(sid, None)
