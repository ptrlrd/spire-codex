"""Shared FastAPI dependencies."""

import os

from fastapi import HTTPException, Query, Request
from slowapi.util import get_remote_address


def require_admin(request: Request) -> str:
    """Reject requests missing a valid `X-Admin-Token` header.

    Used as a FastAPI dependency on every `/api/admin/*` route. The
    token comes from the `ADMIN_TOKEN` env var (sourced from
    1Password). If `ADMIN_TOKEN` isn't set, the entire admin surface
    fails closed (503) — safer than silently allowing through.

    Defense in depth: in production the admin endpoints are also
    gated by Cloudflare Access OAuth at the edge (see
    `docker-compose.admin.yml` + `playbooks/admin-install.yml`).
    Token check is the second layer in case CF Access is ever
    bypassed or misconfigured. Returns the constant string "ok"
    so the dependency can be used with `Depends(require_admin)`.
    """
    expected = os.environ.get("ADMIN_TOKEN", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Admin disabled")
    presented = request.headers.get("x-admin-token", "")
    if presented != expected:
        raise HTTPException(status_code=401, detail="Bad admin token")
    return "ok"


def client_ip(request: Request) -> str:
    """Resolve the real visitor IP behind Cloudflare → nginx → uvicorn.

    `slowapi.get_remote_address` reads `request.client.host`, which is
    the upstream proxy — the nginx-container's bridge address — not
    the real visitor. Every user shares one bucket and the default
    limit trips fleet-wide.

    nginx already trusts Cloudflare's IP ranges and rewrites
    `$remote_addr` from `CF-Connecting-IP`, then forwards it as
    `X-Real-IP`. Prefer that, fall back to `CF-Connecting-IP` directly
    (in case nginx is bypassed), then the first hop in
    `X-Forwarded-For`, and finally `request.client.host` for local dev.
    """
    h = request.headers
    real = h.get("x-real-ip") or h.get("cf-connecting-ip")
    if real:
        return real.strip()
    xff = h.get("x-forwarded-for")
    if xff:
        return xff.split(",", 1)[0].strip()
    return get_remote_address(request)


VALID_LANGUAGES = {
    "deu",
    "eng",
    "esp",
    "fra",
    "ita",
    "jpn",
    "kor",
    "pol",
    "ptb",
    "rus",
    "spa",
    "tha",
    "tur",
    "zhs",
}

LANGUAGE_NAMES = {
    "deu": "Deutsch",
    "eng": "English",
    "esp": "Español (ES)",
    "fra": "Français",
    "ita": "Italiano",
    "jpn": "日本語",
    "kor": "한국어",
    "pol": "Polski",
    "ptb": "Português (BR)",
    "rus": "Русский",
    "spa": "Español (LA)",
    "tha": "ไทย",
    "tur": "Türkçe",
    "zhs": "简体中文",
}

DEFAULT_LANG = "eng"


def get_lang(lang: str = Query("eng", description="Language code")) -> str:
    """Validate and return language code, falling back to English."""
    return lang if lang in VALID_LANGUAGES else DEFAULT_LANG


def matches_search(entity: dict, search: str, fields: list[str]) -> bool:
    """Check if ALL words in the search query match across any of the entity's fields.

    Supports multi-word queries: "rare ironclad" matches entities where
    one field contains "rare" AND another (or same) contains "ironclad".
    """
    words = search.lower().split()
    # Build a combined searchable text from all specified fields
    searchable_parts: list[str] = []
    for field in fields:
        val = entity.get(field)
        if isinstance(val, str):
            searchable_parts.append(val.lower())
        elif isinstance(val, list):
            searchable_parts.extend(str(v).lower() for v in val)
    searchable = " ".join(searchable_parts)
    return all(word in searchable for word in words)
