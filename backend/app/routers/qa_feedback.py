"""Temporary endpoint for the in-house card-render QA tool.

The `/qa` page (mounted as static HTML when QA_DIR is set) lets reviewers
click a card thumbnail to open a modal with the rendered image + a small
feedback form. Submissions land here and get forwarded to the Discord
feedback webhook as embeds — operationally cheap, lets reviewers report
"this curse is missing the violet stroke" or "Spore Mind cost should be
hidden" without needing GitHub access.

Distinct from /api/feedback (the public, persistent feedback channel)
because this one carries card-specific context (id + variant + image
URL) and is expected to be wound down after the render audit completes.
"""

from __future__ import annotations

import logging
import os

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/qa-feedback", tags=["Feedback"])
limiter = Limiter(key_func=get_remote_address)


class QAFeedback(BaseModel):
    card_id: str = Field(..., max_length=100)
    variant: str = Field(default="normal", max_length=30)
    feedback: str = Field(..., min_length=1, max_length=2000)
    contact: str | None = Field(default=None, max_length=200)
    card_name: str | None = Field(default=None, max_length=200)
    image_url: str | None = Field(default=None, max_length=500)


@router.post("")
@limiter.limit("10/minute")
async def submit_qa_feedback(request: Request, body: QAFeedback):
    webhook = os.environ.get("FEEDBACK_WEBHOOK_URL", "")
    if not webhook:
        # Operator hasn't wired up the webhook yet — return an explicit
        # 503 so the modal can show "QA not configured" instead of a
        # silent success.
        raise HTTPException(status_code=503, detail="QA feedback not configured")

    title = f"QA: {body.card_name or body.card_id}"
    fields = [
        {"name": "Card ID", "value": f"`{body.card_id}`", "inline": True},
        {"name": "Variant", "value": body.variant or "normal", "inline": True},
    ]
    if body.contact:
        fields.append({"name": "Contact", "value": body.contact, "inline": False})

    embed: dict = {
        "title": title,
        "description": body.feedback.strip(),
        "color": 0xFFB347,  # warm orange — distinct from /api/feedback's blue/red
        "fields": fields,
        "footer": {"text": "Spire Codex • Card QA"},
    }
    if body.image_url:
        # Discord renders this as a small thumbnail in the embed corner.
        embed["thumbnail"] = {"url": body.image_url}

    payload = {"embeds": [embed]}

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(webhook, json=payload)
        if resp.status_code >= 400:
            logger.error(
                "QA feedback discord post failed: %s %s",
                resp.status_code,
                resp.text[:200],
            )
            raise HTTPException(status_code=502, detail="Failed to send feedback")

    return {"ok": True}
