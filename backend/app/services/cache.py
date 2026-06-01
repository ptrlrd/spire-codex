"""Redis-backed application cache.

A thin, fail-safe wrapper around a redis-py client. Adding a Redis layer
lets us avoid hitting Mongo for hot read paths -- materialized stats,
materialized leaderboards, immutable shared runs, tier-list snapshots --
without introducing a per-worker cold-cache problem.

Design goals:
- **Fail-safe.** Redis being unavailable must never 500 an API request.
  All reads return `None` on error; all writes are no-ops on error. The
  caller falls back to its existing data source (Mongo / file / live
  aggregation). The cache is an optimization, not a dependency.
- **Lazy connection.** The client is built on first use, not at module
  import, so dev environments without REDIS_URL set don't pay a
  connection cost (and tests don't need a live Redis).
- **JSON values by default.** Almost everything we cache is a dict from
  a Mongo query or an API response, so the typed helpers
  (`get_json` / `set_json`) handle serialization. Raw bytes are
  available via the lower-level `get_raw` / `set_raw` when needed.
- **Namespace convention.** Keys are colon-delimited: `stats:<filter>`,
  `leaderboard:<filter>`, `run:<hash>`, `entity_scores:<type>`. A future
  deploy-time `cache_clear("stats:*")` is a one-liner.

The `REDIS_URL` env var controls the client (e.g. `redis://redis:6379/0`).
When unset, every operation no-ops and the existing data path runs
unchanged.
"""

from __future__ import annotations

import json
import os
from typing import Any

try:
    import redis
except ImportError:  # pragma: no cover -- dev env may not have redis installed
    redis = None  # type: ignore[assignment]

from ..metrics import cache_hits, cache_misses, cache_errors

_client: "redis.Redis | None" = None
_initialized = False


def _get_client() -> "redis.Redis | None":
    """Lazily build the Redis client. Returns None when REDIS_URL is unset
    or the redis package isn't available -- the caller treats that as a
    miss and falls back to its data source."""
    global _client, _initialized
    if _initialized:
        return _client

    url = os.environ.get("REDIS_URL", "").strip()
    if not url or redis is None:
        _initialized = True
        return None

    try:
        # Short timeouts so a slow/down Redis can't stall request handlers.
        # decode_responses=False -- we want to keep the raw bytes so callers
        # can choose JSON, msgpack, or pickle without re-encoding.
        _client = redis.Redis.from_url(
            url,
            socket_connect_timeout=1.0,
            socket_timeout=0.5,
            decode_responses=False,
            health_check_interval=30,
        )
    except Exception:
        _client = None

    _initialized = True
    return _client


# ── raw bytes API ────────────────────────────────────────────────────────


def get_raw(key: str) -> bytes | None:
    """Read a raw value. Returns None on miss, unavailable Redis, or any
    transport error."""
    client = _get_client()
    if client is None:
        return None
    try:
        val = client.get(key)
        if val is None:
            cache_misses.labels(namespace=_namespace(key)).inc()
        else:
            cache_hits.labels(namespace=_namespace(key)).inc()
        return val
    except Exception:
        cache_errors.labels(op="get").inc()
        return None


def set_raw(key: str, value: bytes, ttl_seconds: int | None = None) -> None:
    """Write a raw value with optional TTL. No-op on failure."""
    client = _get_client()
    if client is None:
        return
    try:
        if ttl_seconds is None:
            client.set(key, value)
        else:
            client.setex(key, ttl_seconds, value)
    except Exception:
        cache_errors.labels(op="set").inc()


# ── JSON API (the path most callers use) ─────────────────────────────────


def get_json(key: str) -> Any | None:
    """Read a JSON-serialized value. Returns None on miss / unavailable
    Redis / decode error -- treat as a clean miss in any case."""
    raw = get_raw(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except Exception:
        cache_errors.labels(op="decode").inc()
        return None


def set_json(key: str, value: Any, ttl_seconds: int | None = None) -> None:
    """Write a JSON-serialized value. Best-effort: silently drops values
    that aren't JSON-serializable (rare; the offending caller should be
    fixed, but we don't crash the request to enforce it)."""
    try:
        encoded = json.dumps(value, default=str).encode("utf-8")
    except Exception:
        cache_errors.labels(op="encode").inc()
        return
    set_raw(key, encoded, ttl_seconds=ttl_seconds)


# ── invalidation ─────────────────────────────────────────────────────────


def delete(key: str) -> None:
    """Drop a single key. No-op on failure."""
    client = _get_client()
    if client is None:
        return
    try:
        client.delete(key)
    except Exception:
        cache_errors.labels(op="delete").inc()


def delete_pattern(pattern: str) -> int:
    """Delete all keys matching a glob pattern (e.g. `stats:*`). Returns
    count deleted, or 0 on failure. Uses SCAN to avoid the KEYS-blocks-
    the-server footgun.

    Useful at deploy time (`delete_pattern("entity_scores:*")` after a
    new entity-scores snapshot) or when invalidating a namespace
    intentionally.
    """
    client = _get_client()
    if client is None:
        return 0
    try:
        deleted = 0
        for batch in _scan_batches(client, pattern):
            if batch:
                deleted += client.delete(*batch)
        return deleted
    except Exception:
        cache_errors.labels(op="delete_pattern").inc()
        return 0


def _scan_batches(client, pattern: str, batch_size: int = 500):
    """Yield batches of keys matching `pattern`, capped at `batch_size`
    per yield. Lets `delete_pattern` issue bulk DELs without holding the
    server's attention with a giant KEYS call."""
    cursor = 0
    batch: list[bytes] = []
    while True:
        cursor, keys = client.scan(cursor=cursor, match=pattern, count=batch_size)
        batch.extend(keys)
        if len(batch) >= batch_size:
            yield batch
            batch = []
        if cursor == 0:
            break
    if batch:
        yield batch


# ── internal ─────────────────────────────────────────────────────────────


def _namespace(key: str) -> str:
    """First segment of a colon-delimited key, for metrics labeling.
    `stats:eng:character=SILENT` → `stats`. Caps label cardinality."""
    idx = key.find(":")
    return key[:idx] if idx > 0 else key
