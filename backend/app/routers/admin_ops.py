"""Operational toggles — feature flags, cache purge, data refresh,
maintenance-mode banner.

## Feature flags

Backend already supports env-var kill switches (`DISABLE_RUN_SUBMISSIONS`
is the existing example). The flag table generalizes that: a Mongo
doc `app_config.flags` mapping `slug -> bool`, with the same 5s TTL
in-process cache pattern as `rate_limits_store`. Endpoints opt in by
calling `get_flag("submit_run_disabled", default=False)`.

Initial flag set:
- `submit_run_disabled`    — kill switch on POST /api/runs
- `claim_runs_disabled`    — kill switch on POST /api/runs/claim
- `read_only_mode`         — disable every write surface at once
- `maintenance_banner`     — site-wide banner text (separate from
                              flag bool — see below)

## Cache purge

You have `playbooks/purge-cache.yml`. This wraps the same CF API
call as a one-click admin endpoint — for the "I just re-rendered
QA cards, drop /qa from CF" or "the news article had a typo, purge
/news/<gid>" cases.

Three variants:
- /api/admin/ops/purge       — POST body: {"urls": [...]}
- /api/admin/ops/purge-tag   — POST body: {"tag": "..."}     (Enterprise feature)
- /api/admin/ops/purge-all   — DANGER, requires confirmation header

## Data refresh

Wraps existing service-layer functions:
- /api/admin/ops/refresh-stats         → calls refresh_stats_summary()
- /api/admin/ops/refresh-entity-scores → calls run_entity_stats._build_cache()
- /api/admin/ops/refresh-news          → invokes news_parser inline (or via webhook)

## Site-wide banner — covers announcements + maintenance + incidents

One Mongo doc `app_config.banner` with `{message, level,
expires_at, link?}`. Frontend layout reads this at SSR time and
renders a top banner if present + unexpired. Set via this endpoint,
vacated by deletion or TTL expiry.

The `level` field carries the editorial intent:
- `level: "info"`  — patch / feature announcement
                     ("Major Update #2 just dropped — see changelog →")
- `level: "warn"`  — degraded state
                     ("Run submissions paused for ~5min during DB migration")
- `level: "error"` — incident in progress
                     ("Stats are stale — investigating")

Same endpoint, same data model, three visual treatments on the
frontend. Operator picks the level; `expires_at` enforces a
self-vacating window so an announcement doesn't sit on the page
forever if you forget to clear it.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from ..dependencies import require_admin

router = APIRouter(
    prefix="/api/admin/ops",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


# ── Feature flags ────────────────────────────────────────────
@router.get("/flags")
async def list_flags(request: Request):
    """List every registered flag + its current value + its default."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.put("/flags/{slug}")
async def set_flag(slug: str, request: Request):
    """Body: `{"value": true}`. Activates a kill switch."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.delete("/flags/{slug}")
async def clear_flag(slug: str, request: Request):
    """Revert to the flag's hardcoded default."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


# ── Cache purge (wraps Cloudflare API) ───────────────────────
@router.post("/purge")
async def purge_urls(request: Request):
    """Body: `{"urls": ["https://spire-codex.com/news/123", ...]}`.
    POST to CF /zones/.../purge_cache with `files=[...]`."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/purge-all")
async def purge_everything(request: Request):
    """DANGER. Requires `X-Confirm: purge-all` header on top of the
    admin token. Wipes the entire zone's edge cache — uses one of
    the 5 daily purge-everything quotas on the Free plan."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


# ── Data refresh ─────────────────────────────────────────────
@router.post("/refresh-stats")
async def refresh_stats(request: Request):
    """Force the stats_summary materialization to re-run NOW instead
    of waiting for the 60s refresher tick. Useful after bulk moderation
    or back-fill imports."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/refresh-entity-scores")
async def refresh_entity_scores(request: Request):
    """Rebuild the Codex Score cache. Slow (~5-10s); blocks on
    completion. Same as the startup pre-warm."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/refresh-news")
async def refresh_news(request: Request):
    """Run news_parser inline. Normally a cron does this every 6 hours
    — manual trigger is for when a hot Steam announcement drops and
    you don't want to wait."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


# ── Site-wide banner (announcements + maintenance + incidents) ──
@router.get("/banner")
async def get_banner(request: Request):
    """Current banner (if any). Frontend layout reads the public-side
    of this via /api/banner (separate, unauthenticated) — admin GET
    returns the same shape plus internal metadata (created_by, etc.)."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.put("/banner")
async def set_banner(request: Request):
    """Body shape:
        {
          "message": "Major Update #2 just dropped — see changelog →",
          "level":   "info" | "warn" | "error",
          "expires_at": "2026-05-21T00:00:00Z",
          "link":    "/changelog#1.0.7"      // optional, clickable
        }
    Banner auto-vanishes after `expires_at` so an announcement
    doesn't outlive its relevance if you forget to clear it. Use
    `level: "info"` for patch announcements, `warn` for degraded
    state, `error` for active incidents — frontend renders three
    visual treatments."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.delete("/banner")
async def clear_banner(request: Request):
    """Drop the banner immediately."""
    raise HTTPException(status_code=501, detail="Not implemented yet")
