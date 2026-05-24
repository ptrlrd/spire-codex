"""User accounts backed by MongoDB.

Document shape:

    {
        "_id": ObjectId,
        "steam_id": "76561198...",   # unique, sparse
        "discord_id": "123456...",   # unique, sparse
        "username": "SomeName",
        "username_lower": "somename",  # unique, for case-insensitive checks
        "email": "user@example.com",
        "username_changes": [ISODate(...)],  # timestamps, max 3 per 24h
        "created_at": ISODate(...),
        "updated_at": ISODate(...),
    }
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from pymongo import ASCENDING, MongoClient
from pymongo.errors import DuplicateKeyError

_client: MongoClient | None = None
_coll = None

_USERNAME_RE = re.compile(r"[^a-zA-Z0-9_\- ]")
_USERNAME_MAX = 25
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_USERNAME_CHANGES_PER_DAY = 3


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
    _coll = _client.get_default_database().users
    _ensure_indexes(_coll)
    return _coll


def _ensure_indexes(coll) -> None:
    coll.create_index([("steam_id", ASCENDING)], unique=True, sparse=True)
    coll.create_index([("discord_id", ASCENDING)], unique=True, sparse=True)
    coll.create_index([("username_lower", ASCENDING)], unique=True, sparse=True)


def sanitize_username(raw: str) -> str | None:
    cleaned = _USERNAME_RE.sub("", raw.strip())[:_USERNAME_MAX].strip()
    return cleaned or None


def validate_email(email: str) -> bool:
    return bool(_EMAIL_RE.match(email.strip()))


def find_or_create_by_steam(steam_id: str, persona_name: str | None = None) -> dict:
    coll = _get_collection()
    now = datetime.now(timezone.utc)

    existing = coll.find_one({"steam_id": steam_id})
    if existing:
        existing["_id"] = str(existing["_id"])
        return existing

    username = sanitize_username(persona_name) if persona_name else None
    username_lower = username.lower() if username else None

    # If the persona name collides with an existing username, append digits
    if username_lower:
        username, username_lower = _deduplicate_username(coll, username, username_lower)

    doc = {
        "steam_id": steam_id,
        "discord_id": None,
        "username": username,
        "username_lower": username_lower,
        "email": None,
        "username_changes": [],
        "created_at": now,
        "updated_at": now,
    }

    try:
        result = coll.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
    except DuplicateKeyError:
        # Concurrent creation -- the other request won, fetch their doc
        existing = coll.find_one({"steam_id": steam_id})
        if existing:
            existing["_id"] = str(existing["_id"])
            return existing
        raise

    return doc


def find_or_create_by_discord(
    discord_id: str,
    discord_username: str | None = None,
    email: str | None = None,
) -> dict:
    coll = _get_collection()
    now = datetime.now(timezone.utc)

    existing = coll.find_one({"discord_id": discord_id})
    if existing:
        existing["_id"] = str(existing["_id"])
        return existing

    username = sanitize_username(discord_username) if discord_username else None
    username_lower = username.lower() if username else None

    if username_lower:
        username, username_lower = _deduplicate_username(coll, username, username_lower)

    clean_email = email.strip() if email and validate_email(email) else None

    doc = {
        "steam_id": None,
        "discord_id": discord_id,
        "username": username,
        "username_lower": username_lower,
        "email": clean_email,
        "username_changes": [],
        "created_at": now,
        "updated_at": now,
    }

    try:
        result = coll.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
    except DuplicateKeyError:
        existing = coll.find_one({"discord_id": discord_id})
        if existing:
            existing["_id"] = str(existing["_id"])
            return existing
        raise

    return doc


def get_user(user_id: str) -> dict | None:
    coll = _get_collection()
    try:
        doc = coll.find_one({"_id": ObjectId(user_id)})
    except Exception:
        return None
    if doc:
        doc["_id"] = str(doc["_id"])
    return doc


def update_username(user_id: str, new_name: str) -> dict:
    coll = _get_collection()
    cleaned = sanitize_username(new_name)
    if not cleaned:
        return {"error": "Username is empty after sanitization"}

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=1)

    user = coll.find_one({"_id": ObjectId(user_id)})
    if not user:
        return {"error": "User not found"}

    recent_changes = [t for t in user.get("username_changes", []) if t > cutoff]
    if len(recent_changes) >= _USERNAME_CHANGES_PER_DAY:
        return {"error": "Username can only be changed 3 times per day"}

    lower = cleaned.lower()
    if lower == user.get("username_lower"):
        return {"error": "That is already your username"}

    try:
        result = coll.update_one(
            {"_id": ObjectId(user_id)},
            {
                "$set": {
                    "username": cleaned,
                    "username_lower": lower,
                    "updated_at": now,
                },
                "$push": {"username_changes": now},
            },
        )
    except DuplicateKeyError:
        return {"error": "Username is already taken"}

    if result.modified_count == 0:
        return {"error": "Update failed"}

    return {
        "success": True,
        "username": cleaned,
        "changes_remaining": _USERNAME_CHANGES_PER_DAY - len(recent_changes) - 1,
    }


def update_email(user_id: str, email: str) -> dict:
    coll = _get_collection()
    clean = email.strip()
    if not validate_email(clean):
        return {"error": "Invalid email format"}

    now = datetime.now(timezone.utc)
    result = coll.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"email": clean, "updated_at": now}},
    )
    if result.matched_count == 0:
        return {"error": "User not found"}

    return {"success": True, "email": clean}


def link_steam(user_id: str, steam_id: str) -> dict:
    coll = _get_collection()
    conflict = coll.find_one({"steam_id": steam_id, "_id": {"$ne": ObjectId(user_id)}})
    if conflict:
        return {"error": "This Steam account is already linked to another user"}

    try:
        result = coll.update_one(
            {"_id": ObjectId(user_id)},
            {
                "$set": {
                    "steam_id": steam_id,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
    except DuplicateKeyError:
        return {"error": "This Steam account is already linked to another user"}

    if result.matched_count == 0:
        return {"error": "User not found"}
    return {"success": True}


def link_discord(user_id: str, discord_id: str) -> dict:
    coll = _get_collection()
    conflict = coll.find_one(
        {"discord_id": discord_id, "_id": {"$ne": ObjectId(user_id)}}
    )
    if conflict:
        return {"error": "This Discord account is already linked to another user"}

    try:
        result = coll.update_one(
            {"_id": ObjectId(user_id)},
            {
                "$set": {
                    "discord_id": discord_id,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
    except DuplicateKeyError:
        return {"error": "This Discord account is already linked to another user"}

    if result.matched_count == 0:
        return {"error": "User not found"}
    return {"success": True}


def get_username_changes_remaining(user_id: str) -> int:
    coll = _get_collection()
    user = coll.find_one({"_id": ObjectId(user_id)}, {"username_changes": 1})
    if not user:
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    recent = [t for t in user.get("username_changes", []) if t > cutoff]
    return max(0, _USERNAME_CHANGES_PER_DAY - len(recent))


def check_username_available(username: str) -> bool:
    coll = _get_collection()
    lower = username.strip().lower()
    if not lower:
        return False
    return coll.find_one({"username_lower": lower}, {"_id": 1}) is None


def _deduplicate_username(coll, username: str, username_lower: str) -> tuple[str, str]:
    if coll.find_one({"username_lower": username_lower}, {"_id": 1}) is None:
        return username, username_lower

    for i in range(1, 100):
        candidate = f"{username[: _USERNAME_MAX - len(str(i)) - 1]}_{i}"
        candidate_lower = candidate.lower()
        if coll.find_one({"username_lower": candidate_lower}, {"_id": 1}) is None:
            return candidate, candidate_lower

    # Extremely unlikely -- 100 collisions
    import secrets

    suffix = secrets.token_hex(3)
    fallback = f"{username[: _USERNAME_MAX - 7]}_{suffix}"
    return fallback, fallback.lower()
