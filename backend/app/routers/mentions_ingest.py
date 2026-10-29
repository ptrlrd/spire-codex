"""Push ingest for mentions: a Discord bot forwards matching server
messages here with a bearer token. Same store, matcher and alerting as
the polled sources."""

import hmac
import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from ..dependencies import shared_limiter
from ..services import mentions, rate_limit_config
from ..services.mention_sources import Found

router = APIRouter(prefix="/api/mentions", tags=["Mentions"])

limiter = shared_limiter
_MAX_ITEMS = 50


def _bad(field: str, message: str):
    raise HTTPException(status_code=400, detail=f"{field}: {message}")


def _validate_item(index: int, item) -> Found:
    field = f"items[{index}]"
    if not isinstance(item, dict):
        _bad(field, "expected an object")
    if item.get("source") != "discord":
        _bad(f"{field}.source", "only discord messages are accepted")
    external_id = item.get("external_id")
    if (
        not isinstance(external_id, str)
        or not external_id.strip()
        or len(external_id) > 100
    ):
        _bad(f"{field}.external_id", "1 to 100 characters")
    url = item.get("url")
    if not isinstance(url, str) or not url.startswith("https://") or len(url) > 500:
        _bad(f"{field}.url", "an https URL of at most 500 characters")
    space = item.get("space")
    if not isinstance(space, str) or not space.strip():
        _bad(f"{field}.space", "required")
    text = item.get("text")
    if not isinstance(text, str) or len(text) > 4000:
        _bad(f"{field}.text", "up to 4000 characters")
    author_url = item.get("author_url")
    if author_url is not None and (
        not isinstance(author_url, str)
        or (author_url and not author_url.startswith("https://"))
        or len(author_url) > 500
    ):
        _bad(f"{field}.author_url", "an https URL of at most 500 characters")
    raw_created = item.get("created_at")
    try:
        created = datetime.fromisoformat(str(raw_created).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        _bad(f"{field}.created_at", "an ISO timestamp")
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return Found(
        source="discord",
        external_id=external_id.strip(),
        kind="message",
        url=url,
        title=str(item.get("title") or "")[:2000],
        text=text,
        author=str(item.get("author") or "")[:2000],
        author_url=author_url or "",
        space=space.strip()[:2000],
        created_at=created,
        engagement={},
        community=bool(item.get("community")),
    )


@router.post("/ingest")
@limiter.limit(rate_limit_config.endpoint_limit("mentions.ingest", "60/minute"))
async def ingest(request: Request):
    token = os.environ.get("MENTIONS_INGEST_TOKEN", "").strip()
    if not token:
        raise HTTPException(status_code=503, detail="Mentions ingest is not configured")
    header = request.headers.get("authorization", "")
    supplied = header[len("Bearer ") :] if header.startswith("Bearer ") else ""
    if not hmac.compare_digest(supplied, token):
        raise HTTPException(status_code=401, detail="Invalid token")
    try:
        body = await request.json()
    except Exception:
        _bad("body", "expected a JSON object")
    items = body.get("items") if isinstance(body, dict) else None
    if not isinstance(items, list):
        _bad("items", "expected a list")
    if len(items) > _MAX_ITEMS:
        _bad("items", f"at most {_MAX_ITEMS} per request")
    found = [_validate_item(i, item) for i, item in enumerate(items)]
    settings = mentions.get_settings()
    stored = mentions.store(found, settings)
    mentions.send_alerts(stored, settings)
    if stored:
        mentions._state_col().update_one(
            {"_id": "discord"},
            {
                "$set": {
                    "last_ok_at": mentions._utcnow(),
                    "last_new": len(stored),
                    "last_error": None,
                },
                "$inc": {"total_new": len(stored)},
                "$setOnInsert": {"_id": "discord"},
            },
            upsert=True,
        )
    return {"received": len(items), "stored": len(stored)}
