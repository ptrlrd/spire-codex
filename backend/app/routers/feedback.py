"""Feedback proxy endpoint — forwards to Discord webhook without exposing the URL."""

import os
import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from ..metrics import feedback_submissions

router = APIRouter(prefix="/api/feedback", tags=["Feedback"])

WEBHOOK_URL = os.environ.get("FEEDBACK_WEBHOOK_URL", "")

limiter = Limiter(key_func=get_remote_address)


class FeedbackRequest(BaseModel):
    type: str
    contact: str
    contents: str


@router.post("")
@limiter.limit("5/minute")
async def submit_feedback(request: Request, body: FeedbackRequest):
    if not WEBHOOK_URL:
        raise HTTPException(status_code=503, detail="Feedback not configured")

    if not body.contents.strip() or not body.contact.strip():
        raise HTTPException(status_code=422, detail="Contact and contents are required")

    color = 0xFF4444 if body.type == "Bug" else 0x44AAFF
    payload = {
        "content": "<@99656376954916864>",
        "embeds": [
            {
                "title": f"{body.type} Report",
                "description": body.contents.strip(),
                "color": color,
                "fields": [
                    {"name": "Contact", "value": body.contact.strip(), "inline": True}
                ],
                "footer": {"text": "Spire Codex Feedback"},
            }
        ],
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(WEBHOOK_URL, json=payload)
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail="Failed to send feedback")

    feedback_submissions.labels(type=body.type).inc()
    return {"ok": True}
