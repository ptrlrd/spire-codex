"""Public read side of the site announcement banner.

The banner content is managed from /admin (announcements collection); this
endpoint serves the active ones to every visitor, so it leans on Redis +
edge caching to keep the per-pageview cost at zero.
"""

import logging

from fastapi import APIRouter, Response

from ..services import cache as app_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/announcements", tags=["Announcements"])

_CACHE_KEY = "announcements:active"


@router.get("")
def active_announcements(response: Response):
    """The active banner messages, newest first. `message` may contain
    inline [label](/href) links the frontend renders as real links."""
    response.headers["Cache-Control"] = "public, max-age=60"
    cached = app_cache.get_json(_CACHE_KEY)
    if cached is not None:
        return cached
    from ..services import admin_db

    items = [
        {"id": a["id"], "message": a.get("message", "")}
        for a in admin_db.list_announcements(active_only=True)
    ]
    result = {"items": items}
    app_cache.set_json(_CACHE_KEY, result, ttl_seconds=60)
    return result
