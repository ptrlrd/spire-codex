"""Recent activity feeds — errors, rate-limit hits, search.

These are read-only views over Prometheus + Mongo. Cuts
mean-time-to-discovery for a broken endpoint from "next time you
glance at Grafana" to "next time you open the admin dashboard."

## Sources

- **Recent errors**: re-uses the `spire_codex_api_errors_total`
  counter we already emit. The /metrics endpoint exposes counts per
  (method, path, status_code) — admin endpoint just sorts + paginates.
  For per-request *detail* we'd need to wire a separate ring buffer
  in `RequestLoggingMiddleware`; sketch a TODO for that.
- **Rate-limit hits**: same metric, filtered to `status_code="429"`.
  Per-IP detail requires a separate writer (the limiter doesn't log
  who got rejected). Sketch a small Mongo collection for this.
- **Search**: run hash / IP / seed / username free-text. The runs
  collection already has indexes on character / submitted_at /
  build_id; we'd add a sparse index on `client_ip` (new field —
  written by submit_run going forward) for IP search.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from ..dependencies import require_admin

router = APIRouter(
    prefix="/api/admin",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


# ── Recent errors ────────────────────────────────────────────
@router.get("/errors")
async def list_errors(request: Request):
    """Returns 4xx + 5xx counts in the last N minutes, grouped by
    (method, path, status_code).
    Query: `?since=15m` (default), `?status=4xx|5xx|all`."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.get("/errors/recent")
async def recent_error_requests(request: Request):
    """Last-N individual error requests with full request line.
    Requires the ring-buffer writer in RequestLoggingMiddleware to
    land first — without it, this endpoint can only report counts
    (above) not specific requests.

    TODO: add a sized-deque writer in middleware that captures
    {ts, method, path, status, ip, user_agent} for the last ~5000
    error requests in process memory (no persistence — cheap, OK to
    lose on restart)."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


# ── Rate-limit hits ──────────────────────────────────────────
@router.get("/rate-limit-hits")
async def recent_rate_limit_hits(request: Request):
    """Last N rate-limit rejections grouped by (endpoint, client_ip).
    Tells you whether to raise (legit user hitting cap) or lower
    (scraper).

    Requires the limiter to record rejections somewhere. Cheapest:
    a small Mongo collection `rate_limit_events` with a TTL index
    expiring after 7d. Writer hooks `RateLimitExceeded` exception
    handler (already registered in main.py)."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


# ── Search ───────────────────────────────────────────────────
@router.get("/search/runs")
async def search_runs(request: Request):
    """Free-text search across runs by hash / username / seed / IP.
    Query: `?q=<term>&kind=hash|username|seed|ip`. Returns matching
    run docs (capped at 100)."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.get("/search/guides")
async def search_guides(request: Request):
    """Title / author / body free-text search across guides."""
    raise HTTPException(status_code=501, detail="Not implemented yet")
