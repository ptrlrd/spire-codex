"""Mongo-backed runtime rate limit config with in-process TTL cache.

The default rate limits on `/api/runs`, `/api/feedback`, etc. live as
literal strings in `@limiter.limit("3000/hour")` decorators. Changing
them requires a code commit + CI build + deploy (~15 min). For one
or two cases (Discord report of a 1000-run backlog) that's fine; for
ongoing tuning it's friction.

This store lets an admin override any registered limit at runtime by
writing to a single Mongo doc, and lets the per-request limit lookup
be ~free (TTL cache in front of the doc read).

## Document shape

  // collection: rate_limits, _id: "config"
  {
    "_id": "config",
    "updated_at": ISODate(...),
    "updated_by": "peter",           // operator identifier (audit only)
    "limits": {
      "submit_run":       "3000/hour",
      "claim_runs":       "10/minute",
      "list_runs":        "120/minute",
      "shared_run":       "60/minute",
      ...
    }
  }

Keys are operation slugs (NOT route paths). Each slowapi-decorated
endpoint registers under a slug; this module is the source of truth
for current limit strings keyed by slug.

## Cache

Every limit lookup hits this module per request. Going to Mongo on
every request would add 1-3ms per hop, so the doc is cached for
TTL_SECONDS (default 5s). 5s is a deliberate trade-off:
- Long enough to absorb 100 req/s of in-flight traffic without
  re-reading
- Short enough that an admin's "lower this NOW" change goes live
  within one cache tick

## Integration

Endpoints opt in by replacing
    @limiter.limit("3000/hour")
with
    @limiter.limit(lambda: get_limit("submit_run", default="3000/hour"))

The default string is always required as a fallback for when Mongo
is unreachable or the slug hasn't been overridden — same shape as
the hardcoded value so nothing regresses if this whole module
crashes silently.

TODO:
- [ ] Implement `_fetch_from_mongo` once admin router lands and we
      know the actual doc shape we want to persist (sections, audit
      log structure, etc.)
- [ ] Wire `submit_run` as the first endpoint to use this — only
      after the admin write path is tested
"""

from __future__ import annotations

import os
import time
from typing import Any

# In-process cache. Shared across uvicorn workers? No — each worker
# has its own copy. That's fine; the 5s TTL means at worst each
# worker is briefly out of sync with the others (irrelevant for rate
# limiting since limits are per-IP-per-worker anyway).
_cache: dict[str, Any] = {"limits": {}, "fetched_at": 0.0}
TTL_SECONDS = 5.0


def get_limit(slug: str, default: str) -> str:
    """Return the current limit string for `slug`, or `default`.

    Called from the slowapi limit callable on every decorated request,
    so this must be cheap. The TTL cache means we hit Mongo at most
    once per TTL_SECONDS per worker (so ~12 reads/min across 4 workers
    at the current 5s TTL).
    """
    now = time.monotonic()
    if now - _cache["fetched_at"] > TTL_SECONDS:
        _refresh_cache()
    return _cache["limits"].get(slug, default)


def _refresh_cache() -> None:
    """Pull the latest config doc from Mongo. Failures fall through to
    the previous cache + an updated fetched_at, so a Mongo outage
    doesn't trigger constant refresh attempts on every request."""
    # TODO: implement once admin router defines the doc shape.
    # Sketch:
    #     from pymongo import MongoClient
    #     coll = _get_db().rate_limits
    #     doc = coll.find_one({"_id": "config"})
    #     _cache["limits"] = (doc or {}).get("limits", {})
    _cache["fetched_at"] = time.monotonic()


def list_overrides() -> dict[str, str]:
    """Return all current overrides (for the admin GET endpoint)."""
    if time.monotonic() - _cache["fetched_at"] > TTL_SECONDS:
        _refresh_cache()
    return dict(_cache["limits"])


def set_override(slug: str, limit_string: str, actor: str) -> None:
    """Persist `slug -> limit_string` to Mongo and invalidate the
    in-process cache. `actor` is an audit-trail identifier (logged,
    not enforced).

    Limit string format: slowapi's standard — `"<n>/<period>"` where
    period is `second`, `minute`, `hour`, or `day`. e.g. `"50/minute"`,
    `"3000/hour"`.
    """
    # TODO: implement. Validate the limit string is parseable by
    # slowapi before writing, otherwise we ship a broken config that
    # gets rejected at decorator-eval time and breaks the route.
    raise NotImplementedError("Admin write path lands next.")


def clear_override(slug: str, actor: str) -> None:
    """Remove `slug` from the override doc — endpoint falls back to
    its hardcoded default string."""
    raise NotImplementedError("Admin write path lands next.")


def _admin_token_from_env() -> str | None:
    """Resolves the admin gating token. Set ADMIN_TOKEN in
    docker-compose env from 1Password (`op://Spire Codex/Admin Token`).
    """
    return os.environ.get("ADMIN_TOKEN") or None
