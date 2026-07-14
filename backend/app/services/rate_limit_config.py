"""Admin-tunable global rate limit.

The API's blanket per-IP cap (slowapi ``default_limits``) is normally a hardcoded
``300/minute``. This lets an operator change that number, or switch the blanket
cap off entirely, at runtime without a redeploy. The value lives in one Mongo
doc so all workers converge on it (each caches for a few seconds); the per-IP
counters themselves stay slowapi's per-worker in-memory ones, so this tunes the
*limit*, not where the counts live.

Endpoints with their own tighter ``@limiter.limit(...)`` (auth, feedback, guide
submission) keep those — this only moves the blanket default everything else
falls back to.
"""

import logging
import os
import time

logger = logging.getLogger("spire-codex")

_COLLECTION = "app_config"
_DOC_ID = "rate_limit"
_DEFAULT_LIMIT = "300/minute"
# Effectively unlimited: what the blanket cap becomes when an operator toggles
# limiting off (per-endpoint limits still apply).
_DISABLED_LIMIT = "1000000/minute"
_CACHE_TTL_SECONDS = 15.0

_cache: dict = {"at": 0.0, "cfg": None}


def _coll():
    from .runs_db_mongo import _get_collection

    return _get_collection().database[_COLLECTION]


def _fallback() -> dict:
    return {"default_limit": _DEFAULT_LIMIT, "enabled": True}


def get_config() -> dict:
    """The current {default_limit, enabled}, cached per worker so a read on the
    hot rate-limit path is cheap. Falls back to the built-in default on any
    trouble so limiting never breaks."""
    if not os.environ.get("MONGO_URL", "").strip():
        return _fallback()
    now = time.monotonic()
    cached = _cache["cfg"]
    if cached is not None and now - _cache["at"] < _CACHE_TTL_SECONDS:
        return cached
    cfg = _fallback()
    try:
        doc = _coll().find_one({"_id": _DOC_ID})
        if doc:
            cfg = {
                "default_limit": doc.get("default_limit") or _DEFAULT_LIMIT,
                "enabled": bool(doc.get("enabled", True)),
            }
    except Exception:
        logger.warning("rate-limit config read failed", exc_info=True)
    _cache["cfg"] = cfg
    _cache["at"] = now
    return cfg


def default_limit_value(*_args, **_kwargs) -> str:
    """slowapi ``default_limits`` callable: the current blanket per-IP cap,
    re-read (cached) on each request so an admin change takes effect within the
    cache window without a restart. Returns an effectively-unlimited value when
    limiting is toggled off."""
    cfg = get_config()
    if not cfg.get("enabled", True):
        return _DISABLED_LIMIT
    return cfg.get("default_limit") or _DEFAULT_LIMIT


def set_config(default_limit: str | None = None, enabled: bool | None = None) -> dict:
    """Update the config. Validates the limit string (e.g. ``300/minute``,
    ``5/second``) and raises ValueError if it doesn't parse. Busts the local
    cache so the calling worker reflects it immediately; the others pick it up
    within the cache window."""
    if not os.environ.get("MONGO_URL", "").strip():
        raise ValueError("rate-limit config needs MONGO_URL")
    current = get_config()
    new = dict(current)
    if default_limit is not None:
        from limits import parse

        candidate = default_limit.strip()
        try:
            parse(candidate)
        except Exception as exc:
            raise ValueError(
                f"'{default_limit}' is not a valid limit (try e.g. 300/minute)"
            ) from exc
        new["default_limit"] = candidate
    if enabled is not None:
        new["enabled"] = bool(enabled)
    _coll().replace_one(
        {"_id": _DOC_ID},
        {"_id": _DOC_ID, **new},
        upsert=True,
    )
    _cache["cfg"] = None
    return new
