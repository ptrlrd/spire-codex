"""Steam news passthrough — archived locally so the API has a permanent
backlog even after Steam rotates announcements off its sliding window.

The data is populated by `backend/app/parsers/news_parser.py`. This
router is a thin read-only view over that archive plus a couple of
filters; everything is in-memory after first load.
"""

import io
from collections import OrderedDict
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, HTTPException, Query, Request, Response
from PIL import Image, ImageOps

from ..services import cache as app_cache
from ..services.data_service import load_news_index, load_news_item

router = APIRouter(prefix="/api/news", tags=["News"])


@router.get("/codex")
def codex_news(response: Response) -> dict:
    """Published Spire Codex site news (admin-authored), newest first, plus
    the newest entry's id for the navbar unread megaphone."""
    cached = app_cache.get_json("sitenews:feed")
    if cached is not None:
        response.headers["Cache-Control"] = "public, max-age=60"
        return cached
    from ..services import admin_db

    items = admin_db.list_site_news(published_only=True)
    result = {
        "items": items,
        "latest_id": items[0]["id"] if items else None,
    }
    app_cache.set_json("sitenews:feed", result, ttl_seconds=120)
    response.headers["Cache-Control"] = "public, max-age=60"
    return result


@router.get("/codex/{slug}")
def codex_news_entry(slug: str, response: Response) -> dict:
    """One published Spire Codex news entry, for article pages."""
    from ..services import admin_db

    doc = admin_db.get_site_news(slug)
    if not doc:
        raise HTTPException(status_code=404, detail="No such entry")
    response.headers["Cache-Control"] = "public, max-age=120"
    return doc


@router.get("")
def list_news(
    request: Request,
    feed_type: int | None = None,
    feedname: str | None = None,
    tag: str | None = None,
    since: int | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    """List archived Steam news entries, newest first.

    Filters:
      - `feed_type`: 1 = Steam community announcement, 0 = external (PCGamesN, etc.)
      - `feedname`: exact feed name (e.g. `steam_community_announcements`)
      - `tag`: matches if the tag list includes this string (e.g. `patchnotes`)
      - `since`: Unix epoch seconds — only return entries with `date >= since`
      - `search`: case-insensitive substring match on the title
      - `limit` / `offset`: paginate (max limit 200)
    """
    items = load_news_index()
    if feed_type is not None:
        items = [i for i in items if i.get("feed_type") == feed_type]
    if feedname:
        items = [i for i in items if i.get("feedname") == feedname]
    if tag:
        tag_l = tag.lower()
        items = [
            i for i in items if any(t.lower() == tag_l for t in (i.get("tags") or []))
        ]
    if since:
        items = [i for i in items if i.get("date", 0) >= since]
    if search:
        q = search.lower()
        items = [i for i in items if q in (i.get("title") or "").lower()]

    total = len(items)
    capped = max(1, min(limit, 200))
    sliced = items[offset : offset + capped]
    return {
        "total": total,
        "limit": capped,
        "offset": offset,
        "items": sliced,
    }


THUMB_HOSTS = {
    "clan.steamstatic.com",
    "cdn.steamstatic.com",
    "shared.steamstatic.com",
    "clan.cloudflare.steamstatic.com",
    "clan.akamai.steamstatic.com",
    "cdn.cloudflare.steamstatic.com",
    "cdn.akamai.steamstatic.com",
    "shared.cloudflare.steamstatic.com",
    "shared.akamai.steamstatic.com",
    "shared.fastly.steamstatic.com",
    "steamcdn-a.akamaihd.net",
}
THUMB_WIDTHS = (320, 640)
THUMB_MAX_SOURCE_BYTES = 15 * 1024 * 1024
THUMB_MAX_PIXELS = 40_000_000
THUMB_CACHE_SIZE = 64
_thumb_cache: OrderedDict[tuple[str, int], bytes] = OrderedDict()


def thumb_source_allowed(src: str) -> bool:
    parts = urlsplit(src)
    return (
        parts.scheme == "https"
        and parts.hostname in THUMB_HOSTS
        and parts.port is None
        and not parts.username
    )


def make_thumb(data: bytes, width: int) -> bytes:
    with Image.open(io.BytesIO(data)) as img:
        if img.width * img.height > THUMB_MAX_PIXELS:
            raise ValueError("image too large")
        img.seek(0)
        frame = ImageOps.exif_transpose(img.convert("RGBA"))
    if frame.width > width:
        frame = frame.resize(
            (width, max(1, round(frame.height * width / frame.width))),
            Image.Resampling.LANCZOS,
        )
    out = io.BytesIO()
    frame.save(out, "WEBP", quality=72, method=4)
    return out.getvalue()


async def _fetch_source(src: str) -> bytes:
    async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
        url = src
        for _ in range(4):
            async with client.stream("GET", url) as res:
                if res.is_redirect:
                    url = str(res.url.join(res.headers.get("location", "")))
                    if not thumb_source_allowed(url):
                        break
                    continue
                if res.status_code != 200:
                    break
                chunks = []
                size = 0
                async for chunk in res.aiter_bytes():
                    size += len(chunk)
                    if size > THUMB_MAX_SOURCE_BYTES:
                        raise HTTPException(status_code=413, detail="Source too large")
                    chunks.append(chunk)
                return b"".join(chunks)
    raise HTTPException(status_code=502, detail="Source image unavailable")


@router.get("/thumb.webp")
async def news_thumb(
    src: str = Query(..., max_length=500),
    w: int = 640,
) -> Response:
    """Small webp thumbnail of a Steam news image (first frame for GIFs)."""
    if not thumb_source_allowed(src):
        raise HTTPException(status_code=400, detail="Unsupported image host")
    width = min(THUMB_WIDTHS, key=lambda x: abs(x - w))
    key = (src, width)
    body = _thumb_cache.get(key)
    if body is None:
        data = await _fetch_source(src)
        try:
            body = make_thumb(data, width)
        except (OSError, ValueError, Image.DecompressionBombError):
            raise HTTPException(status_code=422, detail="Unreadable image")
        _thumb_cache[key] = body
        while len(_thumb_cache) > THUMB_CACHE_SIZE:
            _thumb_cache.popitem(last=False)
    else:
        _thumb_cache.move_to_end(key)
    return Response(
        content=body,
        media_type="image/webp",
        headers={"Cache-Control": "public, max-age=604800, immutable"},
    )


@router.get("/{gid}")
def get_news_item(request: Request, gid: str) -> dict:
    """Return a single archived news entry by Steam `gid`.

    Returns the full body including raw `contents` (Steam's HTML/BBCode
    blob — clients are responsible for sanitization at render time).
    """
    item = load_news_item(gid)
    if not item:
        raise HTTPException(status_code=404, detail=f"News item '{gid}' not found")
    return item
