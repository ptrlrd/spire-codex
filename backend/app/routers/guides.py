"""Guides API — community strategy guides."""

import json as _json
import os
import re
from datetime import date

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from ..models.schemas import GuideSummary, Guide
from ..services.data_service import load_guides
from ..metrics import guide_submissions

router = APIRouter(prefix="/api/guides", tags=["Guides"])

WEBHOOK_URL = os.environ.get("GUIDE_WEBHOOK_URL", "")

limiter = Limiter(key_func=get_remote_address)


@router.get("", response_model=list[GuideSummary])
def get_guides(
    category: str | None = None,
    difficulty: str | None = None,
    tag: str | None = None,
    search: str | None = None,
):
    guides = load_guides()
    if category:
        guides = [g for g in guides if g["category"].lower() == category.lower()]
    if difficulty:
        guides = [g for g in guides if g["difficulty"].lower() == difficulty.lower()]
    if tag:
        tag_lower = tag.lower()
        guides = [
            g for g in guides if any(t.lower() == tag_lower for t in g.get("tags", []))
        ]
    if search:
        q = search.lower()
        guides = [
            g
            for g in guides
            if q in g["title"].lower()
            or q in g.get("summary", "").lower()
            or q in g.get("author", "").lower()
            or any(q in t.lower() for t in g.get("tags", []))
        ]
    # Strip content from list responses
    return [{k: v for k, v in g.items() if k != "content"} for g in guides]


@router.get("/{slug}", response_model=Guide)
def get_guide(slug: str):
    guides = load_guides()
    for guide in guides:
        if guide["slug"] == slug or guide["id"] == slug:
            return guide
    raise HTTPException(status_code=404, detail=f"Guide '{slug}' not found")


class GuideSubmission(BaseModel):
    title: str
    author_name: str
    contact: str
    category: str
    difficulty: str
    character: str | None = None
    tags: str
    summary: str
    content: str
    website: str | None = None
    bluesky: str | None = None
    twitter: str | None = None
    twitch: str | None = None


VALID_CATEGORIES = {
    "general",
    "character",
    "strategy",
    "mechanic",
    "boss",
    "event",
    "advanced",
}
VALID_DIFFICULTIES = {"beginner", "intermediate", "advanced"}
VALID_CHARACTERS = {"ironclad", "silent", "defect", "necrobinder", "regent", ""}
MAX_TITLE = 200
MAX_SUMMARY = 500
MAX_CONTENT = 50_000
MAX_FIELD = 200


def _sanitize(text: str, max_len: int = MAX_FIELD) -> str:
    """Strip HTML tags and control chars, truncate."""
    text = re.sub(r"<[^>]+>", "", text)  # strip HTML tags
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)  # strip control chars
    return text.strip()[:max_len]


def _validate_url(url: str | None) -> str | None:
    if not url or not url.strip():
        return None
    url = url.strip()[:500]
    # Allow only http/https URLs or plain usernames (no javascript:, data:, etc.)
    if url.startswith(("http://", "https://")):
        return url
    # Treat as username — alphanumeric, dots, underscores, hyphens only
    if re.match(r"^[\w.\-]+$", url):
        return url
    return None


@router.post("")
@limiter.limit("3/minute")
async def submit_guide(request: Request, body: GuideSubmission):
    if not WEBHOOK_URL:
        raise HTTPException(status_code=503, detail="Guide submissions not configured")

    title = _sanitize(body.title, MAX_TITLE)
    content = _sanitize(body.content, MAX_CONTENT)
    if not title or not content:
        raise HTTPException(status_code=422, detail="Title and content are required")

    author = _sanitize(body.author_name)
    contact = _sanitize(body.contact)
    if not author or not contact:
        raise HTTPException(status_code=422, detail="Author and contact are required")

    category = (
        body.category.lower()
        if body.category.lower() in VALID_CATEGORIES
        else "general"
    )
    difficulty = (
        body.difficulty.lower()
        if body.difficulty.lower() in VALID_DIFFICULTIES
        else "beginner"
    )
    character = (
        body.character
        if body.character and body.character.lower() in VALID_CHARACTERS
        else None
    )
    tags = _sanitize(body.tags, MAX_SUMMARY)
    summary = _sanitize(body.summary, MAX_SUMMARY)
    website = _validate_url(body.website)
    bluesky_val = _validate_url(body.bluesky)
    twitter_val = _validate_url(body.twitter)
    twitch_val = _validate_url(body.twitch)

    socials = [s for s in [website, bluesky_val, twitter_val, twitch_val] if s]
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")

    # Build frontmatter for the .md file attachment
    fm_lines = [
        "---",
        f'title: "{title}"',
        f'slug: "{slug}"',
        f'author: "{author}"',
        f'date: "{date.today().isoformat()}"',
        f'category: "{category}"',
        "tags: [{}]".format(
            ", ".join(f'"{t.strip()}"' for t in tags.split(",") if t.strip())
        )
        if tags
        else "tags: []",
        f'summary: "{summary}"',
        f'difficulty: "{difficulty}"',
    ]
    if character:
        fm_lines.append(f'character: "{character}"')
    if website:
        fm_lines.append(f'website: "{website}"')
    if bluesky_val:
        fm_lines.append(f'bluesky: "{bluesky_val}"')
    if twitter_val:
        fm_lines.append(f'twitter: "{twitter_val}"')
    if twitch_val:
        fm_lines.append(f'twitch: "{twitch_val}"')
    fm_lines.append("---")
    fm_lines.append("")
    md_file = "\n".join(fm_lines) + content

    # Embed with metadata only (no content — it's in the attached file)
    payload = {
        "content": "<@99656376954916864>",
        "embeds": [
            {
                "title": f"Guide Submission: {title}",
                "description": summary[:500] if summary else "(no summary)",
                "color": 0x44CC44,
                "fields": [
                    {"name": "Author", "value": author, "inline": True},
                    {"name": "Contact", "value": contact, "inline": True},
                    {"name": "Category", "value": category, "inline": True},
                    {"name": "Difficulty", "value": difficulty, "inline": True},
                    {"name": "Character", "value": character or "None", "inline": True},
                    {"name": "Tags", "value": tags or "None", "inline": True},
                    *(
                        [
                            {
                                "name": "Socials",
                                "value": " | ".join(socials),
                                "inline": False,
                            }
                        ]
                        if socials
                        else []
                    ),
                    {
                        "name": "Length",
                        "value": f"{len(content)} chars",
                        "inline": True,
                    },
                ],
                "footer": {"text": "Spire Codex Guide Submission"},
            }
        ],
    }

    async with httpx.AsyncClient() as client:
        # Send embed + .md file attachment via multipart
        resp = await client.post(
            WEBHOOK_URL,
            data={"payload_json": _json.dumps(payload)},
            files={"file": (f"{slug}.md", md_file.encode("utf-8"), "text/markdown")},
        )
        if resp.status_code >= 400:
            guide_submissions.labels(status="error").inc()
            raise HTTPException(status_code=502, detail="Failed to send submission")

    guide_submissions.labels(status="success").inc()
    return {"ok": True}
