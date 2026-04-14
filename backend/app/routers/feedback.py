"""Feedback proxy endpoint — forwards to Discord webhook + creates GitHub issue."""

import logging
import os

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..metrics import feedback_submissions
from ..services import github_issues

logger = logging.getLogger(__name__)

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

    feedback_type = body.type.strip() or "Feedback"
    contact = body.contact.strip()
    contents = body.contents.strip()

    # ── Discord notification (live ping) ───────────────────────
    color = 0xFF4444 if feedback_type == "Bug" else 0x44AAFF
    payload = {
        "content": "<@99656376954916864>",
        "embeds": [
            {
                "title": f"{feedback_type} Report",
                "description": contents,
                "color": color,
                "fields": [{"name": "Contact", "value": contact, "inline": True}],
                "footer": {"text": "Spire Codex Feedback"},
            }
        ],
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(WEBHOOK_URL, json=payload)
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail="Failed to send feedback")

    # ── GitHub issue (best-effort, non-blocking failure) ───────
    if github_issues.is_configured():
        try:
            referer = request.headers.get("referer", "unknown")
            user_agent = request.headers.get("user-agent", "unknown")
            issue_body = (
                f"{contents}\n\n"
                f"---\n"
                f"**Type:** {feedback_type}\n"
                f"**Contact:** {contact}\n"
                f"**Page:** {referer}\n"
                f"**User-Agent:** `{user_agent}`\n"
                f"\n_Submitted via the Spire Codex feedback form._"
            )
            label = "bug" if feedback_type.lower() == "bug" else "feedback"
            await github_issues.create_issue(
                title=f"[{feedback_type}] {contents.splitlines()[0][:80]}",
                body=issue_body,
                labels=[label, "from-website"],
            )
        except Exception as e:
            logger.warning("Failed to create GitHub issue from feedback: %s", e)

    feedback_submissions.labels(type=feedback_type).inc()
    return {"ok": True}
