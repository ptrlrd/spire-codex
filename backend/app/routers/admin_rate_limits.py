"""Admin control over the API's blanket rate limit.

Gated by the same require_admin as the rest of the operator surface. Lets me
raise/lower the global per-IP cap or switch it off entirely at runtime, without
a redeploy. Per-endpoint limits (auth, feedback, ...) are unaffected.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..services import rate_limit_config
from ..services.auth_jwt import require_admin
from .admin import _audit

router = APIRouter(
    prefix="/api/admin/rate-limits",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


@router.get("")
def get_rate_limits(request: Request):
    """Current browse cap, per-tier caps, per-endpoint caps (with their
    hardcoded defaults), and whether limiting is on."""
    _audit(request)
    return {
        **rate_limit_config.get_config(),
        "endpoint_defaults": rate_limit_config.endpoint_defaults(),
    }


class OverrideItem(BaseModel):
    path: str = Field(description="Path prefix to clamp, e.g. '/api/runs'.")
    limit: str = Field(description="Cap for that prefix, e.g. '30/minute'.")


class RateLimitUpdate(BaseModel):
    default_limit: str | None = Field(
        default=None,
        description="Un-keyed browse cap (per IP), e.g. '300/minute'.",
    )
    tiers: dict[str, str] | None = Field(
        default=None,
        description="Per API-key tier caps, e.g. {'general': '15/minute', ...}.",
    )
    overrides: list[OverrideItem] | None = Field(
        default=None,
        description=(
            "Endpoint clamps (replaces the whole list). Longest matching prefix "
            "wins and applies to every tier; /api/admin can't be clamped."
        ),
    )
    endpoint_limits: dict[str, str] | None = Field(
        default=None,
        description=(
            "Per-endpoint caps keyed by knob name (replaces the whole map). "
            "An empty value reverts that endpoint to its hardcoded default. "
            "These ignore the enabled kill switch, like the old hardcoded "
            "limits did."
        ),
    )
    enabled: bool | None = Field(
        default=None,
        description="False turns limiting off (per-endpoint limits stay).",
    )


@router.put("")
def set_rate_limits(body: RateLimitUpdate, request: Request):
    """Change the browse cap, tier caps, endpoint clamps, per-endpoint caps,
    and/or toggle limiting. Takes effect across workers within the config
    cache window (~15s)."""
    _audit(request)
    try:
        return rate_limit_config.set_config(
            body.default_limit,
            body.enabled,
            body.tiers,
            [o.model_dump() for o in body.overrides]
            if body.overrides is not None
            else None,
            body.endpoint_limits,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
