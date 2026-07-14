"""Admin control over the API's blanket rate limit.

Gated by the same require_admin as the rest of the operator surface. Lets me
raise/lower the global per-IP cap or switch it off entirely at runtime, without
a redeploy. Per-endpoint limits (auth, feedback, ...) are unaffected.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..services import rate_limit_config
from ..services.auth_jwt import require_admin

router = APIRouter(
    prefix="/api/admin/rate-limits",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


@router.get("")
def get_rate_limits():
    """Current blanket cap + whether limiting is on."""
    return rate_limit_config.get_config()


class RateLimitUpdate(BaseModel):
    default_limit: str | None = Field(
        default=None,
        description="Blanket per-IP cap, e.g. '300/minute' or '5/second'.",
    )
    enabled: bool | None = Field(
        default=None,
        description="False turns the blanket cap off (per-endpoint limits stay).",
    )


@router.put("")
def set_rate_limits(body: RateLimitUpdate):
    """Change the blanket cap and/or toggle it. Takes effect across workers
    within the config cache window (~15s)."""
    try:
        return rate_limit_config.set_config(body.default_limit, body.enabled)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
