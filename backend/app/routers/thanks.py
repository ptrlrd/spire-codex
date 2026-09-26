"""Public Thank You data and the Ko-fi webhook that feeds it."""

import hmac
import json
import os

from fastapi import APIRouter, HTTPException, Request, Response

from ..dependencies import shared_limiter
from ..services import rate_limit_config, thanks

router = APIRouter(prefix="/api", tags=["Site"])
limiter = shared_limiter
MAX_WEBHOOK_BYTES = 64 * 1024


@router.get("/thanks")
@limiter.limit(rate_limit_config.endpoint_limit("thanks.get", "120/minute"))
def get_thanks(request: Request, response: Response):
    """Who to thank: GitHub contributors, the special thanks list, and Ko-fi
    supporters who chose to be public. Refreshed every few minutes."""
    response.headers["Cache-Control"] = "public, max-age=300"
    return thanks.payload()


@router.post("/kofi/webhook", include_in_schema=False)
@limiter.limit(rate_limit_config.endpoint_limit("kofi.webhook", "60/minute"))
async def kofi_webhook(request: Request):
    expected = os.environ.get("KOFI_VERIFICATION_TOKEN", "").strip()
    if not expected:
        raise HTTPException(403, "webhook not configured")
    try:
        if int(request.headers.get("content-length") or 0) > MAX_WEBHOOK_BYTES:
            raise HTTPException(413, "payload too large")
    except ValueError:
        raise HTTPException(411, "length required")
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
    if not str(data.get("kofi_transaction_id") or "").strip():
        raise HTTPException(400, "missing kofi_transaction_id")
    if not thanks._enabled():
        raise HTTPException(503, "storage unavailable, retry later")
    res = thanks.record_supporter(data)
    return {"ok": True, "stored": True, "created": res["created"]}
