"""Twitch live-stream detection for the /live roster.

Given the Twitch logins of players currently in a run, ask the Helix API which
of them are streaming right now, so the live page can show a "Watch on Twitch"
link and float live partners to the top. Uses an app access token (client
credentials grant), cached until it nears expiry.

Degrades to "nobody is live" whenever TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET
are unset or Helix is unreachable, so the roster never breaks because of Twitch.
"""

from __future__ import annotations

import logging
import os
import threading
import time

import httpx

logger = logging.getLogger("spire-codex.twitch")

_TOKEN_URL = "https://id.twitch.tv/oauth2/token"
_STREAMS_URL = "https://api.twitch.tv/helix/streams"
_MAX_LOGINS = 100  # Helix caps user_login at 100 ids per request

_lock = threading.Lock()
_token: str | None = None
_token_expires_at = 0.0  # time.monotonic() deadline

# Short cache of the last liveness result so repeated roster reads (each worker
# process, plus edge-cache misses) do not each hit Helix. Keyed by the exact
# login set asked for.
_CACHE_TTL = 20.0
_cache_key: frozenset[str] | None = None
_cache_value: dict[str, dict] = {}
_cache_at = 0.0


def _config() -> tuple[str, str] | None:
    cid = os.environ.get("TWITCH_CLIENT_ID", "").strip()
    secret = os.environ.get("TWITCH_CLIENT_SECRET", "").strip()
    if not cid or not secret:
        return None
    return cid, secret


def _get_token(client: httpx.Client, cid: str, secret: str) -> str | None:
    global _token, _token_expires_at
    now = time.monotonic()
    if _token and now < _token_expires_at:
        return _token
    resp = client.post(
        _TOKEN_URL,
        data={
            "client_id": cid,
            "client_secret": secret,
            "grant_type": "client_credentials",
        },
    )
    if resp.status_code != 200:
        logger.warning("twitch app-token failed: %s", resp.text[:200])
        return None
    data = resp.json()
    _token = data.get("access_token")
    # Refresh 5 min early; fall back to 1h if Twitch omits expires_in.
    _token_expires_at = now + float(data.get("expires_in", 3600)) - 300
    return _token


def live_logins(logins) -> dict[str, dict]:
    """Map login -> {viewer_count, title, game_name} for the given logins that
    are streaming right now. Empty when Twitch is unconfigured or unreachable."""
    wanted = sorted({(name or "").lower() for name in logins if name})[:_MAX_LOGINS]
    if not wanted:
        return {}

    cfg = _config()
    if not cfg:
        return {}
    cid, secret = cfg

    key = frozenset(wanted)
    with _lock:
        global _cache_key, _cache_value, _cache_at
        now = time.monotonic()
        if _cache_key == key and now - _cache_at < _CACHE_TTL:
            return dict(_cache_value)

        out: dict[str, dict] = {}
        try:
            with httpx.Client(timeout=8) as client:
                token = _get_token(client, cid, secret)
                if not token:
                    return {}
                headers = {"Authorization": f"Bearer {token}", "Client-Id": cid}
                params = [("user_login", name) for name in wanted]
                params.append(("first", "100"))
                resp = client.get(_STREAMS_URL, headers=headers, params=params)
                if resp.status_code != 200:
                    logger.warning("twitch streams failed: %s", resp.text[:200])
                    return {}
                for stream in resp.json().get("data", []):
                    if stream.get("type") != "live":
                        continue
                    login = (stream.get("user_login") or "").lower()
                    if not login:
                        continue
                    out[login] = {
                        "viewer_count": stream.get("viewer_count"),
                        "title": stream.get("title"),
                        "game_name": stream.get("game_name"),
                    }
        except Exception as exc:
            logger.warning("twitch streams error: %s", exc)
            return {}

        _cache_key, _cache_value, _cache_at = key, out, now
        return dict(out)
