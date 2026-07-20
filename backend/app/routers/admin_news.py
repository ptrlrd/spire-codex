"""Admin CRUD for Spire Codex site news: the announcements and markdown
articles surfaced on /news's Spire Codex tab and behind the navbar megaphone.
Publishing here replaces committing to the repo for every announcement."""

import re

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..services import admin_db
from ..services import cache as app_cache
from ..services.auth_jwt import require_admin
from .admin import _audit

router = APIRouter(
    prefix="/api/admin/news",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _bust_cache() -> None:
    for key in ("sitenews:feed", "sitenews:latest"):
        try:
            app_cache.delete(key)
        except Exception:
            pass


@router.get("")
def list_news(request: Request):
    """Every entry, drafts included, newest first."""
    _audit(request)
    return {"items": admin_db.list_site_news(published_only=False)}


class NewsEntry(BaseModel):
    id: str = Field(description="Slug, e.g. 'deck-archetypes'. Lowercase, dashes.")
    title: str
    date: str = Field(description="YYYY-MM-DD")
    body: str = Field(default="", description="Markdown article body.")
    href: str = Field(
        default="",
        description="Optional link target; set = the card links there instead of an article page.",
    )
    published: bool = False


@router.put("")
def upsert_news(body: NewsEntry, request: Request):
    """Create or update one entry (matched by slug)."""
    _audit(request)
    if not _SLUG_RE.match(body.id):
        raise HTTPException(400, "slug must be lowercase letters/digits/dashes")
    if not body.title.strip():
        raise HTTPException(400, "title is required")
    if not _DATE_RE.match(body.date.strip()):
        raise HTTPException(400, "date must be YYYY-MM-DD")
    if not body.body.strip() and not body.href.strip():
        raise HTTPException(400, "give the entry a body or a link target")
    saved = admin_db.upsert_site_news(body.model_dump())
    _bust_cache()
    return saved


@router.delete("/{slug}")
def delete_news(slug: str, request: Request):
    _audit(request)
    if not admin_db.delete_site_news(slug):
        raise HTTPException(404, "no such entry")
    _bust_cache()
    return {"deleted": slug}
