"""Umami HTTP API client — pulls real-time + historical stats into the
admin dashboard.

Why proxy instead of iframe-embedding the Umami UI:
- Cross-origin headaches with cookies + the admin's CF Access JWT.
- We can compose a *summary* view (active visitors + today's top
  pages + last-24h trend, in one panel) instead of bouncing between
  two UIs. The Umami UI is still there for deep dives — this is
  just the 80%-case glance.

## Auth

Umami's API requires a session token (POST /api/auth/login with
admin/password). We hold credentials in env (sourced from 1P), log
in once on first call, cache the token until it 401s, then refresh.

Env:
- UMAMI_API_URL          — e.g. https://analytics.spire-codex.com
- UMAMI_ADMIN_USERNAME   — usually `admin`
- UMAMI_ADMIN_PASSWORD   — the rotated admin password we set on first
                           login (stored at 1P → Umami → admin_password)
- UMAMI_WEBSITE_ID       — same UUID hardcoded in app/layout.tsx

## Caching

The admin dashboard hits these endpoints on every page load — a 30s
in-process cache per endpoint keeps that ~free and absorbs the
hot-reload patterns where an operator alt-tabs back and forth.
Stats that need to be truly real-time (active visitors) get a 5s
TTL.

## Endpoints we expose to the admin dashboard

These wrap the Umami API and pre-shape the response so the frontend
doesn't have to understand Umami's data model:

- get_active()                   → integer (concurrent visitors)
- get_summary(period="24h")      → {pageviews, visitors, visits, bounce_rate, avg_visit_duration}
- get_top_pages(period, limit)   → [{path, count}]
- get_top_referrers(period, limit)
- get_countries(period, limit)
- get_browsers(period)

All return plain dicts/lists ready to JSON-serialize.
"""

from __future__ import annotations

import os
import time
from typing import Any


_token_cache: dict[str, Any] = {"token": None, "expires_at": 0.0}
_data_cache: dict[str, tuple[float, Any]] = {}


def _api_base() -> str:
    return os.environ.get("UMAMI_API_URL", "").rstrip("/")


def _website_id() -> str:
    return os.environ.get("UMAMI_WEBSITE_ID", "")


def _login() -> str | None:
    """POST /api/auth/login. Cached until expiry."""
    # TODO: implement. Sketch:
    #   r = httpx.post(f"{_api_base()}/api/auth/login", json={
    #     "username": os.environ["UMAMI_ADMIN_USERNAME"],
    #     "password": os.environ["UMAMI_ADMIN_PASSWORD"],
    #   })
    #   _token_cache["token"] = r.json()["token"]
    #   _token_cache["expires_at"] = time.monotonic() + 23*3600   # Umami tokens last ~24h
    raise NotImplementedError


def _cached(key: str, ttl: float, fetch):
    """Generic in-process TTL cache wrapper. Per-endpoint TTL because
    'active visitors' needs to be near real-time (5s) but '24h top
    pages' can absorb 60s of staleness without anyone noticing."""
    now = time.monotonic()
    entry = _data_cache.get(key)
    if entry and now - entry[0] < ttl:
        return entry[1]
    value = fetch()
    _data_cache[key] = (now, value)
    return value


def get_active() -> int:
    """Current concurrent visitors. 5s cache — the dashboard polls
    this every ~10s so cache cost ≈ 1 Umami hit per 10s per worker."""
    # TODO: GET /api/websites/{id}/active
    raise NotImplementedError


def get_summary(period: str = "24h") -> dict:
    """Headline stats for the period (pageviews, visitors, visits,
    bounce_rate, avg_visit_duration). 60s cache."""
    # TODO: GET /api/websites/{id}/stats?startAt=...&endAt=...
    raise NotImplementedError


def get_top_pages(period: str = "24h", limit: int = 20) -> list[dict]:
    """Top URL paths by pageview count. 60s cache."""
    # TODO: GET /api/websites/{id}/metrics?type=url&startAt=...
    raise NotImplementedError


def get_top_referrers(period: str = "24h", limit: int = 20) -> list[dict]:
    """Top inbound referrer domains. 60s cache."""
    raise NotImplementedError


def get_countries(period: str = "24h", limit: int = 20) -> list[dict]:
    """Top countries by visitor count. 60s cache."""
    raise NotImplementedError


def get_browsers(period: str = "24h") -> dict:
    """Browser breakdown — useful for spotting bot waves (sudden
    spike in headless-chrome user agents). 60s cache."""
    raise NotImplementedError
