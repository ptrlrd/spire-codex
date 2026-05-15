"""Admin-gated search analytics endpoints.

Reads searches.db and exposes top / recent / volume rollups. Gated by a
shared-secret header (`X-Admin-Token`) sourced from the `ADMIN_TOKEN`
env var. If the env var is missing the endpoints return 503 — explicit
"not configured" is easier to triage than silent 401s.

Query-string auth would have been simpler but tokens leak through
browser history and proxy access logs; a header keeps them out of the
URL surface even if someone copies the curl into Slack.
"""

import os

from fastapi import APIRouter, Header, HTTPException, Query

from ..services import searches_db

router = APIRouter(prefix="/api/admin/searches", tags=["Admin"])


def _require_admin(token: str | None) -> None:
    expected = os.environ.get("ADMIN_TOKEN")
    if not expected:
        # Deliberate over silent 401 — operator hasn't configured the
        # secret yet, the endpoint is just disabled, not authenticated.
        raise HTTPException(status_code=503, detail="Admin endpoints not configured")
    if token != expected:
        raise HTTPException(status_code=401, detail="Invalid admin token")


@router.get("/top")
def top(
    x_admin_token: str | None = Header(default=None),
    days: int = Query(default=7, ge=1, le=365),
    limit: int = Query(default=100, ge=1, le=1000),
    entity_type: str | None = None,
):
    """Most-searched queries in the last N days, with unique-user counts."""
    _require_admin(x_admin_token)
    return {
        "days": days,
        "entity_type": entity_type,
        "results": searches_db.top_searches(
            days=days, limit=limit, entity_type=entity_type
        ),
    }


@router.get("/recent")
def recent(
    x_admin_token: str | None = Header(default=None),
    limit: int = Query(default=200, ge=1, le=2000),
    entity_type: str | None = None,
):
    """Most-recent searches, newest first. Useful for spot-checking live traffic."""
    _require_admin(x_admin_token)
    return {
        "entity_type": entity_type,
        "results": searches_db.recent_searches(limit=limit, entity_type=entity_type),
    }


@router.get("/volume")
def volume(
    x_admin_token: str | None = Header(default=None),
    days: int = Query(default=30, ge=1, le=365),
):
    """Per-day search volume + unique-user counts. Spot trends and traffic spikes."""
    _require_admin(x_admin_token)
    return {"days": days, "results": searches_db.search_volume(days=days)}
