"""Mongo-backed storage for the operator dashboard's mutable surfaces.

Feedback and guide submissions historically only flew past as Discord
webhook embeds; the admin inbox needs them queryable later, so the submit
endpoints also drop a copy here. The writes are best effort: a Mongo
hiccup must never fail the user-facing submission, the webhook already
went out. Run deletion lives here too so the router stays thin.

Everything degrades to no-ops/empties on the SQLite path (no MONGO_URL).
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId

logger = logging.getLogger(__name__)

_FEEDBACK_COLLECTION = "feedback_inbox"
_GUIDE_SUBMISSIONS_COLLECTION = "guide_submissions"


def _enabled() -> bool:
    return bool(os.environ.get("MONGO_URL", "").strip())


def _db():
    from .runs_db_mongo import get_database

    return get_database()


def _shape(row: dict) -> dict:
    """Mongo doc -> JSON-safe dict with a string id."""
    row["id"] = str(row.pop("_id"))
    created = row.get("created_at")
    if isinstance(created, datetime):
        row["created_at"] = created.isoformat()
    return row


# ── Feedback inbox ───────────────────────────────────────────


def record_feedback(source: str, payload: dict[str, Any]) -> None:
    """Best-effort copy of a feedback submission for the admin inbox.
    `source` distinguishes the general feedback form from QA card reports."""
    if not _enabled():
        return
    try:
        _db()[_FEEDBACK_COLLECTION].insert_one(
            {
                "source": source,
                "created_at": datetime.now(timezone.utc),
                "resolved": False,
                **payload,
            }
        )
    except Exception:
        logger.warning("feedback inbox write failed", exc_info=True)


def list_feedback(limit: int = 50, include_resolved: bool = False) -> list[dict]:
    if not _enabled():
        return []
    query: dict[str, Any] = {} if include_resolved else {"resolved": {"$ne": True}}
    rows = list(
        _db()[_FEEDBACK_COLLECTION].find(query).sort("created_at", -1).limit(limit)
    )
    return [_shape(r) for r in rows]


def resolve_feedback(item_id: str) -> bool:
    if not _enabled():
        return False
    try:
        oid = ObjectId(item_id)
    except InvalidId:
        return False
    res = _db()[_FEEDBACK_COLLECTION].update_one(
        {"_id": oid}, {"$set": {"resolved": True}}
    )
    return res.modified_count > 0


# ── Guide submission queue ───────────────────────────────────


def record_guide_submission(payload: dict[str, Any]) -> None:
    """Best-effort copy of a guide submission for the moderation queue."""
    if not _enabled():
        return
    try:
        _db()[_GUIDE_SUBMISSIONS_COLLECTION].insert_one(
            {
                "status": "pending",
                "created_at": datetime.now(timezone.utc),
                **payload,
            }
        )
    except Exception:
        logger.warning("guide submission queue write failed", exc_info=True)


def list_pending_guides(limit: int = 50) -> list[dict]:
    if not _enabled():
        return []
    rows = list(
        _db()[_GUIDE_SUBMISSIONS_COLLECTION]
        .find({"status": "pending"})
        .sort("created_at", -1)
        .limit(limit)
    )
    return [_shape(r) for r in rows]


def dismiss_guide_submission(sub_id: str) -> bool:
    if not _enabled():
        return False
    try:
        oid = ObjectId(sub_id)
    except InvalidId:
        return False
    res = _db()[_GUIDE_SUBMISSIONS_COLLECTION].update_one(
        {"_id": oid}, {"$set": {"status": "dismissed"}}
    )
    return res.modified_count > 0


# ── Run deletion ─────────────────────────────────────────────


def delete_run(run_hash: str, runs_dir: Path) -> dict[str, Any]:
    """Remove a submitted run everywhere it lives synchronously: every Mongo
    doc with the hash (multiplayer runs store one doc per player) and the
    blob file. The stats snapshot and leaderboard summaries pick up the
    removal on their next scheduled rebuild."""
    deleted_docs = 0
    if _enabled():
        deleted_docs = _db()["runs"].delete_many({"run_hash": run_hash}).deleted_count
    file_removed = False
    blob = runs_dir / f"{run_hash}.json"
    try:
        if blob.is_file():
            blob.unlink()
            file_removed = True
    except OSError:
        logger.warning("run blob delete failed for %s", run_hash, exc_info=True)
    return {"deleted_docs": deleted_docs, "file_removed": file_removed}


# ── Announcements (the site banner) ──────────────────────────


_ANNOUNCEMENTS_COLLECTION = "announcements"


def list_announcements(active_only: bool = False) -> list[dict]:
    if not _enabled():
        return []
    query = {"active": True} if active_only else {}
    rows = list(
        _db()[_ANNOUNCEMENTS_COLLECTION].find(query).sort("created_at", -1).limit(50)
    )
    return [_shape(r) for r in rows]


def create_announcement(message: str) -> dict:
    """One banner message. Inline links use [label](/href) and the frontend
    renders them as real links; everything else is plain text."""
    doc = {
        "message": message.strip(),
        "active": True,
        "created_at": datetime.now(timezone.utc),
    }
    res = _db()[_ANNOUNCEMENTS_COLLECTION].insert_one(doc)
    doc["_id"] = res.inserted_id
    return _shape(doc)


def toggle_announcement(ann_id: str) -> bool:
    if not _enabled():
        return False
    try:
        oid = ObjectId(ann_id)
    except InvalidId:
        return False
    doc = _db()[_ANNOUNCEMENTS_COLLECTION].find_one({"_id": oid}, {"active": 1})
    if not doc:
        return False
    _db()[_ANNOUNCEMENTS_COLLECTION].update_one(
        {"_id": oid}, {"$set": {"active": not doc.get("active", False)}}
    )
    return True


def delete_announcement(ann_id: str) -> bool:
    if not _enabled():
        return False
    try:
        oid = ObjectId(ann_id)
    except InvalidId:
        return False
    return _db()[_ANNOUNCEMENTS_COLLECTION].delete_one({"_id": oid}).deleted_count > 0
