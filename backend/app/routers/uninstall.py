"""Uninstall-feedback endpoint.

The Overwolf companion's manifest points its `uninstall_window` at
https://spire-codex.com/uninstall, which is a hidden one-off page that
posts here when the user submits the survey. Output is a single plain
email to the configured inbox — we intentionally avoid Discord for
this one (unhappy ex-users complaining in a shared channel feels mean)
and keep the destination off the public feedback surface.

Transport: Resend's HTTP API. One credential (`RESEND_API_KEY`) covers
auth, no SMTP plumbing. If the API key is missing the endpoint
returns 503 "not configured" and the form surfaces the error — silent
swallowing would lose feedback without leaving a trace.
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

router = APIRouter(prefix="/api/uninstall-feedback", tags=["Feedback"])
limiter = Limiter(key_func=get_remote_address)

RESEND_ENDPOINT = "https://api.resend.com/emails"


class UninstallFeedback(BaseModel):
    """Form payload. Everything is optional except that at least one of
    `reasons`, `other_reason`, or `comment` must be non-empty — keeps
    auto-blank submissions out of the inbox."""

    reasons: list[str] = Field(default_factory=list)
    other_reason: str | None = None
    comment: str | None = None
    email: str | None = None


def _sanitize(value: str | None, limit: int) -> str:
    """Trim, drop control chars, cap length. Bodies and emails alike."""
    if not value:
        return ""
    cleaned = "".join(c for c in value if c.isprintable() or c in "\n\r\t")
    return cleaned.strip()[:limit]


def _build_message(payload: UninstallFeedback) -> tuple[str, str]:
    """Return (plain_text, html) bodies of the report."""
    reasons_clean = [_sanitize(r, 100) for r in payload.reasons if isinstance(r, str)]
    other = _sanitize(payload.other_reason, 500)
    comment = _sanitize(payload.comment, 2000)
    email = _sanitize(payload.email, 200)

    text_lines = ["Spire Codex — Uninstall feedback", ""]
    text_lines.append("Reasons:")
    if reasons_clean:
        for r in reasons_clean:
            text_lines.append(f"  - {r}")
    else:
        text_lines.append("  (none selected)")
    if other:
        text_lines.extend(["", "Other reason:", other])
    if comment:
        text_lines.extend(["", "Comment:", comment])
    text_lines.extend(["", f"Reply-to: {email or '(not provided)'}"])
    text_body = "\n".join(text_lines)

    # Minimal HTML — Resend rejects empty html/text combos on some
    # accounts. The plain version stays the source of truth.
    def esc(s: str) -> str:
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    reason_html = (
        "".join(f"<li>{esc(r)}</li>" for r in reasons_clean)
        or "<li><em>(none selected)</em></li>"
    )
    html_parts = [
        "<h2>Spire Codex — Uninstall feedback</h2>",
        "<h3>Reasons</h3>",
        f"<ul>{reason_html}</ul>",
    ]
    if other:
        html_parts.append(
            f"<h3>Other reason</h3><p>{esc(other).replace(chr(10), '<br>')}</p>"
        )
    if comment:
        html_parts.append(
            f"<h3>Comment</h3><p>{esc(comment).replace(chr(10), '<br>')}</p>"
        )
    html_parts.append(
        f"<p><strong>Reply-to:</strong> {esc(email) if email else '<em>(not provided)</em>'}</p>"
    )
    return text_body, "".join(html_parts)


async def _send_via_resend(
    text_body: str, html_body: str, reply_to: str | None
) -> None:
    """POST the message to Resend. Raises on any failure."""
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        raise RuntimeError("RESEND_API_KEY not set")

    sender = os.environ.get("UNINSTALL_FROM", "Spire Codex <onboarding@resend.dev>")
    recipient = os.environ.get("UNINSTALL_FEEDBACK_TO", "feedback@spire-codex.com")

    payload: dict = {
        "from": sender,
        "to": [recipient],
        "subject": "Spire Codex — Uninstall feedback",
        "text": text_body,
        "html": html_body,
    }
    if reply_to:
        payload["reply_to"] = reply_to

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            RESEND_ENDPOINT,
            json=payload,
            headers={"Authorization": f"Bearer {api_key}"},
        )
        if resp.status_code >= 400:
            raise RuntimeError(
                f"Resend rejected the email (HTTP {resp.status_code}): {resp.text[:300]}"
            )


@router.post("")
@limiter.limit("5/minute")
async def submit_uninstall_feedback(request: Request, body: UninstallFeedback):
    # Drop completely-empty submissions — Overwolf can flash the window
    # past a user and we don't want auto-blank rows piling up.
    if not (body.reasons or body.other_reason or body.comment):
        raise HTTPException(
            status_code=422, detail="Please select a reason or leave a comment."
        )

    reply_to = _sanitize(body.email, 200) or None
    text_body, html_body = _build_message(body)

    try:
        await _send_via_resend(text_body, html_body, reply_to)
    except RuntimeError as cfg_err:
        # Distinguish "no API key" (operator problem → 503) from a
        # Resend-side rejection (transient or quota → 502).
        msg = str(cfg_err)
        if "not set" in msg:
            logger.error("uninstall feedback dropped: %s", msg)
            raise HTTPException(status_code=503, detail="Feedback not configured.")
        logger.error("uninstall feedback send failed: %s", msg)
        raise HTTPException(status_code=502, detail="Failed to send feedback.")
    except Exception as send_err:
        logger.exception("uninstall feedback send failed: %s", send_err)
        raise HTTPException(status_code=502, detail="Failed to send feedback.")

    return {"ok": True}
