"""Discord OAuth2 sign-in.

Server-side redirect flow (simpler than the popup-based Steam flow):
1. GET /api/auth/discord/start -- redirects to Discord's authorize page
2. GET /api/auth/discord/callback -- exchanges code for token, creates user, sets cookie, redirects to frontend
"""

from __future__ import annotations

import logging
import os
import secrets
import time

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from slowapi import Limiter

from ..dependencies import client_ip

logger = logging.getLogger("spire-codex.auth")

router = APIRouter(prefix="/api/auth/discord", tags=["Auth"])
limiter = Limiter(key_func=client_ip)

_DISCORD_API = "https://discord.com/api/v10"
_DISCORD_AUTHORIZE = "https://discord.com/api/oauth2/authorize"
_DISCORD_TOKEN = "https://discord.com/api/oauth2/token"

_STATE_TTL = 300
_MAX_STATES = 5000
_states: dict[str, float] = {}


def _get_discord_config() -> tuple[str, str]:
    client_id = os.environ.get("DISCORD_CLIENT_ID", "").strip()
    client_secret = os.environ.get("DISCORD_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise RuntimeError("DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET are required")
    return client_id, client_secret


def _purge_states() -> None:
    cutoff = time.time() - _STATE_TTL
    stale = [s for s, t in _states.items() if t < cutoff]
    for s in stale:
        _states.pop(s, None)


def _frontend_url(request: Request) -> str:
    explicit = os.environ.get("SPIRE_CODEX_PUBLIC_BASE")
    if explicit:
        return explicit.rstrip("/")
    base = str(request.base_url).rstrip("/")
    return base


@router.get("/start")
@limiter.limit("20/minute")
async def start(request: Request):
    client_id, _ = _get_discord_config()

    _purge_states()
    if len(_states) >= _MAX_STATES:
        oldest_key = min(_states, key=_states.get)
        _states.pop(oldest_key, None)

    state = secrets.token_urlsafe(32)
    _states[state] = time.time()

    base = _frontend_url(request)
    redirect_uri = f"{base}/api/auth/discord/callback"

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "identify email",
        "state": state,
        "prompt": "consent",
    }
    url = f"{_DISCORD_AUTHORIZE}?{'&'.join(f'{k}={v}' for k, v in params.items())}"
    return RedirectResponse(url)


@router.get("/callback")
async def callback(request: Request):
    base = _frontend_url(request)

    error = request.query_params.get("error")
    if error:
        logger.info("discord-auth denied: %s", error)
        return RedirectResponse(f"{base}/login?error=cancelled")

    code = request.query_params.get("code")
    state = request.query_params.get("state")

    if not code or not state:
        return RedirectResponse(f"{base}/login?error=invalid_response")

    _purge_states()
    if state not in _states:
        return RedirectResponse(f"{base}/login?error=invalid_session")
    _states.pop(state, None)

    client_id, client_secret = _get_discord_config()
    redirect_uri = f"{base}/api/auth/discord/callback"

    # Exchange code for access token
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            token_resp = await client.post(
                _DISCORD_TOKEN,
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
            logger.warning("discord token exchange failed: %s", token_resp.text[:200])
            return RedirectResponse(f"{base}/login?error=discord_failed")

        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            return RedirectResponse(f"{base}/login?error=discord_failed")
    except Exception as exc:
        logger.warning("discord token exchange error: %s", exc)
        return RedirectResponse(f"{base}/login?error=discord_unavailable")

    # Fetch user info from Discord
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            user_resp = await client.get(
                f"{_DISCORD_API}/users/@me",
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if user_resp.status_code != 200:
            logger.warning("discord user fetch failed: %s", user_resp.text[:200])
            return RedirectResponse(f"{base}/login?error=discord_failed")

        discord_user = user_resp.json()
    except Exception as exc:
        logger.warning("discord user fetch error: %s", exc)
        return RedirectResponse(f"{base}/login?error=discord_unavailable")

    discord_id = discord_user.get("id")
    discord_username = discord_user.get("global_name") or discord_user.get("username")
    email = discord_user.get("email")

    if not discord_id:
        return RedirectResponse(f"{base}/login?error=discord_failed")

    # If the user is already logged in (has a valid JWT), link Discord
    # to their existing account instead of creating a new one.
    try:
        from ..services.auth_jwt import get_current_user, create_token, set_auth_cookie
        from ..services.users_db import (
            find_or_create_by_discord,
            link_discord,
            update_email as _update_email,
        )

        existing_user = get_current_user(request)

        if existing_user and not existing_user.get("discord_id"):
            result = link_discord(existing_user["_id"], discord_id)
            if result.get("error"):
                return RedirectResponse(f"{base}/settings?error={result['error']}")
            if email and not existing_user.get("email"):
                _update_email(existing_user["_id"], email)
            user = existing_user
            user["discord_id"] = discord_id
        else:
            user = find_or_create_by_discord(discord_id, discord_username, email)

        token = create_token(
            user_id=user["_id"],
            steam_id=user.get("steam_id"),
            discord_id=discord_id,
        )

        needs_email = not user.get("email") and not email
        redirect_path = "/settings" if needs_email else "/settings?linked=discord"
        response = RedirectResponse(f"{base}{redirect_path}")
        set_auth_cookie(response, token)

        logger.info(
            "discord-auth ok discord_id=%s user=%s username=%s linked=%s",
            discord_id,
            user["_id"],
            discord_username,
            bool(existing_user),
        )
        return response
    except Exception as exc:
        logger.warning("discord-auth user creation failed: %s", exc)
        return RedirectResponse(f"{base}/login?error=discord_failed")
