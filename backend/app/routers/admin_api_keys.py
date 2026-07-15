"""Admin management of API keys: list everyone's keys, change a key's tier
(grant academia / paid), revoke any key. Same require_admin gate as the rest
of the operator surface.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..services import api_key_service
from ..services.auth_jwt import require_admin
from .admin import _audit

router = APIRouter(
    prefix="/api/admin/keys",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


@router.get("")
def list_keys(request: Request, q: str | None = None, limit: int = 200):
    """All keys, newest first, owner usernames joined. `q` filters by
    username, label, or user/key id."""
    _audit(request)
    return {
        "keys": api_key_service.admin_list_keys(q, limit),
        "tiers": list(api_key_service.TIERS),
    }


class TierUpdate(BaseModel):
    tier: str = Field(description="general | registered | academia | paid")


@router.put("/{key_id}")
def change_tier(key_id: str, body: TierUpdate, request: Request):
    """Move a key to another tier (e.g. grant academia). Live within seconds."""
    _audit(request)
    if body.tier not in api_key_service.TIERS:
        raise HTTPException(status_code=400, detail=f"unknown tier '{body.tier}'")
    if not api_key_service.set_tier(key_id, body.tier):
        raise HTTPException(status_code=404, detail="key not found")
    return {"ok": True, "tier": body.tier}


@router.delete("/{key_id}")
def revoke_key(key_id: str, request: Request):
    """Revoke any user's key. Stops working within seconds."""
    _audit(request)
    if not api_key_service.admin_revoke(key_id):
        raise HTTPException(status_code=404, detail="key not found")
    return {"ok": True}
