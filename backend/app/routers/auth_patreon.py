"""Patreon link for the paid API-key tier.

Not a sign-in method (unlike Steam/Discord): Patreon can only be LINKED to an
already-signed-in account, and its sole job is driving the ``is_paid`` flag
that promotes the account's API keys to the paid tier.

1. GET /api/auth/patreon/start -- requires login; redirects to Patreon's
   authorize page.
2. GET /api/auth/patreon/callback -- exchanges the code, reads the membership,
   links the Patreon id, sets is_paid, and flips the account's key tiers.
3. POST /api/auth/patreon/disconnect -- unlink; clears is_paid and demotes keys.
4. POST /api/auth/patreon/webhook -- membership changes from Patreon
   (members:create/update/delete), HMAC-MD5 signature-verified, keep the flag
   and key tiers in sync without the user revisiting the site.

Everything is env-gated: without PATREON_CLIENT_ID/SECRET the start route
bounces to settings with an error and the webhook 503s.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import urllib.parse

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from slowapi import Limiter

from ..dependencies import client_ip
from ..services import rate_limit_config
from ..services.auth_jwt import (
    clear_oauth_state_cookie,
    create_oauth_state,
    get_current_user,
    oauth_state_cookie,
    set_oauth_state_cookie,
    verify_oauth_state_bound,
)

logger = logging.getLogger("spire-codex.auth")

router = APIRouter(prefix="/api/auth/patreon", tags=["Auth"])
limiter = Limiter(key_func=client_ip, **rate_limit_config.storage_kwargs())

_PATREON_AUTHORIZE = "https://www.patreon.com/oauth2/authorize"
_PATREON_TOKEN = "https://www.patreon.com/api/oauth2/token"
_PATREON_IDENTITY = (
    "https://www.patreon.com/api/oauth2/v2/identity"
    "?include=memberships&fields%5Bmember%5D=patron_status"
)


def _get_patreon_config() -> tuple[str, str]:
    client_id = os.environ.get("PATREON_CLIENT_ID", "").strip()
    client_secret = os.environ.get("PATREON_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise RuntimeError("PATREON_CLIENT_ID and PATREON_CLIENT_SECRET are required")
    return client_id, client_secret


def _frontend_url(request: Request) -> str:
    explicit = os.environ.get("SPIRE_CODEX_PUBLIC_BASE")
    if explicit:
        return explicit.rstrip("/")
    return str(request.base_url).rstrip("/")


def _apply_paid(user_id: str, paid: bool) -> None:
    """Set the flag and move the account's keys between registered<->paid."""
    from ..services.api_key_service import sync_paid_tier
    from ..services.users_db import set_paid

    set_paid(user_id, paid)
    moved = sync_paid_tier(user_id, paid)
    logger.info("patreon paid=%s user=%s keys_moved=%d", paid, user_id, moved)


@router.get("/start")
@limiter.limit(rate_limit_config.endpoint_limit("auth_patreon.start", "20/minute"))
async def start(request: Request):
    base = _frontend_url(request)
    if not get_current_user(request):
        return RedirectResponse(f"{base}/settings?error=login_required")
    try:
        client_id, _ = _get_patreon_config()
    except RuntimeError:
        return RedirectResponse(f"{base}/settings?error=patreon_unconfigured")

    state = create_oauth_state()
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": f"{base}/api/auth/patreon/callback",
        "scope": "identity identity.memberships",
        "state": state,
    }
    response = RedirectResponse(
        f"{_PATREON_AUTHORIZE}?{urllib.parse.urlencode(params)}"
    )
    # Bind the state to this browser so the callback can reject a state that
    # wasn't minted for it (CSRF / forced-link protection).
    set_oauth_state_cookie(response, state)
    return response


@router.get("/callback")
async def callback(request: Request):
    base = _frontend_url(request)

    if request.query_params.get("error"):
        return RedirectResponse(f"{base}/settings?error=cancelled")
    code = request.query_params.get("code")
    state = request.query_params.get("state")
    if not code or not state:
        return RedirectResponse(f"{base}/settings?error=invalid_response")
    if not verify_oauth_state_bound(state, oauth_state_cookie(request)):
        resp = RedirectResponse(f"{base}/settings?error=invalid_session")
        clear_oauth_state_cookie(resp)
        return resp

    user = get_current_user(request)
    if not user:
        return RedirectResponse(f"{base}/settings?error=login_required")

    try:
        client_id, client_secret = _get_patreon_config()
    except RuntimeError:
        return RedirectResponse(f"{base}/settings?error=patreon_unconfigured")

    # Exchange the code, then read identity + membership in one authed call.
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            token_resp = await client.post(
                _PATREON_TOKEN,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": f"{base}/api/auth/patreon/callback",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            if token_resp.status_code != 200:
                logger.warning(
                    "patreon token exchange failed: %s", token_resp.text[:200]
                )
                return RedirectResponse(f"{base}/settings?error=patreon_failed")
            access_token = token_resp.json().get("access_token")
            if not access_token:
                return RedirectResponse(f"{base}/settings?error=patreon_failed")

            id_resp = await client.get(
                _PATREON_IDENTITY,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if id_resp.status_code != 200:
                logger.warning("patreon identity fetch failed: %s", id_resp.text[:200])
                return RedirectResponse(f"{base}/settings?error=patreon_failed")
            identity = id_resp.json()
    except Exception as exc:
        logger.warning("patreon oauth error: %s", exc)
        return RedirectResponse(f"{base}/settings?error=patreon_unavailable")

    patreon_id = (identity.get("data") or {}).get("id")
    if not patreon_id:
        return RedirectResponse(f"{base}/settings?error=patreon_failed")
    paid = any(
        (inc.get("attributes") or {}).get("patron_status") == "active_patron"
        for inc in identity.get("included") or []
        if inc.get("type") == "member"
    )

    from ..services.users_db import link_patreon

    result = link_patreon(user["_id"], patreon_id)
    if result.get("error"):
        return RedirectResponse(
            f"{base}/settings?error={urllib.parse.quote(result['error'])}"
        )
    _apply_paid(user["_id"], paid)
    response = RedirectResponse(f"{base}/settings?linked=patreon")
    clear_oauth_state_cookie(response)
    return response


@router.post("/disconnect")
@limiter.limit(rate_limit_config.endpoint_limit("auth_patreon.disconnect", "10/minute"))
async def disconnect(request: Request):
    from ..services.auth_jwt import require_user
    from ..services.users_db import unlink_patreon

    user = require_user(request)
    result = unlink_patreon(user["_id"])
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    # unlink already cleared is_paid; demote the keys to match.
    from ..services.api_key_service import sync_paid_tier

    sync_paid_tier(user["_id"], False)
    return result


@router.post("/webhook")
async def webhook(request: Request):
    """Membership changes pushed by Patreon. Signature is HMAC-MD5 of the raw
    body with the webhook secret (Patreon's scheme). Unknown patrons return 200
    so Patreon doesn't retry forever; only bad signatures are rejected."""
    secret = os.environ.get("PATREON_WEBHOOK_SECRET", "").strip()
    if not secret:
        raise HTTPException(status_code=503, detail="webhook not configured")

    body = await request.body()
    signature = request.headers.get("x-patreon-signature", "")
    expected = hmac.new(secret.encode(), body, hashlib.md5).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=403, detail="bad signature")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="bad payload") from None

    data = payload.get("data") or {}
    patreon_id = (
        ((data.get("relationships") or {}).get("user") or {}).get("data") or {}
    ).get("id")
    if not patreon_id:
        return {"ok": True, "matched": False}

    event = request.headers.get("x-patreon-event", "")
    if event.endswith(":delete"):
        paid = False
    else:
        paid = (data.get("attributes") or {}).get("patron_status") == "active_patron"

    from ..services.users_db import get_user_by_patreon_id

    user = get_user_by_patreon_id(patreon_id)
    if not user:
        # Patron without a linked site account; nothing to update.
        return {"ok": True, "matched": False}
    _apply_paid(user["_id"], paid)
    return {"ok": True, "matched": True, "paid": paid}
