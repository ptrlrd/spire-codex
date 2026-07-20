"""Steam news passthrough — archived locally so the API has a permanent
backlog even after Steam rotates announcements off its sliding window.

The data is populated by `backend/app/parsers/news_parser.py`. This
router is a thin read-only view over that archive plus a couple of
filters; everything is in-memory after first load.
"""

from fastapi import APIRouter, HTTPException, Request, Response

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
