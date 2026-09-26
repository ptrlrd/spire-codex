"""Public Thank You data and the Ko-fi webhook that feeds it."""

import hmac
import json
import os

from fastapi import APIRouter, HTTPException, Request, Response

from ..dependencies import shared_limiter
from ..services import rate_limit_config, thanks

router = APIRouter(prefix="/api", tags=["Site"])
limiter = shared_limiter


@router.get("/thanks")
@limiter.limit(rate_limit_config.endpoint_limit("thanks.get", "120/minute"))
def get_thanks(request: Request, response: Response):
    """Who to thank: GitHub contributors, the special thanks list, and Ko-fi
    supporters who chose to be public. Refreshed every few minutes."""
    response.headers["Cache-Control"] = (
        "public, max-age=300, stale-while-revalidate=3600"
    )
    return thanks.payload()


@router.post("/kofi/webhook", include_in_schema=False)
@limiter.limit(rate_limit_config.endpoint_limit("kofi.webhook", "60/minute"))
async def kofi_webhook(request: Request):
    expected = os.environ.get("KOFI_VERIFICATION_TOKEN", "").strip()
    if not expected:
        raise HTTPException(403, "webhook not configured")
    form = await request.form()
    raw = form.get("data")
    if not raw:
        raise HTTPException(400, "missing data")
    try:
        data = json.loads(str(raw))
    except ValueError:
        raise HTTPException(400, "bad data")
    token = str(data.get("verification_token") or "")
    if not hmac.compare_digest(token, expected):
        raise HTTPException(403, "bad token")
    if not thanks._enabled():
        return {"ok": True, "stored": False}
    res = thanks.record_supporter(data)
    return {"ok": True, "stored": True, "created": res["created"]}
