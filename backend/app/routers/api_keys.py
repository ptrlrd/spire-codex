"""User-managed API keys — create / list / revoke.

Each key belongs to the logged-in account and carries a rate-limit tier (new
keys start at 'registered'). The raw key is returned once, at creation; send it
as the ``X-API-Key`` header to get that key's tier's rate limit.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..services import api_key_service, rate_limit_config
from ..services.auth_jwt import require_user

router = APIRouter(prefix="/api/keys", tags=["API Keys"])

# Public info route (no auth): the current tier caps, so the developers page
# shows the live admin-tuned numbers instead of hardcoded ones that drift.
info_router = APIRouter(prefix="/api", tags=["API Keys"])


@info_router.get("/rate-limits")
def rate_limits_info():
    """The public rate-limit tiers. Browse = un-keyed traffic (per IP); keyed
    tiers apply per ``X-API-Key``. All caps count per endpoint. Endpoint clamps
    and the kill switch are operator details and not exposed here."""
    cfg = rate_limit_config.get_config()
    return {
        "browse": cfg.get("default_limit"),
        "tiers": cfg.get("tiers") or {},
        "scope": "per endpoint",
    }


def _uid(user: dict) -> str:
    return str(user.get("_id") or user.get("id") or "")


@router.get("")
def list_keys(user: dict = Depends(require_user)):
    """Your API keys (metadata only — the raw key is never shown again)."""
    return {"keys": api_key_service.list_keys(_uid(user))}


class CreateKeyRequest(BaseModel):
    label: str = Field(
        default="", max_length=80, description="A note to remember this key by."
    )


@router.post("")
def create_key(body: CreateKeyRequest, user: dict = Depends(require_user)):
    """Create a key (registered tier). The ``raw_key`` in the response is shown
    only here — store it now, it can't be recovered later."""
    try:
        return api_key_service.create_key(_uid(user), body.label)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{key_id}")
def revoke_key(key_id: str, user: dict = Depends(require_user)):
    """Revoke one of your keys. Stops working within a few seconds."""
    if not api_key_service.revoke_key(_uid(user), key_id):
        raise HTTPException(status_code=404, detail="key not found")
    return {"ok": True}
