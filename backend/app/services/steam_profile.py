"""Resolve a SteamID64 to its public Steam Community profile.

Uses the keyless public profile XML (``steamcommunity.com/profiles/<id>/?xml=1``)
- the same source ``auth_steam`` reads persona names from at sign-in - so it
needs no Steam Web API key and works for any *public* profile, whether or not
that person has an account on this site. Private or nonexistent profiles resolve
to ``None`` (their XML is an ``<error>`` document with no ``<steamID>``).

The giveaway admin tool calls :func:`resolve_many` to turn a pasted list of
entrant ids into names + avatars.
"""

from __future__ import annotations

import asyncio
import logging
import time

import httpx

logger = logging.getLogger("spire-codex.steam-profile")

# Base of the individual-account SteamID64 range (76561197960265728). Every real
# player id is >= this; anything below is a group/other-type id or a typo.
_STEAMID64_MIN = 76561197960265728
_TIMEOUT = 10.0
_CONCURRENCY = 8
_CACHE_TTL = 900.0  # 15 min; personas/avatars change rarely, batches repeat

# steam_id -> (expires_at, profile-or-None). None is cached too, so a private or
# missing profile isn't re-fetched every time the operator re-resolves a list.
_cache: dict[str, tuple[float, dict | None]] = {}


def is_valid_steamid64(value: str) -> bool:
    """True for a syntactically valid individual SteamID64 (17 digits, in the
    individual-account range). Does not confirm the account actually exists."""
    v = (value or "").strip()
    return v.isdigit() and len(v) == 17 and int(v) >= _STEAMID64_MIN


def _extract(body: str, tag: str) -> str | None:
    open_tag, close_tag = f"<{tag}>", f"</{tag}>"
    start = body.find(open_tag)
    if start < 0:
        return None
    start += len(open_tag)
    end = body.find(close_tag, start)
    if end < 0:
        return None
    raw = body[start:end].strip()
    if raw.startswith("<![CDATA[") and raw.endswith("]]>"):
        raw = raw[len("<![CDATA[") : -len("]]>")].strip()
    return raw or None


def _parse_profile(steam_id: str, body: str) -> dict | None:
    # The error document (private / nonexistent) carries no <steamID>, so a
    # missing persona is how we tell "couldn't resolve" from a real profile.
    persona = _extract(body, "steamID")
    if not persona:
        return None
    return {
        "steam_id": steam_id,
        "persona": persona,
        "avatar": _extract(body, "avatarFull") or _extract(body, "avatarMedium"),
        "profile_url": f"https://steamcommunity.com/profiles/{steam_id}",
        "privacy": _extract(body, "privacyState"),
    }


async def _fetch_one(client: httpx.AsyncClient, steam_id: str) -> dict | None:
    now = time.time()
    hit = _cache.get(steam_id)
    if hit and hit[0] > now:
        return hit[1]
    try:
        resp = await client.get(
            f"https://steamcommunity.com/profiles/{steam_id}/?xml=1"
        )
        profile = _parse_profile(steam_id, resp.text)
    except Exception as exc:
        # Transient (timeout / network): return None without caching, so a retry
        # can still succeed instead of being pinned to a failure for 15 minutes.
        logger.warning("steam profile fetch failed for %s: %s", steam_id, exc)
        return None
    _cache[steam_id] = (now + _CACHE_TTL, profile)
    return profile


async def resolve_many(steam_ids: list[str]) -> dict[str, dict | None]:
    """Resolve valid SteamID64s to profiles, bounded-concurrently. Returns a map
    keyed by steam_id; a value of ``None`` means the profile is private, hidden,
    or does not exist. Invalid ids are dropped (they never appear in the map)."""
    ids = [
        s for s in dict.fromkeys(x.strip() for x in steam_ids) if is_valid_steamid64(s)
    ]
    if not ids:
        return {}
    sem = asyncio.Semaphore(_CONCURRENCY)
    out: dict[str, dict | None] = {}

    async with httpx.AsyncClient(
        timeout=_TIMEOUT, headers={"User-Agent": "spire-codex-admin"}
    ) as client:

        async def worker(sid: str) -> None:
            async with sem:
                out[sid] = await _fetch_one(client, sid)

        await asyncio.gather(*(worker(sid) for sid in ids))
    return out
