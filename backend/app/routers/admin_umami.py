"""Umami analytics passthrough for the admin dashboard.

Wraps `services/umami_client.py`. Backend holds Umami credentials
(env-injected from 1P) so the admin dashboard never sees them — it
just calls our backend with the admin token, we call Umami on its
behalf.

## Why two layers of caching

- `umami_client.py` caches each Umami response (5-60s TTL per endpoint)
  to keep dashboard polling cheap.
- These admin endpoints sit behind the existing CF cache rules but
  we explicitly set `Cache-Control: no-store` since stats need to
  feel live to the operator.

## Response shapes (all flat, ready to render)

  GET /api/admin/umami/active        → {"count": 12}
  GET /api/admin/umami/summary?period=24h
                                     → {pageviews, visitors, visits, ...}
  GET /api/admin/umami/top-pages     → [{path, count}, ...]
  GET /api/admin/umami/top-referrers → [{referrer, count}, ...]
  GET /api/admin/umami/countries     → [{code, count}, ...]
  GET /api/admin/umami/browsers      → {chrome: N, firefox: N, ...}

The dashboard wires these directly into the panels — no
re-shaping needed.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from ..dependencies import require_admin

router = APIRouter(
    prefix="/api/admin/umami",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


@router.get("/active")
async def active_visitors(request: Request):
    """Concurrent visitors right now. Dashboard polls every ~10s."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.get("/summary")
async def summary(request: Request):
    """Headline stats for the period.
    Query: `?period=1h|24h|7d|30d` (default 24h)."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.get("/top-pages")
async def top_pages(request: Request):
    """Most-viewed URLs in the period. Query: `?period=24h&limit=20`."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.get("/top-referrers")
async def top_referrers(request: Request):
    """Inbound traffic sources. Query: `?period=24h&limit=20`."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.get("/countries")
async def countries(request: Request):
    """Visitor distribution by country. Query: `?period=24h&limit=20`."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.get("/browsers")
async def browsers(request: Request):
    """Browser breakdown — useful for spotting bot waves (sudden
    headless-chrome spike). Query: `?period=24h`."""
    raise HTTPException(status_code=501, detail="Not implemented yet")
