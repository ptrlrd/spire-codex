"""Fail-safe Redis application cache.

A thin JSON get/set layer in front of the hot read endpoints (issue #388).
The cache is always an optimization, never load-bearing:

- `REDIS_URL` unset -> every call no-ops without importing redis at all,
  so bare-metal dev keeps working with zero new dependencies in play.
- Redis down, slow, or throwing -> `get_json` returns None (a miss) and
  writes no-op. Socket timeouts are short (250ms) so a *hung* Redis
  degrades exactly like a *down* one instead of adding latency.
- Values are JSON: everything cached here is already a JSON-serializable
  API response.

Keys are namespaced as "<namespace>:<rest>" (e.g. "run:<hash>",
"entity_scores:relics:act2"); the namespace becomes the Prometheus label on
the hit/miss/error counters.

Connections are per-process (uvicorn workers each hold one client), pooled
by redis-py internally.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from ..metrics import cache_errors, cache_hits, cache_misses

logger = logging.getLogger(__name__)

_REDIS_URL = os.environ.get("REDIS_URL", "").strip()
# Short enough that a wedged Redis costs ~250ms once per call site, not
# request-queue pileups. redis-py raises TimeoutError, which we treat as
# any other error: count it and miss.
_SOCKET_TIMEOUT_SECONDS = 0.25

_client: Any = None
_client_init_failed = False

# TTL for keys the leader refresher pre-warms every cycle (60s). Generous on
# purpose: it's a safety net against a dead refresher, not the freshness
# mechanism. Each cycle overwrites the key with fresh data, so users
# normally never see a miss OR data older than one cycle.
WARM_TTL_SECONDS = 15 * 60


def _namespace(key: str) -> str:
    return key.split(":", 1)[0]


# ── Key builders ─────────────────────────────────────────────────────────
# Shared by the read routes (lazy fill on miss) and the leader refresher
# (proactive warm every cycle) so the two can never drift apart.


def stats_key(
    character: str | None = None,
    win: str | None = None,
    ascension: str | None = None,
    game_mode: str | None = None,
    players: str | None = None,
    username: str | None = None,
) -> str:
    return (
        f"stats:{character or ''}:{win or ''}:{ascension or ''}:"
        f"{game_mode or ''}:{players or ''}:{username or ''}"
    )


def leaderboard_key(
    category: str = "fastest",
    character: str | None = None,
    players: str | None = None,
    game_mode: str | None = None,
    today: bool = False,
    page: int = 1,
    limit: int = 50,
    ascension_min: int | None = None,
    winrate_min: float | None = None,
    build_id: str | None = None,
) -> str:
    return (
        f"leaderboard:{category}:{(character or '').upper()}:{players or ''}:"
        f"{game_mode or ''}:{int(today)}:{page}:{limit}:"
        f"{ascension_min if ascension_min is not None else ''}:"
        f"{winrate_min if winrate_min is not None else ''}:"
        f"{build_id or ''}"
    )


def entity_scores_key(
    entity_type: str,
    act: int | None = None,
    character: str | None = None,
    bracket: str | None = None,
) -> str:
    return (
        f"entity_scores:{entity_type}:{act or 'all'}:"
        f"{character or 'all'}:{bracket or 'all'}"
    )


def _get_client() -> Any:
    """Lazy per-process client; None when disabled or construction failed."""
    global _client, _client_init_failed
    if not _REDIS_URL or _client_init_failed:
        return None
    if _client is None:
        try:
            import redis

            _client = redis.Redis.from_url(
                _REDIS_URL,
                socket_timeout=_SOCKET_TIMEOUT_SECONDS,
                socket_connect_timeout=_SOCKET_TIMEOUT_SECONDS,
                decode_responses=True,
            )
        except Exception:
            # Bad URL or redis-py missing: disable for this process rather
            # than retrying (and logging) on every request.
            logger.warning(
                "app cache disabled: redis client init failed", exc_info=True
            )
            _client_init_failed = True
            return None
    return _client


def enabled() -> bool:
    """True when a cache backend is configured (not necessarily reachable)."""
    return bool(_REDIS_URL) and not _client_init_failed


def get_json(key: str) -> Any:
    """Cached value for `key`, or None on miss/disabled/error."""
    client = _get_client()
    if client is None:
        return None
    ns = _namespace(key)
    try:
        raw = client.get(key)
    except Exception:
        cache_errors.labels(namespace=ns, operation="get").inc()
        return None
    if raw is None:
        cache_misses.labels(namespace=ns).inc()
        return None
    try:
        value = json.loads(raw)
    except ValueError:
        cache_errors.labels(namespace=ns, operation="decode").inc()
        return None
    cache_hits.labels(namespace=ns).inc()
    return value


def set_json(key: str, value: Any, ttl_seconds: int) -> None:
    """Store `value` under `key` for `ttl_seconds`. No-ops on any failure."""
    client = _get_client()
    if client is None:
        return
    try:
        client.set(key, json.dumps(value), ex=ttl_seconds)
    except Exception:
        cache_errors.labels(namespace=_namespace(key), operation="set").inc()


def acquire_lock(key: str, ttl_seconds: int = 30) -> bool:
    """Best-effort single-flight lock: SET NX with a TTL so a dead holder
    never wedges the key. Fail-open like the rest of this module — Redis
    disabled or erroring reports the lock as acquired, so callers proceed
    exactly as if there were no lock. Release with delete()."""
    client = _get_client()
    if client is None:
        return True
    try:
        return bool(client.set(key, "1", nx=True, ex=ttl_seconds))
    except Exception:
        cache_errors.labels(namespace=_namespace(key), operation="lock").inc()
        return True


def delete(key: str) -> None:
    """Drop one key. No-ops on any failure."""
    client = _get_client()
    if client is None:
        return
    try:
        client.delete(key)
    except Exception:
        cache_errors.labels(namespace=_namespace(key), operation="delete").inc()


def delete_pattern(pattern: str) -> int:
    """Drop every key matching a glob pattern (SCAN-based, non-blocking).

    For deploy-time invalidation of long-TTL namespaces, e.g.
    delete_pattern("entity_scores:*"). Returns keys deleted (0 on failure).
    """
    client = _get_client()
    if client is None:
        return 0
    deleted = 0
    try:
        for batch_key in client.scan_iter(match=pattern, count=500):
            client.delete(batch_key)
            deleted += 1
    except Exception:
        cache_errors.labels(
            namespace=_namespace(pattern), operation="delete_pattern"
        ).inc()
    return deleted


def info() -> dict:
    """Operational snapshot for the admin overview. Fail-safe like the rest
    of this module: never raises, reports disabled/down states honestly."""
    if not _REDIS_URL:
        return {"enabled": False, "ok": False}
    client = _get_client()
    if client is None:
        return {"enabled": True, "ok": False}
    try:
        raw = client.info()
        hits = raw.get("keyspace_hits") or 0
        misses = raw.get("keyspace_misses") or 0
        total = hits + misses
        return {
            "enabled": True,
            "ok": True,
            "used_memory_human": raw.get("used_memory_human"),
            "maxmemory_human": raw.get("maxmemory_human"),
            "keys": sum(
                v.get("keys", 0)
                for k, v in raw.items()
                if k.startswith("db") and isinstance(v, dict)
            ),
            "hit_rate": round(hits / total * 100, 1) if total else None,
            "uptime_days": round((raw.get("uptime_in_seconds") or 0) / 86400, 1),
        }
    except Exception:
        return {"enabled": True, "ok": False}
