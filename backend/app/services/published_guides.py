"""Guides published from the admin queue.

Repo guides ship in data/guides.json. A submission approved on /admin is
stored in Mongo and served alongside them, so publishing needs no commit.
"""

from __future__ import annotations

import logging
import re
import threading
import time
from datetime import date, datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from pymongo.errors import DuplicateKeyError

from . import data_service
from .admin_db import _GUIDE_SUBMISSIONS_COLLECTION, _db, _enabled

logger = logging.getLogger(__name__)

_COLLECTION = "published_guides"
_CACHE_TTL = 60.0

VALID_CATEGORIES = {
    "general",
    "character",
    "strategy",
    "mechanic",
    "boss",
    "event",
    "advanced",
}
VALID_DIFFICULTIES = {"beginner", "intermediate", "advanced"}
VALID_CHARACTERS = {"ironclad", "silent", "defect", "necrobinder", "regent", ""}
MAX_TITLE = 200
MAX_SUMMARY = 500
MAX_CONTENT = 50_000
MAX_FIELD = 200
MAX_TAGS = 12

_GUIDE_FIELDS = (
    "slug",
    "title",
    "author",
    "date",
    "updated",
    "category",
    "tags",
    "summary",
    "difficulty",
    "character",
    "website",
    "bluesky",
    "twitter",
    "twitch",
    "content",
)

_lock = threading.Lock()
_cache: tuple[float, list[dict]] | None = None


class GuideError(ValueError):
    pass


def sanitize(text: str, max_len: int = MAX_FIELD) -> str:
    """Strip HTML tags and control chars, truncate."""
    text = re.sub(r"<[^>]+>", "", text or "")
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    return text.strip()[:max_len]


def validate_url(url: str | None) -> str | None:
    if not url or not url.strip():
        return None
    url = url.strip()[:500]
    if url.startswith(("http://", "https://")):
        return url
    if re.match(r"^[\w.\-]+$", url):
        return url
    return None


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")[:120]


def _tags(raw: Any) -> list[str]:
    parts = raw.split(",") if isinstance(raw, str) else list(raw or [])
    out: list[str] = []
    for part in parts:
        tag = sanitize(str(part), 40)
        if tag and tag not in out:
            out.append(tag)
    return out[:MAX_TAGS]


def clean_guide(raw: dict[str, Any]) -> dict[str, Any]:
    """Validated guide fields from a submission or an admin edit."""
    title = sanitize(raw.get("title") or "", MAX_TITLE)
    content = sanitize(raw.get("content") or "", MAX_CONTENT)
    author = sanitize(raw.get("author") or raw.get("author_name") or "")
    if not title or not content or not author:
        raise GuideError("Title, author and content are required")
    slug = slugify(raw.get("slug") or title)
    if not slug:
        raise GuideError("The slug needs at least one letter or number")
    category = (raw.get("category") or "").lower()
    difficulty = (raw.get("difficulty") or "").lower()
    character = (raw.get("character") or "").lower()
    return {
        "slug": slug,
        "title": title,
        "author": author,
        "category": category if category in VALID_CATEGORIES else "general",
        "difficulty": difficulty if difficulty in VALID_DIFFICULTIES else "beginner",
        "character": character if character in VALID_CHARACTERS and character else None,
        "tags": _tags(raw.get("tags")),
        "summary": sanitize(raw.get("summary") or "", MAX_SUMMARY),
        "content": content,
        "website": validate_url(raw.get("website")),
        "bluesky": validate_url(raw.get("bluesky")),
        "twitter": validate_url(raw.get("twitter")),
        "twitch": validate_url(raw.get("twitch")),
    }


def _public(doc: dict) -> dict:
    guide = {k: doc.get(k) for k in _GUIDE_FIELDS}
    guide["id"] = guide["slug"]
    guide["channel"] = None
    guide["tags"] = guide["tags"] or []
    guide["summary"] = guide["summary"] or ""
    return guide


def _invalidate() -> None:
    global _cache
    with _lock:
        _cache = None


def list_published(fresh: bool = False) -> list[dict]:
    """Guides published from the admin queue, newest first. Cached briefly
    per process; a failed read serves the last good list."""
    global _cache
    if not _enabled():
        return []
    now = time.monotonic()
    cached = _cache
    if not fresh and cached and now - cached[0] < _CACHE_TTL:
        return cached[1]
    try:
        rows = [_public(d) for d in _db()[_COLLECTION].find({}).sort("date", -1)]
    except Exception:
        logger.warning("published guides read failed", exc_info=True)
        return cached[1] if cached else []
    with _lock:
        _cache = (now, rows)
    return rows


def all_guides() -> list[dict]:
    """Repo guides plus admin-published ones, newest first. A repo guide wins
    a slug clash, and a pinned ?version serves that version's repo guides."""
    repo = data_service.load_guides()
    if data_service._get_version():
        return repo
    published = list_published()
    if not published:
        return repo
    taken = {g["slug"] for g in repo} | {g["id"] for g in repo}
    merged = repo + [g for g in published if g["slug"] not in taken]
    merged.sort(key=lambda g: g.get("date") or "", reverse=True)
    return merged


def _repo_slugs() -> set[str]:
    repo = data_service._load_guides_versioned(None)
    return {g["slug"] for g in repo} | {g["id"] for g in repo}


def _oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError) as exc:
        raise GuideError("Unknown submission") from exc


def publish_submission(sub_id: str, overrides: dict[str, Any]) -> dict:
    """Publish a pending submission, with the admin's edits applied on top."""
    if not _enabled():
        raise GuideError("Publishing needs the Mongo store")
    oid = _oid(sub_id)
    subs = _db()[_GUIDE_SUBMISSIONS_COLLECTION]
    sub = subs.find_one({"_id": oid})
    if not sub:
        raise GuideError("Unknown submission")
    if sub.get("status") == "published":
        raise GuideError("This submission is already published")
    guide = clean_guide(
        {**sub, **{k: v for k, v in overrides.items() if v is not None}}
    )
    coll = _db()[_COLLECTION]
    if guide["slug"] in _repo_slugs() or coll.find_one({"slug": guide["slug"]}):
        raise GuideError(f"A guide with the slug '{guide['slug']}' already exists")
    created = sub.get("created_at")
    guide["date"] = (
        created.date().isoformat()
        if isinstance(created, datetime)
        else date.today().isoformat()
    )
    guide["updated"] = None
    coll.create_index("slug", unique=True)
    try:
        coll.insert_one(
            {
                **guide,
                "submission_id": str(oid),
                "published_at": datetime.now(timezone.utc),
            }
        )
    except DuplicateKeyError as exc:
        raise GuideError(
            f"A guide with the slug '{guide['slug']}' already exists"
        ) from exc
    subs.update_one(
        {"_id": oid}, {"$set": {"status": "published", "slug": guide["slug"]}}
    )
    _invalidate()
    return _public(guide)


def update_published(slug: str, fields: dict[str, Any]) -> dict:
    """Edit a published guide in place. The slug stays fixed so links hold."""
    if not _enabled():
        raise GuideError("Publishing needs the Mongo store")
    coll = _db()[_COLLECTION]
    doc = coll.find_one({"slug": slug})
    if not doc:
        raise GuideError("Unknown guide")
    guide = clean_guide(
        {**doc, **{k: v for k, v in fields.items() if v is not None}, "slug": slug}
    )
    guide["updated"] = date.today().isoformat()
    coll.update_one({"_id": doc["_id"]}, {"$set": guide})
    _invalidate()
    return _public({**doc, **guide})


def unpublish(slug: str) -> bool:
    """Take a guide down and put its submission back in the queue."""
    if not _enabled():
        return False
    coll = _db()[_COLLECTION]
    doc = coll.find_one_and_delete({"slug": slug})
    if not doc:
        return False
    sub_id = doc.get("submission_id")
    if sub_id:
        try:
            _db()[_GUIDE_SUBMISSIONS_COLLECTION].update_one(
                {"_id": ObjectId(sub_id)},
                {"$set": {"status": "pending"}, "$unset": {"slug": ""}},
            )
        except InvalidId:
            pass
    _invalidate()
    return True
