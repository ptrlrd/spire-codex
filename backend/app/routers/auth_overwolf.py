"""Login with Overwolf.

Server-side OIDC authorization code flow with PKCE against id.overwolf.com,
the same shape as the Twitch connector:
1. GET /api/auth/overwolf/start    -- redirects to Overwolf's consent page
2. GET /api/auth/overwolf/callback -- exchanges the code, reads the user from
   the userinfo endpoint, links the Overwolf id to the signed-in account (or
   signs in an account that already carries it), sets the cookie, redirects
   back to settings.

Identity comes from Overwolf's userinfo endpoint over the access token we
just exchanged, so nothing in the callback query is trusted on its own. The
subscription state rides along in the userinfo claims when the user granted
the subscriptions scope; the overlay link keeps refreshing it afterwards.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os
import secrets
import urllib.parse

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from ..dependencies import shared_limiter
from ..services import rate_limit_config, supporters
from ..services.auth_jwt import (
    clear_oauth_state_cookie,
    create_oauth_state,
    oauth_state_cookie,
    set_oauth_state_cookie,
    verify_oauth_state_bound,
)

logger = logging.getLogger("spire-codex.auth")

router = APIRouter(prefix="/api/auth/overwolf", tags=["Auth"])
limiter = shared_limiter

_OVERWOLF_AUTHORIZE = "https://id.overwolf.com/oidc/auth"
_OVERWOLF_TOKEN = "https://id.overwolf.com/oidc/token"
_OVERWOLF_USERINFO = "https://id.overwolf.com/oidc/me"
_SCOPES = "openid profile subscriptions"
_VERIFIER_COOKIE = "spire_ow_verifier"
_VERIFIER_TTL_SECONDS = 600


def _get_overwolf_config() -> tuple[str, str]:
    client_id = os.environ.get("OVERWOLF_CLIENT_ID", "").strip()
    client_secret = os.environ.get("OVERWOLF_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise RuntimeError("OVERWOLF_CLIENT_ID and OVERWOLF_CLIENT_SECRET are required")
    return client_id, client_secret


def _frontend_url(request: Request) -> str:
    explicit = os.environ.get("SPIRE_CODEX_PUBLIC_BASE")
    if explicit:
        return explicit.rstrip("/")
    return str(request.base_url).rstrip("/")


def _is_prod() -> bool:
    return os.environ.get("ENVIRONMENT", "").lower() in ("production", "prod")


def _set_verifier_cookie(response, verifier: str) -> None:
    response.set_cookie(
        key=_VERIFIER_COOKIE,
        value=verifier,
        httponly=True,
        secure=_is_prod(),
        samesite="lax",
        max_age=_VERIFIER_TTL_SECONDS,
        path="/",
    )


def _clear_verifier_cookie(response) -> None:
    response.delete_cookie(
        key=_VERIFIER_COOKIE, path="/", secure=_is_prod(), samesite="lax"
    )


def _code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _display_name(info: dict) -> str | None:
    for key in ("nickname", "username", "preferred_username"):
        value = info.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()[:64]
    return None


def _bounce(base: str, reason: str) -> RedirectResponse:
    response = RedirectResponse(f"{base}/settings?error={reason}")
    clear_oauth_state_cookie(response)
    _clear_verifier_cookie(response)
    return response


@router.get("/start")
@limiter.limit(rate_limit_config.endpoint_limit("auth_overwolf.start", "20/minute"))
async def start(request: Request):
    base = _frontend_url(request)
    try:
        client_id, _ = _get_overwolf_config()
    except RuntimeError:
        logger.warning(
            "overwolf start: OVERWOLF_CLIENT_ID / OVERWOLF_CLIENT_SECRET unset"
        )
        return RedirectResponse(f"{base}/settings?error=overwolf_unconfigured")

    state = create_oauth_state()
    verifier = secrets.token_urlsafe(48)
    params = {
        "client_id": client_id,
        "redirect_uri": f"{base}/api/auth/overwolf/callback",
        "response_type": "code",
        "scope": _SCOPES,
        "state": state,
        "code_challenge": _code_challenge(verifier),
        "code_challenge_method": "S256",
    }
    response = RedirectResponse(
        f"{_OVERWOLF_AUTHORIZE}?{urllib.parse.urlencode(params)}"
    )
    set_oauth_state_cookie(response, state)
    _set_verifier_cookie(response, verifier)
    return response


@router.get("/callback")
async def callback(request: Request):
    base = _frontend_url(request)

    error = request.query_params.get("error")
    if error:
        logger.info("overwolf-auth denied: %s", error)
        return _bounce(base, "cancelled")

    code = request.query_params.get("code")
    state = request.query_params.get("state")
    if not code or not state:
        return _bounce(base, "invalid_response")

    verifier = request.cookies.get(_VERIFIER_COOKIE, "")
    if not verifier or not verify_oauth_state_bound(state, oauth_state_cookie(request)):
        return _bounce(base, "invalid_session")

    try:
        client_id, client_secret = _get_overwolf_config()
    except RuntimeError:
        return _bounce(base, "overwolf_unconfigured")
    redirect_uri = f"{base}/api/auth/overwolf/callback"

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            token_resp = await client.post(
                _OVERWOLF_TOKEN,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "code_verifier": verifier,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        if token_resp.status_code != 200:
            logger.warning("overwolf token exchange failed: %s", token_resp.text[:200])
            return _bounce(base, "overwolf_failed")
        access_token = (token_resp.json() or {}).get("access_token")
        if not access_token:
            return _bounce(base, "overwolf_failed")
    except Exception as exc:
        logger.warning("overwolf token exchange error: %s", exc)
        return _bounce(base, "overwolf_unavailable")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            info_resp = await client.get(
                _OVERWOLF_USERINFO,
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if info_resp.status_code != 200:
            logger.warning("overwolf userinfo failed: %s", info_resp.text[:200])
            return _bounce(base, "overwolf_failed")
        info = info_resp.json()
        if not isinstance(info, dict):
            info = {}
    except Exception as exc:
        logger.warning("overwolf userinfo error: %s", exc)
        return _bounce(base, "overwolf_unavailable")

    ow_id = str(info.get("sub") or "").strip()
    if not ow_id:
        return _bounce(base, "overwolf_failed")
    nickname = _display_name(info)
    subscriptions = info.get("subscriptions")

    try:
        from ..services.auth_jwt import create_token, get_current_user, set_auth_cookie
        from ..services.users_db import get_user_by_overwolf_id

        existing_user = get_current_user(request)
        if existing_user and existing_user.get("overwolf_id") in (None, "", ow_id):
            user = existing_user
        else:
            user = get_user_by_overwolf_id(ow_id)
            if not user:
                response = RedirectResponse(f"{base}/?auth=steam_required")
                clear_oauth_state_cookie(response)
                _clear_verifier_cookie(response)
                return response

        result = supporters.link_overwolf_oauth(
            user["_id"], ow_id, access_token, nickname, subscriptions
        )
        if result.get("error"):
            return _bounce(base, urllib.parse.quote(result["error"]))

        token = create_token(
            user_id=user["_id"],
            steam_id=user.get("steam_id"),
            discord_id=user.get("discord_id"),
        )
        response = RedirectResponse(f"{base}/settings?linked=overwolf")
        set_auth_cookie(response, token)
        clear_oauth_state_cookie(response)
        _clear_verifier_cookie(response)
        logger.info(
            "overwolf-auth ok overwolf_id=%s user=%s linked=%s tier=%s",
            ow_id,
            user["_id"],
            bool(existing_user),
            result.get("tier"),
        )
        return response
    except Exception as exc:
        logger.warning("overwolf-auth link failed: %s", exc)
        return _bounce(base, "overwolf_failed")
