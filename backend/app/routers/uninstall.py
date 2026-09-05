"""Uninstall-feedback endpoint.

The Overwolf companion's manifest points its uninstall_window at a stub
that opens https://spire-codex.com/uninstall in the browser; that page
posts here when the user submits the survey. Every submission is stored
in Mongo (uninstall_feedback) so reasons can be counted, and forwarded
as one plain email through Resend so nothing is missed. Discord is
avoided on purpose: unhappy ex-users complaining in a shared channel
feels mean.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from ..dependencies import shared_limiter
from ..services import rate_limit_config

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/uninstall-feedback", tags=["Feedback"])
limiter = shared_limiter

RESEND_ENDPOINT = "https://api.resend.com/emails"
WOULD_RETURN = {"yes", "maybe", "no"}
YES_NO = {"yes", "no"}


class UninstallFeedback(BaseModel):
    """Survey payload. The Overwolf-guideline shape is primary_reason +
    issues + rating + improvement + would_return; the older reasons /
    other_reason / comment fields stay accepted so a cached page keeps
    working. At least one substantive answer is required."""

    primary_reason: str | None = None
    reason_detail: str | None = None
    saves_reimported: str | None = None
    issues: list[str] = Field(default_factory=list)
    rating: int | None = None
    improvement: str | None = None
    would_return: str | None = None
    email: str | None = None
    app_version: str | None = None
    lang: str | None = None
    reasons: list[str] = Field(default_factory=list)
    other_reason: str | None = None
    comment: str | None = None

    @field_validator("rating")
    @classmethod
    def _rating_range(cls, v):
        if v is not None and not 1 <= v <= 10:
            raise ValueError("rating must be between 1 and 10")
        return v

    @field_validator("saves_reimported")
    @classmethod
    def _saves_known(cls, v):
        if v is not None and v not in YES_NO:
            raise ValueError("saves_reimported must be yes or no")
        return v

    @field_validator("would_return")
    @classmethod
    def _would_return_known(cls, v):
        if v is not None and v not in WOULD_RETURN:
            raise ValueError("would_return must be yes, maybe, or no")
        return v


def _sanitize(value: str | None, limit: int) -> str:
    if not value:
        return ""
    cleaned = "".join(c for c in value if c.isprintable() or c in "\n\r\t")
    return cleaned.strip()[:limit]


def _clean(payload: UninstallFeedback) -> dict:
    return {
        "primary_reason": _sanitize(payload.primary_reason, 200) or None,
        "reason_detail": _sanitize(payload.reason_detail, 1000) or None,
        "saves_reimported": payload.saves_reimported,
        "issues": [_sanitize(i, 200) for i in payload.issues if isinstance(i, str)][
            :20
        ],
        "rating": payload.rating,
        "improvement": _sanitize(payload.improvement, 2000) or None,
        "would_return": payload.would_return,
        "email": _sanitize(payload.email, 200) or None,
        "app_version": _sanitize(payload.app_version, 40) or None,
        "lang": _sanitize(payload.lang, 8) or None,
        "reasons": [_sanitize(r, 100) for r in payload.reasons if isinstance(r, str)][
            :20
        ],
        "other_reason": _sanitize(payload.other_reason, 500) or None,
        "comment": _sanitize(payload.comment, 2000) or None,
    }


def _has_substance(clean: dict) -> bool:
    return bool(
        clean["primary_reason"]
        or clean["issues"]
        or clean["improvement"]
        or clean["reasons"]
        or clean["other_reason"]
        or clean["comment"]
    )


def _build_message(clean: dict) -> tuple[str, str]:
    lines = ["Spire Codex — Uninstall feedback", ""]
    if clean["primary_reason"]:
        lines += ["Primary reason:", f"  {clean['primary_reason']}", ""]
    if clean["reason_detail"]:
        lines += ["Reason detail:", clean["reason_detail"], ""]
    if clean["saves_reimported"]:
        lines += [f"Read the FAQ and re-imported save: {clean['saves_reimported']}", ""]
    if clean["issues"]:
        lines.append("What went wrong:")
        lines += [f"  - {i}" for i in clean["issues"]]
        lines.append("")
    if clean["rating"] is not None:
        lines += [f"Experience rating: {clean['rating']}/10", ""]
    if clean["improvement"]:
        lines += ["One thing to do better:", clean["improvement"], ""]
    if clean["would_return"]:
        lines += [f"Would try again: {clean['would_return']}", ""]
    if clean["reasons"]:
        lines.append("Reasons (legacy form):")
        lines += [f"  - {r}" for r in clean["reasons"]]
        lines.append("")
    if clean["other_reason"]:
        lines += ["Other reason:", clean["other_reason"], ""]
    if clean["comment"]:
        lines += ["Comment:", clean["comment"], ""]
    meta = []
    if clean["app_version"]:
        meta.append(f"app {clean['app_version']}")
    if clean["lang"]:
        meta.append(f"lang {clean['lang']}")
    if meta:
        lines += [" · ".join(meta), ""]
    lines.append(f"Reply-to: {clean['email'] or '(not provided)'}")
    text_body = "\n".join(lines)

    def esc(s: str) -> str:
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    html = ["<h2>Spire Codex — Uninstall feedback</h2>"]
    if clean["primary_reason"]:
        html.append(
            f"<p><strong>Primary reason:</strong> {esc(clean['primary_reason'])}</p>"
        )
    if clean["reason_detail"]:
        html.append(
            f"<h3>Reason detail</h3><p>{esc(clean['reason_detail']).replace(chr(10), '<br>')}</p>"
        )
    if clean["saves_reimported"]:
        html.append(
            f"<p><strong>Read the FAQ and re-imported save:</strong> {esc(clean['saves_reimported'])}</p>"
        )
    if clean["issues"]:
        html.append(
            "<h3>What went wrong</h3><ul>"
            + "".join(f"<li>{esc(i)}</li>" for i in clean["issues"])
            + "</ul>"
        )
    if clean["rating"] is not None:
        html.append(f"<p><strong>Experience rating:</strong> {clean['rating']}/10</p>")
    if clean["improvement"]:
        html.append(
            f"<h3>One thing to do better</h3><p>{esc(clean['improvement']).replace(chr(10), '<br>')}</p>"
        )
    if clean["would_return"]:
        html.append(
            f"<p><strong>Would try again:</strong> {esc(clean['would_return'])}</p>"
        )
    if clean["reasons"]:
        html.append(
            "<h3>Reasons (legacy form)</h3><ul>"
            + "".join(f"<li>{esc(r)}</li>" for r in clean["reasons"])
            + "</ul>"
        )
    if clean["other_reason"]:
        html.append(
            f"<h3>Other reason</h3><p>{esc(clean['other_reason']).replace(chr(10), '<br>')}</p>"
        )
    if clean["comment"]:
        html.append(
            f"<h3>Comment</h3><p>{esc(clean['comment']).replace(chr(10), '<br>')}</p>"
        )
    if meta:
        html.append(f"<p><em>{esc(' · '.join(meta))}</em></p>")
    html.append(
        f"<p><strong>Reply-to:</strong> {esc(clean['email']) if clean['email'] else '<em>(not provided)</em>'}</p>"
    )
    return text_body, "".join(html)


def _store(clean: dict, request: Request) -> None:
    """Persist the answers so they can be counted; best effort, never
    blocks the email."""
    if not os.environ.get("MONGO_URL", "").strip():
        return
    try:
        from ..services.runs_db_mongo import get_database

        doc = {
            **clean,
            "submitted_at": datetime.now(timezone.utc),
            "user_agent": (request.headers.get("user-agent") or "")[:300],
        }
        get_database()["uninstall_feedback"].insert_one(doc)
    except Exception as e:
        logger.warning("uninstall feedback not stored: %s", e)


async def _send_via_resend(
    text_body: str, html_body: str, reply_to: str | None
) -> None:
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        raise RuntimeError("RESEND_API_KEY not set")
    sender = os.environ.get(
        "UNINSTALL_FORWARD_FROM", "Spire Codex <onboarding@resend.dev>"
    )
    recipient = os.environ.get("UNINSTALL_FORWARD_TO", "feedback@spire-codex.com")
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
@limiter.limit(
    rate_limit_config.endpoint_limit("uninstall.submit_uninstall_feedback", "5/minute")
)
async def submit_uninstall_feedback(request: Request, body: UninstallFeedback):
    clean = _clean(body)
    if not _has_substance(clean):
        raise HTTPException(
            status_code=422,
            detail="Please pick a reason or tell us one thing to improve.",
        )
    _store(clean, request)
    text_body, html_body = _build_message(clean)
    try:
        await _send_via_resend(text_body, html_body, clean["email"])
    except RuntimeError as cfg_err:
        msg = str(cfg_err)
        if "not set" in msg:
            logger.error("uninstall feedback email dropped: %s", msg)
            raise HTTPException(status_code=503, detail="Feedback not configured.")
        logger.error("uninstall feedback send failed: %s", msg)
        raise HTTPException(status_code=502, detail="Failed to send feedback.")
    except Exception as send_err:
        logger.exception("uninstall feedback send failed: %s", send_err)
        raise HTTPException(status_code=502, detail="Failed to send feedback.")
    return {"ok": True}
