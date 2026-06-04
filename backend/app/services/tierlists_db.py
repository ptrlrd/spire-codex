"""Community tier lists backed by MongoDB.

Tier lists are user-owned, and users only exist in MongoDB (see
`users_db.py`, which has no SQLite fallback). So this service is
Mongo-only too: anonymous building happens entirely client-side, and the
moment a list is saved or shared it requires the same `MONGO_URL` that
auth already requires. There is intentionally no SQLite path.

Document shape:

    {
        "_id": ObjectId,
        "share_id": "Ab3xY...",        # short, unique, used for public links
        "user_id": ObjectId,            # owner
        "title": "My Relic Tier List",
        "entity_type": "relics",        # cards | relics | potions | monsters
        "tiers": [
            {"id": "s", "label": "S", "color": "#ff7f7f", "items": ["RELIC.SOZU", ...]},
            ...
        ],
        "unranked": ["RELIC.X", ...],   # items placed in the tray, not a tier
        "created_at": ISODate(...),
        "updated_at": ISODate(...),
    }

Only entity IDs are stored. The frontend resolves names + CDN image URLs
from the existing entity endpoints, so a tier list never duplicates game
data and always reflects the current art.
"""

from __future__ import annotations

import os
import secrets
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ASCENDING, DESCENDING, MongoClient, ReturnDocument
from pymongo.errors import DuplicateKeyError

ENTITY_TYPES = (
    "cards",
    "relics",
    "potions",
    "monsters",
    "ancients",
    "characters",
    "powers",
    "badges",
    "intents",
    "orbs",
)

_client: MongoClient | None = None
_coll = None


def _get_collection():
    global _client, _coll
    if _coll is not None:
        return _coll

    url = os.environ.get("MONGO_URL", "").strip()
    if not url:
        raise RuntimeError("MONGO_URL not set")

    _client = MongoClient(
        url,
        w="majority",
        retryWrites=True,
        connectTimeoutMS=5000,
        serverSelectionTimeoutMS=5000,
    )
    _coll = _client.get_default_database().tierlists
    _ensure_indexes(_coll)
    return _coll


def _ensure_indexes(coll) -> None:
    # share_id is the public handle, must be unique. It's always set on
    # insert, so a plain unique index is fine (no null-collision concern
    # like the users partial indexes).
    coll.create_index([("share_id", ASCENDING)], name="share_id_unique", unique=True)
    # Owner's "my tier lists" view, newest first.
    coll.create_index(
        [("user_id", ASCENDING), ("updated_at", DESCENDING)], name="owner_recent"
    )


def _new_share_id() -> str:
    # ~11 url-safe chars. Collisions are astronomically unlikely, but the
    # unique index + retry on insert makes it correct regardless.
    return secrets.token_urlsafe(8)


def _to_dict(doc: dict, include_owner_id: bool = False) -> dict:
    """Serialize a Mongo doc for JSON. `_id`/`user_id` become strings,
    datetimes become ISO strings. Owner id is omitted from public payloads
    unless explicitly requested."""
    out = {
        "id": str(doc["_id"]),
        "share_id": doc.get("share_id"),
        "title": doc.get("title"),
        "entity_type": doc.get("entity_type"),
        "tiers": doc.get("tiers") or [],
        "unranked": doc.get("unranked") or [],
        "comments": doc.get("comments") or {},
        # CDN URL of the rendered preview (set after upload to R2), or None.
        "image_url": doc.get("image_url"),
        "created_at": _iso(doc.get("created_at")),
        "updated_at": _iso(doc.get("updated_at")),
    }
    if include_owner_id:
        uid = doc.get("user_id")
        out["user_id"] = str(uid) if uid else None
    return out


def _iso(value) -> str | None:
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _oid(value: str) -> ObjectId | None:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        return None


def create_tierlist(
    user_id: str,
    title: str,
    entity_type: str,
    tiers: list[dict],
    unranked: list[str],
    comments: dict[str, str] | None = None,
) -> dict:
    coll = _get_collection()
    now = datetime.now(timezone.utc)
    base = {
        "user_id": ObjectId(user_id),
        "title": title,
        "entity_type": entity_type,
        "tiers": tiers,
        "unranked": unranked,
        "comments": comments or {},
        "created_at": now,
        "updated_at": now,
    }
    # Retry on the (vanishingly rare) share_id collision.
    for _ in range(5):
        doc = {**base, "share_id": _new_share_id()}
        try:
            result = coll.insert_one(doc)
            doc["_id"] = result.inserted_id
            return _to_dict(doc, include_owner_id=True)
        except DuplicateKeyError:
            continue
    raise RuntimeError("could not allocate a unique share_id")


def list_user_tierlists(user_id: str) -> list[dict]:
    coll = _get_collection()
    docs = coll.find({"user_id": ObjectId(user_id)}).sort("updated_at", DESCENDING)
    return [_to_dict(d, include_owner_id=True) for d in docs]


def get_owned_tierlist(tierlist_id: str, user_id: str) -> dict | None:
    """Owner-scoped fetch for the editor. Returns None if the id is
    malformed or the list isn't owned by this user."""
    oid = _oid(tierlist_id)
    if oid is None:
        return None
    coll = _get_collection()
    doc = coll.find_one({"_id": oid, "user_id": ObjectId(user_id)})
    return _to_dict(doc, include_owner_id=True) if doc else None


def get_tierlist_by_share_id(share_id: str) -> dict | None:
    """Public read-only fetch by share handle. Owner id is not exposed."""
    coll = _get_collection()
    doc = coll.find_one({"share_id": share_id})
    if not doc:
        return None
    out = _to_dict(doc, include_owner_id=False)
    # Surface the owner's display name for attribution, not their id.
    uid = doc.get("user_id")
    out["owner_username"] = _owner_username(uid) if uid else None
    return out


def _owner_username(user_id) -> str | None:
    from .users_db import get_user

    user = get_user(str(user_id))
    return user.get("username") if user else None


def set_preview_image(tierlist_id: str, user_id: str, data: bytes) -> dict | None:
    """Upload a rendered preview to R2 and store its CDN URL on the doc.
    Owner-scoped. Returns the updated doc, or None if not found. If R2 isn't
    configured the doc is returned unchanged (no preview)."""
    from . import r2_storage

    oid = _oid(tierlist_id)
    if not oid:
        return None
    coll = _get_collection()
    doc = coll.find_one({"_id": oid, "user_id": ObjectId(user_id)})
    if not doc:
        return None
    url = r2_storage.upload_preview(doc["share_id"], data)
    if url:
        coll.update_one(
            {"_id": oid},
            {"$set": {"image_url": url, "updated_at": datetime.now(timezone.utc)}},
        )
        doc["image_url"] = url
    return _to_dict(doc, include_owner_id=True)


def update_tierlist(tierlist_id: str, user_id: str, fields: dict) -> dict | None:
    """Owner-scoped update. `fields` may include title, tiers, unranked.
    entity_type and share_id are immutable. Returns the updated doc, or
    None if not found / not owned."""
    oid = _oid(tierlist_id)
    if oid is None:
        return None
    allowed = {
        k: v
        for k, v in fields.items()
        if k in ("title", "tiers", "unranked", "comments")
    }
    if not allowed:
        return get_owned_tierlist(tierlist_id, user_id)
    allowed["updated_at"] = datetime.now(timezone.utc)
    coll = _get_collection()
    doc = coll.find_one_and_update(
        {"_id": oid, "user_id": ObjectId(user_id)},
        {"$set": allowed},
        return_document=ReturnDocument.AFTER,
    )
    return _to_dict(doc, include_owner_id=True) if doc else None


def delete_tierlist(tierlist_id: str, user_id: str) -> bool:
    from . import r2_storage

    oid = _oid(tierlist_id)
    if oid is None:
        return False
    coll = _get_collection()
    doc = coll.find_one({"_id": oid, "user_id": ObjectId(user_id)}, {"share_id": 1})
    result = coll.delete_one({"_id": oid, "user_id": ObjectId(user_id)})
    if result.deleted_count and doc and doc.get("share_id"):
        r2_storage.delete_preview(doc["share_id"])
    return result.deleted_count > 0
