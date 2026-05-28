"""JWT creation, validation, and cookie management."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

_JWT_SECRET = os.environ.get("JWT_SECRET", "").strip()
_JWT_ALGORITHM = "HS256"
_JWT_EXPIRY_DAYS = 7
_COOKIE_NAME = "spire_session"


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
