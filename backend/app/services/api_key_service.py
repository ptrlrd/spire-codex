"""API keys and their rate-limit tier.

A key is issued to an account and carries a tier (general / registered /
academia / paid). The rate limiter resolves the ``X-API-Key`` header to a tier
and caps the request accordingly; no key falls back to the per-IP browse limit.
Only a SHA-256 hash of the key is stored — the raw key is shown once, at
creation, and can't be recovered afterward.

The tier -> limit mapping lives in rate_limit_config (admin-editable); this
module just owns the keys and resolves a raw key to its tier.
"""

import hashlib
import logging
import os
import secrets
import time
from datetime import datetime, timezone

logger = logging.getLogger("spire-codex")

API_KEYS_COLLECTION = "api_keys"
KEY_PREFIX = "sk-codex-"
# Ordered low -> high; new user keys start at 'registered'. 'general' is the
# floor tier an admin can drop a key to; 'academia'/'paid' are promotions.
TIERS = ("general", "registered", "academia", "paid")
_DEFAULT_TIER = "registered"
_MAX_KEYS_PER_USER = 10

# hash -> (expires_monotonic, {tier, key_id, user_id} | None). Keeps the hot
# rate-limit path off Mongo; revocation busts the entry immediately. Bounded:
# unknown sk-codex-prefixed garbage also lands here (cached None), so without a cap
# an attacker spraying random keys would grow it forever.
_RESOLVE_TTL_SECONDS = 30.0
_RESOLVE_CACHE_MAX = 5000
_resolve_cache: dict[str, tuple[float, dict | None]] = {}


def _prune_resolve_cache(now: float) -> None:
    """Drop expired entries once the cache is oversized; hard-clear if live
    entries alone still exceed the cap (pathological, but bounded either way)."""
    if len(_resolve_cache) <= _RESOLVE_CACHE_MAX:
        return
    for k in [k for k, (exp, _) in _resolve_cache.items() if exp <= now]:
        _resolve_cache.pop(k, None)
    if len(_resolve_cache) > _RESOLVE_CACHE_MAX:
        _resolve_cache.clear()


def _coll():
    from .runs_db_mongo import _get_collection

    return _get_collection().database[API_KEYS_COLLECTION]


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _public(doc: dict) -> dict:
    """Key metadata safe to hand back to its owner (never the hash)."""
    created = doc.get("created_at")
    used = doc.get("last_used_at")
    return {
        "id": doc["_id"],
        "tier": doc.get("tier", _DEFAULT_TIER),
        "label": doc.get("label", ""),
        "created_at": created.isoformat() if isinstance(created, datetime) else None,
        "last_used_at": used.isoformat() if isinstance(used, datetime) else None,
        "revoked": bool(doc.get("revoked")),
    }


def create_key(user_id: str, label: str = "", tier: str = _DEFAULT_TIER) -> dict:
    """Issue a key for a user. Returns the raw key (shown once) plus metadata."""
    if not os.environ.get("MONGO_URL", "").strip():
        raise ValueError("api keys need MONGO_URL")
    tier = tier if tier in TIERS else _DEFAULT_TIER
    active = _coll().count_documents({"user_id": user_id, "revoked": {"$ne": True}})
    if active >= _MAX_KEYS_PER_USER:
        raise ValueError(f"key limit reached ({_MAX_KEYS_PER_USER}); revoke one first")
    raw = KEY_PREFIX + secrets.token_urlsafe(32)
    key_id = secrets.token_hex(8)
    clean_label = (label or "").strip()[:80]
    _coll().insert_one(
        {
            "_id": key_id,
            "key_hash": _hash(raw),
            "user_id": user_id,
            "tier": tier,
            "label": clean_label,
            "created_at": datetime.now(timezone.utc),
            "last_used_at": None,
            "revoked": False,
        }
    )
    # The raw key is returned here and never again.
    return {"id": key_id, "raw_key": raw, "tier": tier, "label": clean_label}


def list_keys(user_id: str) -> list[dict]:
    """A user's own keys, with their usage joined so the profile page can show
    requests today / this week (same numbers the admin view sees)."""
    if not os.environ.get("MONGO_URL", "").strip():
        return []
    from . import api_key_usage

    docs = list(_coll().find({"user_id": user_id}).sort("created_at", -1))
    usage = api_key_usage.usage_for_keys([d["_id"] for d in docs])
    out = []
    for d in docs:
        row = _public(d)
        u = usage.get(d["_id"]) or {}
        row["requests_today"] = u.get("today", 0)
        row["requests_week"] = u.get("week", 0)
        out.append(row)
    return out


def revoke_key(user_id: str, key_id: str) -> bool:
    """Revoke a key the user owns. Busts the resolve cache so it stops working
    right away rather than at the next cache expiry."""
    if not os.environ.get("MONGO_URL", "").strip():
        return False
    doc = _coll().find_one({"_id": key_id, "user_id": user_id})
    if not doc:
        return False
    _coll().update_one({"_id": key_id}, {"$set": {"revoked": True}})
    _resolve_cache.pop(doc.get("key_hash", ""), None)
    return True


def set_tier(key_id: str, tier: str) -> bool:
    """Admin/Patreon promotion of a key's tier. Busts the resolve cache."""
    if not os.environ.get("MONGO_URL", "").strip() or tier not in TIERS:
        return False
    doc = _coll().find_one({"_id": key_id})
    if not doc:
        return False
    _coll().update_one({"_id": key_id}, {"$set": {"tier": tier}})
    _resolve_cache.pop(doc.get("key_hash", ""), None)
    return True


def admin_revoke(key_id: str) -> bool:
    """Revoke any key (no owner scoping — operator action). Cache-busted."""
    if not os.environ.get("MONGO_URL", "").strip():
        return False
    doc = _coll().find_one({"_id": key_id})
    if not doc:
        return False
    _coll().update_one({"_id": key_id}, {"$set": {"revoked": True}})
    _resolve_cache.pop(doc.get("key_hash", ""), None)
    return True


def admin_list_keys(q: str | None = None, limit: int = 200) -> list[dict]:
    """Every key, newest first, with the owner's username joined in. `q`
    filters by username, label, or user/key id (substring, case-insensitive)."""
    if not os.environ.get("MONGO_URL", "").strip():
        return []
    limit = max(1, min(limit, 500))
    docs = list(_coll().find({}).sort("created_at", -1).limit(limit))

    # Bulk-join usernames: keys store the user's ObjectId as a string.
    from bson import ObjectId

    from .users_db import _get_collection as _users

    oids = []
    for d in docs:
        try:
            oids.append(ObjectId(d.get("user_id")))
        except Exception:
            pass
    names: dict[str, str] = {}
    if oids:
        try:
            for u in _users().find({"_id": {"$in": oids}}, {"username": 1}):
                names[str(u["_id"])] = u.get("username") or ""
        except Exception:
            logger.warning("api-key admin list: username join failed", exc_info=True)

    # Usage join: requests today / last 7 days per key, one aggregation.
    from . import api_key_usage

    usage = api_key_usage.usage_for_keys([d["_id"] for d in docs])

    out = []
    for d in docs:
        row = _public(d)
        row["user_id"] = d.get("user_id")
        row["username"] = names.get(d.get("user_id") or "", "")
        u = usage.get(d["_id"]) or {}
        row["requests_today"] = u.get("today", 0)
        row["requests_week"] = u.get("week", 0)
        out.append(row)

    if q and q.strip():
        term = q.strip().lower()
        out = [
            r
            for r in out
            if term in (r["username"] or "").lower()
            or term in (r["label"] or "").lower()
            or term in (r["user_id"] or "").lower()
            or term in r["id"].lower()
        ]
    return out


def resolve(raw_key: str) -> dict | None:
    """Resolve an ``X-API-Key`` to {tier, key_id, user_id}, cached. None when the
    key is missing, malformed, unknown, or revoked."""
    if not raw_key or not raw_key.startswith(KEY_PREFIX):
        return None
    if not os.environ.get("MONGO_URL", "").strip():
        return None
    kh = _hash(raw_key)
    now = time.monotonic()
    cached = _resolve_cache.get(kh)
    if cached is not None and cached[0] > now:
        return cached[1]
    result: dict | None = None
    try:
        # Stamp last_used_at in the same round trip. This only runs on a cache
        # miss (at most once per TTL per key per worker), so the hot path never
        # pays for it and the profile page still shows a truthful "last used".
        doc = _coll().find_one_and_update(
            {"key_hash": kh, "revoked": {"$ne": True}},
            {"$set": {"last_used_at": datetime.now(timezone.utc)}},
            projection={"tier": 1, "user_id": 1},
        )
        if doc:
            result = {
                "tier": doc.get("tier", _DEFAULT_TIER),
                "key_id": doc["_id"],
                "user_id": doc.get("user_id"),
            }
    except Exception:
        logger.warning("api-key resolve failed", exc_info=True)
    _prune_resolve_cache(now)
    _resolve_cache[kh] = (now + _RESOLVE_TTL_SECONDS, result)
    return result
