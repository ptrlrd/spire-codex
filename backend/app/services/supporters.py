"""Supporter status across the three ways someone can back the site: a
linked Patreon (is_paid), a monthly Ko-fi membership matched to the account
by a salted email hash, and an Overwolf subscription verified server-side
from the overlay's signed session token. The flag turns off site ads and
lists the person on the Thank You page when they opt in. Nothing is pushed
to us by any of the three, so every source carries an expiry and lapses on
its own unless it is re-verified."""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger("spire-codex")

OVERWOLF_JWKS_URL = os.environ.get(
    "OVERWOLF_JWKS_URL", "https://accounts.overwolf.com/oauth2/jwks.json"
)
OVERWOLF_SUBSCRIPTIONS_URL = os.environ.get(
    "OVERWOLF_SUBSCRIPTIONS_URL", "https://subscriptions-api.overwolf.com"
)
OVERWOLF_GRACE_DAYS = int(os.environ.get("OVERWOLF_GRACE_DAYS", "35"))
KOFI_MONTHLY_GRACE_DAYS = int(os.environ.get("KOFI_MONTHLY_GRACE_DAYS", "40"))
_ACTIVE_STATES = {"active", "cancelled", "canceled", "grace"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Any) -> datetime | None:
    if not isinstance(dt, datetime):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _iso(dt: Any) -> str | None:
    dt = _aware(dt)
    return dt.isoformat() if dt else None


def email_hash(email: str | None) -> str | None:
    """Salted, non-reversible fingerprint of an email so a Ko-fi membership
    can be matched to an account without either side storing the address."""
    cleaned = (email or "").strip().lower()
    if not cleaned:
        return None
    salt = os.environ.get("SUPPORTER_EMAIL_SALT") or os.environ.get("JWT_SECRET", "")
    return hmac.new(salt.encode(), cleaned.encode(), hashlib.sha256).hexdigest()


class OverwolfError(ValueError):
    pass


def _overwolf_config() -> tuple[str, str]:
    return (
        os.environ.get("OVERWOLF_STORE_ID", "").strip(),
        os.environ.get("OVERWOLF_EXTENSION_ID", "").strip(),
    )


def verify_overwolf_token(token: str) -> dict:
    """Validate the overlay's Overwolf session token against Overwolf's
    published keys and return its claims. Raises OverwolfError on anything
    that is not a signed, unexpired Overwolf token."""
    import jwt

    token = (token or "").strip()
    if not token or token.count(".") != 2:
        raise OverwolfError("missing token")
    try:
        client = jwt.PyJWKClient(OVERWOLF_JWKS_URL, cache_keys=True)
        key = client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            key.key,
            algorithms=["RS256", "ES256"],
            options={"verify_aud": False},
        )
    except Exception as exc:
        raise OverwolfError(f"invalid token: {exc}") from exc
    user_id = str(
        claims.get("sub") or claims.get("userId") or claims.get("uuid") or ""
    ).strip()
    if not user_id:
        raise OverwolfError("token has no user id")
    claims["overwolf_user_id"] = user_id
    return claims


def fetch_overwolf_subscription(token: str) -> dict | None:
    """Ask Overwolf which of our packages this user holds. None when the
    store is not configured, so the link still records identity but the
    flag stays off until a real check passes."""
    import httpx

    store_id, extension_id = _overwolf_config()
    if not store_id:
        return None
    url = f"{OVERWOLF_SUBSCRIPTIONS_URL}/subscriptions/{store_id}"
    resp = httpx.get(
        url,
        params={"extensionId": extension_id} if extension_id else None,
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    if resp.status_code == 404:
        return {"state": "none", "package_id": None}
    resp.raise_for_status()
    rows = resp.json()
    if isinstance(rows, dict):
        rows = rows.get("subscriptions") or rows.get("data") or [rows]
    best: dict | None = None
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        state = str(row.get("state") or "").lower()
        candidate = {
            "state": state or "unknown",
            "package_id": row.get("packageId") or row.get("package_id"),
            "recurring_payment_id": row.get("recurringPaymentId"),
        }
        if state in _ACTIVE_STATES and (
            best is None or best["state"] not in _ACTIVE_STATES
        ):
            best = candidate
        elif best is None:
            best = candidate
    return best or {"state": "none", "package_id": None}


def link_overwolf(user_id: str, token: str) -> dict:
    """Verify the token, store the Overwolf user id on the account and
    refresh the subscription state. The overlay calls this on sign-in and
    on every launch, which is what keeps the flag from lapsing."""
    from bson import ObjectId

    from .users_db import _get_collection

    claims = verify_overwolf_token(token)
    ow_id = claims["overwolf_user_id"]
    try:
        sub = fetch_overwolf_subscription(token)
    except Exception:
        logger.warning("overwolf subscription check failed", exc_info=True)
        sub = {"state": "error", "package_id": None}
    now = _now()
    active = bool(sub) and sub["state"] in _ACTIVE_STATES
    record = {
        "state": sub["state"] if sub else "unconfigured",
        "package_id": (sub or {}).get("package_id"),
        "checked_at": now,
        "expires_at": now + timedelta(days=OVERWOLF_GRACE_DAYS) if active else None,
    }
    coll = _get_collection()
    existing = coll.find_one({"_id": ObjectId(user_id)}, {"overwolf_subscription": 1})
    prior = (existing or {}).get("overwolf_subscription") or {}
    if active and prior.get("since"):
        record["since"] = prior["since"]
    elif active:
        record["since"] = now
    coll.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"overwolf_id": ow_id, "overwolf_subscription": record}},
    )
    return {"overwolf_id": ow_id, "active": active, "state": record["state"]}


def unlink_overwolf(user_id: str) -> dict:
    from bson import ObjectId

    from .users_db import _get_collection

    _get_collection().update_one(
        {"_id": ObjectId(user_id)},
        {"$unset": {"overwolf_id": "", "overwolf_subscription": ""}},
    )
    return {"overwolf_id": None, "active": False}


def set_thanks_listing(user_id: str, listed: bool) -> dict:
    from bson import ObjectId

    from .users_db import _get_collection

    _get_collection().update_one(
        {"_id": ObjectId(user_id)}, {"$set": {"thanks_listed": bool(listed)}}
    )
    return {"thanks_listed": bool(listed)}


def _kofi_monthly_active(user: dict, now: datetime) -> datetime | None:
    """Latest monthly Ko-fi payment matched to this account's email hash,
    when it is recent enough to still count as a running membership."""
    fingerprint = email_hash(user.get("email"))
    if not fingerprint:
        return None
    try:
        from .thanks import _enabled, _supporters

        if not _enabled():
            return None
        rows = _supporters().find(
            {
                "member_fingerprint": fingerprint,
                "type": "Subscription",
                "hidden": {"$ne": True},
            },
            {"timestamp": 1},
        )
    except Exception:
        logger.warning("kofi membership lookup failed", exc_info=True)
        return None
    latest = None
    for row in rows:
        ts = _aware(row.get("timestamp"))
        if ts and (latest is None or ts > latest):
            latest = ts
    if latest and now - latest <= timedelta(days=KOFI_MONTHLY_GRACE_DAYS):
        return latest
    return None


def status(user: dict | None, now: datetime | None = None) -> dict:
    """The supporter block for /api/auth/me: which sources are live right
    now, when the earliest of them lapses, and whether the person wants to
    be named on the Thank You page."""
    now = now or _now()
    sources: list[dict] = []
    if not user:
        return {
            "active": False,
            "sources": [],
            "since": None,
            "expires_at": None,
            "listed": False,
        }
    if user.get("is_paid"):
        sources.append({"source": "patreon", "since": None, "expires_at": None})
    ow = user.get("overwolf_subscription") or {}
    ow_exp = _aware(ow.get("expires_at"))
    if ow.get("state") in _ACTIVE_STATES and ow_exp and ow_exp > now:
        sources.append(
            {
                "source": "overwolf",
                "since": _iso(ow.get("since")),
                "expires_at": _iso(ow_exp),
            }
        )
    kofi_latest = _kofi_monthly_active(user, now)
    if kofi_latest:
        sources.append(
            {
                "source": "kofi",
                "since": _iso(kofi_latest),
                "expires_at": _iso(
                    kofi_latest + timedelta(days=KOFI_MONTHLY_GRACE_DAYS)
                ),
            }
        )
    expiries = [s["expires_at"] for s in sources if s["expires_at"]]
    return {
        "active": bool(sources),
        "sources": sources,
        "since": min((s["since"] for s in sources if s["since"]), default=None),
        "expires_at": max(expiries)
        if expiries and len(expiries) == len(sources)
        else None,
        "listed": bool(user.get("thanks_listed")),
    }


def public_subscribers(limit: int = 500) -> list[dict]:
    """Names for the Thank You page: accounts that are active supporters
    right now and opted in to be listed. Never exposes ids or emails."""
    if not os.environ.get("MONGO_URL", "").strip():
        return []
    from .users_db import _get_collection

    now = _now()
    out: list[dict] = []
    cursor = _get_collection().find(
        {"thanks_listed": True},
        {"username": 1, "is_paid": 1, "overwolf_subscription": 1, "email": 1},
    )
    for user in cursor:
        name = str(user.get("username") or "").strip()
        if not name:
            continue
        st = status(user, now)
        if not st["active"]:
            continue
        out.append(
            {
                "name": name,
                "sources": sorted(s["source"] for s in st["sources"]),
                "since": st["since"],
            }
        )
        if len(out) >= limit:
            break
    out.sort(key=lambda r: (r["since"] or "9999", r["name"].lower()))
    return out
