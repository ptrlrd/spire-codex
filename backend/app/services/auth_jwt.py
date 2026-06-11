"""JWT creation, validation, and cookie management."""

from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

_JWT_SECRET = os.environ.get("JWT_SECRET", "").strip()
_JWT_ALGORITHM = "HS256"
_JWT_EXPIRY_DAYS = 7
_COOKIE_NAME = "spire_session"
_STATE_PURPOSE = "oauth_state"
_STATE_TTL_SECONDS = 600


def _get_secret() -> str:
    if not _JWT_SECRET:
        raise RuntimeError("JWT_SECRET env var is required")
    return _JWT_SECRET


def create_token(
    user_id: str,
    steam_id: str | None = None,
    discord_id: str | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(days=_JWT_EXPIRY_DAYS),
    }
    if steam_id:
        payload["steam_id"] = steam_id
    if discord_id:
        payload["discord_id"] = discord_id
    return jwt.encode(payload, _get_secret(), algorithm=_JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, _get_secret(), algorithms=[_JWT_ALGORITHM])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def create_oauth_state() -> str:
    """Signed, self-contained CSRF state for OAuth redirect flows.

    Stateless on purpose: the prod backend runs multiple uvicorn workers,
    so the /start and /callback requests can land on different processes.
    A signed token any worker can verify avoids a shared state store.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "purpose": _STATE_PURPOSE,
        "nonce": secrets.token_urlsafe(8),
        "iat": now,
        "exp": now + timedelta(seconds=_STATE_TTL_SECONDS),
    }
    return jwt.encode(payload, _get_secret(), algorithm=_JWT_ALGORITHM)


def verify_oauth_state(token: str) -> bool:
    if not token:
        return False
    try:
        payload = jwt.decode(token, _get_secret(), algorithms=[_JWT_ALGORITHM])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return False
    return payload.get("purpose") == _STATE_PURPOSE


def set_auth_cookie(response: JSONResponse, token: str) -> None:
    is_prod = os.environ.get("ENVIRONMENT", "").lower() in ("production", "prod")
    response.set_cookie(
        key=_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=is_prod,
        samesite="lax",
        path="/",
        max_age=_JWT_EXPIRY_DAYS * 86400,
    )


def clear_auth_cookie(response: JSONResponse) -> None:
    is_prod = os.environ.get("ENVIRONMENT", "").lower() in ("production", "prod")
    response.delete_cookie(
        key=_COOKIE_NAME,
        path="/",
        secure=is_prod,
        samesite="lax",
    )


def get_current_user(request: Request) -> dict | None:
    token = request.cookies.get(_COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        return None

    payload = decode_token(token)
    if not payload:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    from .users_db import get_user

    user = get_user(user_id)
    if not user:
        return None

    return user


def require_user(request: Request) -> dict:
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def _admin_ids() -> frozenset[str]:
    """Allowlisted ids from ADMIN_IDS (comma-separated). Accepts site user
    ids, Steam64 ids, or Discord ids so the operator can use whichever
    login they have handy. Empty (the default) means nobody is an admin:
    the panel fails closed on a missing env var."""
    return frozenset(
        x.strip() for x in os.environ.get("ADMIN_IDS", "").split(",") if x.strip()
    )


def is_admin(user: dict | None) -> bool:
    if not user:
        return False
    ids = _admin_ids()
    if not ids:
        return False
    candidates = (
        str(user.get("_id") or ""),
        str(user.get("steam_id") or ""),
        str(user.get("discord_id") or ""),
    )
    return any(c and c in ids for c in candidates)


def require_admin(request: Request) -> dict:
    """Router-level guard for /api/admin. Checks the allowlist per request
    (not as a JWT claim) so removing an id takes effect immediately.
    Non-admins get a 404, not a 403: with the code public there is no point
    confirming to a probe that the surface exists and they lack access."""
    user = get_current_user(request)
    if not user or not is_admin(user):
        raise HTTPException(status_code=404, detail="Not found")
    request.state.admin_user = user
    return user
