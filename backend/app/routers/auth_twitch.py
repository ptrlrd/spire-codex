"""Twitch OAuth2 sign-in.

Server-side redirect flow, the same shape as the Discord connector:
1. GET /api/auth/twitch/start    -- redirects to Twitch's authorize page
2. GET /api/auth/twitch/callback -- exchanges code for token, links/creates the
   user, sets the cookie, redirects back to the frontend.

Linking Twitch is what powers the live features: the /live roster shows a
"Watch on Twitch" link for a present player whose account has a Twitch login,
and curated partners who are both live in the mod and streaming float to the
top of the roster.
"""

from __future__ import annotations

import logging
import os
import urllib.parse

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from slowapi import Limiter

from ..dependencies import client_ip
from ..services import rate_limit_config
from ..services.auth_jwt import create_oauth_state, verify_oauth_state

logger = logging.getLogger("spire-codex.auth")

router = APIRouter(prefix="/api/auth/twitch", tags=["Auth"])
limiter = Limiter(key_func=client_ip, **rate_limit_config.storage_kwargs())

_TWITCH_AUTHORIZE = "https://id.twitch.tv/oauth2/authorize"
_TWITCH_TOKEN = "https://id.twitch.tv/oauth2/token"
_TWITCH_USERS = "https://api.twitch.tv/helix/users"


def _get_twitch_config() -> tuple[str, str]:
    client_id = os.environ.get("TWITCH_CLIENT_ID", "").strip()
    client_secret = os.environ.get("TWITCH_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise RuntimeError("TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are required")
    return client_id, client_secret


def _frontend_url(request: Request) -> str:
    explicit = os.environ.get("SPIRE_CODEX_PUBLIC_BASE")
    if explicit:
        return explicit.rstrip("/")
    base = str(request.base_url).rstrip("/")
    return base


@router.get("/start")
@limiter.limit("20/minute")
async def start(request: Request):
    base = _frontend_url(request)
    try:
        client_id, _ = _get_twitch_config()
    except RuntimeError:
        # Creds not configured in this environment: send the user back to
        # settings with a clear reason instead of a raw 500.
        logger.warning("twitch start: TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET unset")
        return RedirectResponse(f"{base}/settings?error=twitch_unconfigured")

    state = create_oauth_state()

    redirect_uri = f"{base}/api/auth/twitch/callback"

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        # user:read:email lets the Helix /users call return the account email,
        # the same identity scope the Discord flow asks for.
        "scope": "user:read:email",
        "state": state,
        # Twitch's equivalent of Discord's prompt=consent: always show the
        # consent screen so a user can pick which Twitch account to connect.
        "force_verify": "true",
    }
    url = f"{_TWITCH_AUTHORIZE}?{urllib.parse.urlencode(params)}"
    return RedirectResponse(url)


@router.get("/callback")
async def callback(request: Request):
    base = _frontend_url(request)

    error = request.query_params.get("error")
    if error:
        logger.info("twitch-auth denied: %s", error)
        return RedirectResponse(f"{base}/settings?error=cancelled")

    code = request.query_params.get("code")
    state = request.query_params.get("state")

    if not code or not state:
        return RedirectResponse(f"{base}/settings?error=invalid_response")

    if not verify_oauth_state(state):
        return RedirectResponse(f"{base}/settings?error=invalid_session")

    client_id, client_secret = _get_twitch_config()
    redirect_uri = f"{base}/api/auth/twitch/callback"

    # Exchange code for an access token.
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            token_resp = await client.post(
                _TWITCH_TOKEN,
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_uri,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        if token_resp.status_code != 200:
            logger.warning("twitch token exchange failed: %s", token_resp.text[:200])
            return RedirectResponse(f"{base}/settings?error=twitch_failed")

        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            return RedirectResponse(f"{base}/settings?error=twitch_failed")
    except Exception as exc:
        logger.warning("twitch token exchange error: %s", exc)
        return RedirectResponse(f"{base}/settings?error=twitch_unavailable")

    # Fetch the user from Helix. The Client-Id header is required alongside the
    # bearer token for every Helix call.
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            user_resp = await client.get(
                _TWITCH_USERS,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Client-Id": client_id,
                },
            )
        if user_resp.status_code != 200:
            logger.warning("twitch user fetch failed: %s", user_resp.text[:200])
            return RedirectResponse(f"{base}/settings?error=twitch_failed")

        payload = user_resp.json()
        data = payload.get("data") or []
        twitch_user = data[0] if data else {}
    except Exception as exc:
        logger.warning("twitch user fetch error: %s", exc)
        return RedirectResponse(f"{base}/settings?error=twitch_unavailable")

    twitch_id = twitch_user.get("id")
    twitch_login = twitch_user.get("login")
    twitch_display = twitch_user.get("display_name") or twitch_login
    email = twitch_user.get("email")

    if not twitch_id or not twitch_login:
        return RedirectResponse(f"{base}/settings?error=twitch_failed")

    # If the user is already logged in (valid JWT) and has no Twitch yet, link
    # Twitch to that account; otherwise sign them in by Twitch (creating the
    # account on first sight, the same as the Discord flow).
    try:
        from ..services.auth_jwt import create_token, get_current_user, set_auth_cookie
        from ..services.users_db import (
            find_or_create_by_twitch,
            link_twitch,
            update_email as _update_email,
        )

        existing_user = get_current_user(request)

        if existing_user and not existing_user.get("twitch_id"):
            result = link_twitch(
                existing_user["_id"], twitch_id, twitch_login, twitch_display
            )
            if result.get("error"):
                return RedirectResponse(f"{base}/settings?error={result['error']}")
            if email and not existing_user.get("email"):
                _update_email(existing_user["_id"], email)
            user = existing_user
            user["twitch_id"] = twitch_id
        else:
            user = find_or_create_by_twitch(
                twitch_id, twitch_login, twitch_display, email
            )

        token = create_token(
            user_id=user["_id"],
            steam_id=user.get("steam_id"),
            discord_id=user.get("discord_id"),
        )

        # Link any runs already on file under this account's Steam id, so a
        # Twitch sign-in on an account that later adds Steam still shows runs.
        if os.environ.get("MONGO_URL", "").strip() and user.get("steam_id"):
            try:
                from ..services.runs_db_mongo import backfill_user_runs

                linked = backfill_user_runs(
                    user["_id"],
                    steam_id=user.get("steam_id"),
                    discord_id=user.get("discord_id"),
                    username=user.get("username"),
                )
                if linked:
                    logger.info(
                        "twitch-auth linked %d run(s) to user=%s", linked, user["_id"]
                    )
            except Exception as exc:
                logger.warning("twitch-auth run backfill failed: %s", exc)

        response = RedirectResponse(f"{base}/settings?linked=twitch")
        set_auth_cookie(response, token)

        logger.info(
            "twitch-auth ok twitch_id=%s login=%s user=%s linked=%s",
            twitch_id,
            twitch_login,
            user["_id"],
            bool(existing_user),
        )
        return response
    except Exception as exc:
        logger.warning("twitch-auth user creation failed: %s", exc)
        return RedirectResponse(f"{base}/settings?error=twitch_failed")
