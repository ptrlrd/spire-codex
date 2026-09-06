"""Shared FastAPI dependencies."""

import ipaddress

from fastapi import Query, Request
from slowapi import Limiter
from slowapi.util import get_remote_address


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


_PROXY_HEADERS = ("x-real-ip", "cf-connecting-ip", "x-forwarded-for")


def is_internal_request(request: Request) -> bool:
    """True for traffic that reached uvicorn without passing through nginx:
    the frontend's server-side fetches, ingest jobs, and other containers on
    the private network. nginx always sets X-Real-IP and the backend port is
    not published, so no proxy header plus a private peer address can only
    be one of those."""
    h = request.headers
    if any(h.get(name) for name in _PROXY_HEADERS):
        return False
    host = request.client.host if request.client else None
    if not host:
        return False
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        return False
    return addr.is_private or addr.is_loopback


def limiter_key(request: Request) -> str:
    """key_func for the shared per-IP limiter: the visitor IP, or an
    ``internal|<peer>`` bucket for in-network callers so a crawl of the
    site can't exhaust the frontend container's per-endpoint caps for every
    page render at once."""
    from .services.rate_limit_config import INTERNAL_BUCKET_PREFIX

    if is_internal_request(request):
        return f"{INTERNAL_BUCKET_PREFIX}{get_remote_address(request)}"
    return client_ip(request)


def _make_shared_limiter() -> Limiter:
    # Imported lazily: rate_limit_config itself imports client_ip from this
    # module inside a function, so a top-level import here would be the only
    # thing turning that into a cycle.
    from .services import rate_limit_config

    # One per-IP limiter shared by every router. key_style="endpoint" scopes
    # each counter by ROUTE — slowapi's default "url" gave every concrete
    # path its own bucket, so caps on parameterized routes like
    # /shared/{run_hash} were per-hash and never actually bit.
    return Limiter(
        key_func=limiter_key,
        key_style="endpoint",
        **rate_limit_config.storage_kwargs(),
    )


shared_limiter = _make_shared_limiter()


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
    "zht",
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
    "zht": "繁體中文",
}

DEFAULT_LANG = "eng"


def get_lang(
    lang: str = Query(
        DEFAULT_LANG,
        description=(
            "Language code. One of the 15 supported codes; unknown values "
            "fall back to English."
        ),
        json_schema_extra={"enum": sorted(VALID_LANGUAGES)},
    ),
) -> str:
    """Validate and return language code, falling back to English.

    `json_schema_extra` surfaces the supported codes as an enum dropdown in
    the OpenAPI docs (/docs) without making the param strict: an unknown
    `lang` still falls back to English rather than 422-ing, so existing API
    consumers (the bot, overlay, and desktop app) don't break.
    """
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
