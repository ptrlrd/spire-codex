"""Uninstall-feedback endpoint.

The Overwolf companion's manifest points its `uninstall_window` at
https://spire-codex.com/uninstall, which is a hidden one-off page that
posts here when the user submits the survey. Output is a single plain
email to `feedback@spire-codex.com` — we intentionally avoid Discord
for this one (unhappy ex-users complaining in a shared channel feels
mean) and keep the destination off the public feedback surface.

Transport is SMTP via `smtplib` so any mail provider works (Cloudflare
Email Routing inbound on a custom domain, Gmail app password, Mailgun,
SES, Resend SMTP, etc.). Credentials come from env vars; if any of the
required ones are missing the endpoint reports `503 not configured`
and the form shows an error so dropped feedback is visible rather than
silently swallowed.
"""

from __future__ import annotations

import logging
import os
import smtplib
import ssl
from email.message import EmailMessage

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/uninstall-feedback", tags=["Feedback"])
limiter = Limiter(key_func=get_remote_address)


class UninstallFeedback(BaseModel):
    """Form payload. Everything is optional except `reasons` which the
    form forces to be at least one if `other_reason`/`comment` are both
    blank — keeps us from mailing empty envelopes."""

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


def _build_message(payload: UninstallFeedback) -> str:
    reasons_clean = [_sanitize(r, 100) for r in payload.reasons if isinstance(r, str)]
    other = _sanitize(payload.other_reason, 500)
    comment = _sanitize(payload.comment, 2000)
    email = _sanitize(payload.email, 200)

    lines = ["Spire Codex — Uninstall feedback", ""]
    lines.append("Reasons:")
    if reasons_clean:
        for r in reasons_clean:
            lines.append(f"  - {r}")
    else:
        lines.append("  (none selected)")
    if other:
        lines.extend(["", "Other reason:", other])
    if comment:
        lines.extend(["", "Comment:", comment])
    lines.extend(["", f"Reply-to: {email or '(not provided)'}"])
    return "\n".join(lines)


def _send_email(subject: str, body: str, reply_to: str | None) -> None:
    """Send via SMTP. Raises on any transport failure so the caller
    can map to a 5xx — silent swallowing here would lose feedback."""
    host = os.environ.get("SMTP_HOST")
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASS")
    sender = os.environ.get("SMTP_FROM", user or "")
    recipient = os.environ.get("UNINSTALL_FEEDBACK_TO", "feedback@spire-codex.com")
    if not all([host, user, password, sender]):
        raise RuntimeError(
            "SMTP not configured (SMTP_HOST / SMTP_USER / SMTP_PASS / SMTP_FROM)"
        )

    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = recipient
    msg["Subject"] = subject
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content(body)

    context = ssl.create_default_context()
    # 465 = SMTPS (implicit TLS); anything else assumed STARTTLS on 587.
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=context, timeout=15) as srv:
            srv.login(user, password)
            srv.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=15) as srv:
            srv.starttls(context=context)
            srv.login(user, password)
            srv.send_message(msg)


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
    text = _build_message(body)

    try:
        _send_email(
            subject="Spire Codex — Uninstall feedback",
            body=text,
            reply_to=reply_to,
        )
    except RuntimeError as cfg_err:
        logger.error("uninstall feedback dropped: %s", cfg_err)
        # 503 so the form surfaces a real error rather than a misleading 200.
        raise HTTPException(status_code=503, detail="Feedback not configured.")
    except Exception as send_err:
        logger.exception("uninstall feedback send failed: %s", send_err)
        raise HTTPException(status_code=502, detail="Failed to send feedback.")

    return {"ok": True}
