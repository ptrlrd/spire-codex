"""Steam OpenID 2.0 sign-in — server-mediated for Overwolf clients.

Compendium (the Tauri desktop app) does OpenID directly: it binds a one-shot
local listener and uses that as the OpenID return_to URL. Overwolf
extensions can't bind sockets, so the overlay needs a backend to act as
the relying party. The flow:

1. Overlay POSTs `/api/auth/steam/start` and gets back a `session_id` plus
   the URL to open in the user's default browser.
2. User signs in on Steam. Steam redirects to `/api/auth/steam/callback`
   with `?session=<id>&openid.*=...`. We verify the signature with Steam
   (`check_authentication`), extract the SteamID, fetch the persona name,
   and store `(steamid, persona_name)` in the session store keyed by id.
3. The overlay polls `/api/auth/steam/poll/<session_id>` until status
   transitions from `pending` to `ok`, then closes the loop.

Sessions are kept in-memory with a TTL — the relying-party state is
ephemeral and any persistence belongs in the client (which writes
steamid + persona to its settings). If the FastAPI process restarts
mid-flow the user just retries.

Single-worker assumption: the in-memory `_sessions` dict only works
because the backend Dockerfile launches uvicorn without `--workers`,
i.e. one process. If that ever changes, swap the store for Redis or
SQLite — start/callback/poll requests would otherwise land on
different workers and break the rendezvous.
"""

from __future__ import annotations

import logging
import re
import secrets
import time
import urllib.parse
from dataclasses import dataclass
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger("spire-codex.auth")

router = APIRouter(prefix="/api/auth/steam", tags=["Auth"])
limiter = Limiter(key_func=get_remote_address)

# Sessions live for 5 min — generous enough for the user to bounce off
# Steam's login (saved password autofill, 2FA, etc.) and short enough
# that an abandoned session expires before it's discoverable.
SESSION_TTL_SECONDS = 300

# Token-bucket of unconsumed sessions. Capping the size protects us from
# someone hammering /start to leak memory; oldest entries eviction-style
# drop on overflow.
MAX_SESSIONS = 5000


@dataclass
class _Session:
    created_at: float
    steamid: Optional[str] = None
    persona_name: Optional[str] = None
    error: Optional[str] = None


_sessions: dict[str, _Session] = {}


def _purge_expired() -> None:
    """Drop sessions older than the TTL. Cheap to run on every access."""
    cutoff = time.time() - SESSION_TTL_SECONDS
    stale = [sid for sid, s in _sessions.items() if s.created_at < cutoff]
    for sid in stale:
        _sessions.pop(sid, None)


def _new_session() -> str:
    _purge_expired()
    if len(_sessions) >= MAX_SESSIONS:
        # Drop the oldest. O(N) but only on rare overflow.
        oldest = min(_sessions.items(), key=lambda kv: kv[1].created_at)
        _sessions.pop(oldest[0], None)
    sid = secrets.token_urlsafe(24)
    _sessions[sid] = _Session(created_at=time.time())
    return sid


_REALM_ENV_KEY = "SPIRE_CODEX_PUBLIC_BASE"


def _public_base(request: Request) -> str:
    """Where Steam will redirect the user back to.

    Production runs behind a reverse proxy that sets X-Forwarded-Proto /
    Host correctly; FastAPI's request.base_url honors those and returns
    the public URL. Override via env if the deployment ever ends up
    behind a proxy that doesn't forward the headers we expect.
    """
    import os

    explicit = os.environ.get(_REALM_ENV_KEY)
    if explicit:
        return explicit.rstrip("/")
    base = str(request.base_url).rstrip("/")
    return base


@router.post("/start")
@limiter.limit("20/minute")
async def start(request: Request) -> dict:
    """Begin a Steam OpenID sign-in flow.

    Returns the URL the client should open in the user's default browser.
    The session_id is the rendezvous point — the client polls /poll with
    it, the callback writes the resolved identity into the same slot.
    """
    sid = _new_session()
    base = _public_base(request)
    return_to = f"{base}/api/auth/steam/callback?session={sid}"
    realm = base + "/"

    params = {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": return_to,
        "openid.realm": realm,
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    }
    login_url = "https://steamcommunity.com/openid/login?" + urllib.parse.urlencode(
        params
    )
    logger.info("steam-auth start session=%s", sid[:8])
    return {
        "session_id": sid,
        "login_url": login_url,
        "ttl_seconds": SESSION_TTL_SECONDS,
    }


@router.get("/callback", response_class=HTMLResponse)
async def callback(request: Request) -> HTMLResponse:
    """Steam-OpenID return URL. Validates with Steam and stores the result."""
    qs = dict(request.query_params)
    session_id = qs.get("session", "")
    session = _sessions.get(session_id)
    if not session:
        return _close_page(
            error="This sign-in link has expired. Try again from the overlay."
        )

    # OpenID response can also be `cancel` if the user bailed.
    mode = qs.get("openid.mode")
    if mode == "cancel":
        session.error = "User cancelled sign-in."
        return _close_page(error="Sign-in cancelled.")
    if mode != "id_res":
        session.error = f"Unexpected OpenID mode: {mode}"
        return _close_page(error="Unexpected response from Steam.")

    # Verify the signature by replaying the params with check_authentication.
    verify_params = dict(qs)
    verify_params.pop("session", None)
    verify_params["openid.mode"] = "check_authentication"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://steamcommunity.com/openid/login",
                data=verify_params,
            )
        verified = any(
            line.strip() == "is_valid:true" for line in resp.text.splitlines()
        )
    except Exception as exc:
        logger.warning("steam-auth verify failed: %s", exc)
        session.error = f"Could not verify with Steam: {exc}"
        return _close_page(error="Steam verification failed. Try again.")

    if not verified:
        session.error = "Steam said the response was not valid."
        return _close_page(error="Steam did not validate the response.")

    claimed_id = qs.get("openid.claimed_id", "")
    match = re.search(r"/openid/id/(\d+)$", claimed_id)
    if not match:
        session.error = f"Unexpected claimed_id: {claimed_id}"
        return _close_page(error="Couldn't read the SteamID from Steam's response.")

    steamid = match.group(1)
    session.steamid = steamid

    # Best-effort persona name lookup. Public XML is keyless and works for
    # private profiles too — Steam still includes the display name.
    persona = await _fetch_persona_name(steamid)
    session.persona_name = persona

    logger.info(
        "steam-auth ok session=%s steamid=%s persona=%s",
        session_id[:8],
        steamid,
        persona,
    )
    return _close_page(name=persona, steamid=steamid)


@router.get("/poll/{session_id}")
async def poll(session_id: str) -> JSONResponse:
    """Client polls this until the callback writes the identity.

    Returns:
      - `pending`: still waiting on Steam.
      - `ok`: identity ready; payload includes steamid + persona_name.
      - `error`: explicit failure (cancelled, invalid, etc.).
      - 404: session is unknown or expired.
    """
    _purge_expired()
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found or expired")

    if session.error:
        # Returning the error and dropping the session — the client should
        # restart with /start rather than re-poll a known-bad slot.
        msg = session.error
        _sessions.pop(session_id, None)
        return JSONResponse({"status": "error", "message": msg})

    if session.steamid is None:
        return JSONResponse({"status": "pending"})

    # Identity ready. Drop the session so a third party who somehow
    # snooped the session_id can't replay-poll.
    payload = {
        "status": "ok",
        "steamid": session.steamid,
        "persona_name": session.persona_name,
    }
    _sessions.pop(session_id, None)
    return JSONResponse(payload)


async def _fetch_persona_name(steamid: str) -> Optional[str]:
    url = f"https://steamcommunity.com/profiles/{steamid}/?xml=1"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
        body = resp.text
    except Exception as exc:
        logger.warning("persona fetch failed for %s: %s", steamid, exc)
        return None

    open_tag = "<steamID>"
    close_tag = "</steamID>"
    open_idx = body.find(open_tag)
    if open_idx < 0:
        return None
    open_idx += len(open_tag)
    close_idx = body.find(close_tag, open_idx)
    if close_idx < 0:
        return None
    raw = body[open_idx:close_idx].strip()
    if raw.startswith("<![CDATA[") and raw.endswith("]]>"):
        raw = raw[len("<![CDATA[") : -len("]]>")].strip()
    return raw or None


def _close_page(
    *,
    name: Optional[str] = None,
    steamid: Optional[str] = None,
    error: Optional[str] = None,
) -> HTMLResponse:
    if error:
        title = "Sign-in failed"
        body = (
            f"<h1>Sign-in failed</h1>"
            f"<p>{_html_escape(error)}</p>"
            f'<p class="hint">Return to the overlay and try again.</p>'
        )
        status = 400
    else:
        title = "Signed in"
        greeting = (
            f"Welcome back, {_html_escape(name)}!"
            if name
            else f"Signed in as {_html_escape(steamid or '')}."
        )
        body = (
            f"<h1>Signed in</h1>"
            f"<p>{greeting}</p>"
            f'<p class="hint">You can close this tab and return to the overlay.</p>'
        )
        status = 200
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{title}</title>
  <style>
    html, body {{ margin: 0; padding: 0; height: 100%; background: #16181d;
      color: #e6e6e6; font-family: -apple-system, BlinkMacSystemFont,
      "Segoe UI", sans-serif; display: flex; align-items: center;
      justify-content: center; }}
    .card {{ text-align: center; padding: 40px; max-width: 420px; }}
    h1 {{ color: #d7a84a; margin: 0 0 12px; font-size: 24px; }}
    p {{ color: #e6e6e6; margin: 0 0 8px; line-height: 1.5; }}
    .hint {{ color: #8d94a1; font-size: 13px; }}
  </style>
</head>
<body>
  <div class="card">{body}</div>
  <script>
    // If the browser opened this in a popup window we can close it
    // automatically; otherwise the user has to close the tab manually
    // (browsers block window.close on tabs they didn't open).
    if (window.opener) {{ setTimeout(function(){{ window.close(); }}, 800); }}
  </script>
</body>
</html>"""
    return HTMLResponse(content=html, status_code=status)


def _html_escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


# Schemas — exposed for /openapi.json + clients that want to import them.
# The endpoints above return raw dicts (faster + same wire shape), but
# OpenAPI consumers can reference these.


class StartResponse(BaseModel):
    session_id: str
    login_url: str
    ttl_seconds: int


class PollResponse(BaseModel):
    status: str
    steamid: Optional[str] = None
    persona_name: Optional[str] = None
    message: Optional[str] = None
