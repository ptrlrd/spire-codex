"""Outbound integration health + test-fire endpoints.

Every external dependency this app calls — Discord webhooks, Resend,
Sentry, GitHub App, Cloudflare API, IndexNow — can fail silently
when a token rotates or an upstream API changes shape. The admin
dashboard surfaces last-success + last-error timestamps + a button
to fire a test request, so credential rotation breakage is found in
seconds, not days.

## Health endpoint shape

  GET /api/admin/integrations
  →
  {
    "discord_feedback":  {"last_ok": ISO, "last_error": ISO|null, "last_error_msg": "..."},
    "discord_guide":     {...},
    "resend":            {...},
    "sentry":            {...},
    "github_app":        {"last_ok": ISO, "token_expires_at": ISO|null, ...},
    "cloudflare":        {...},
    "indexnow":          {...},
  }

Status comes from a `integration_health` Mongo collection that each
existing outbound call writes to on success/failure (single
`upsert_one` per call, fire-and-forget).

## Test endpoints

  POST /api/admin/integrations/discord-feedback/test  → fires a
       "[test from admin dashboard at <ts>]" message
  POST /api/admin/integrations/resend/test            → sends a test
       email to UNINSTALL_FORWARD_TO
  POST /api/admin/integrations/github-app/test        → calls GitHub
       API /repos/<repo> to verify the JWT signs valid
  POST /api/admin/integrations/cloudflare/test        → calls
       /zones/<id> to verify the API token still authenticates
  POST /api/admin/integrations/indexnow/test          → pings one
       URL via IndexNow

All test endpoints write the result to the same integration_health
collection so the GET endpoint reflects the test outcome too.

## Why this matters

The breakage modes for these aren't loud — Discord webhooks return
404 silently, Resend's quota errors are 429s buried in logs, GitHub
App tokens expire after a year. The "things broke and nobody told
me" half-life is usually weeks, sometimes months. A one-click test
+ a one-glance panel collapses that to minutes.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from ..dependencies import require_admin

router = APIRouter(
    prefix="/api/admin/integrations",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


@router.get("")
async def integration_health(request: Request):
    """Latest success + failure timestamps for every external dep,
    plus token expiry where applicable. One Mongo find, sub-ms."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/discord-feedback/test")
async def test_discord_feedback(request: Request):
    """Fire a test message at the FEEDBACK_WEBHOOK_URL. Body:
    `{"message": "..."}` (optional override — default is a
    timestamped probe)."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/discord-guide/test")
async def test_discord_guide(request: Request):
    """Same as above for the GUIDE_WEBHOOK_URL."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/resend/test")
async def test_resend(request: Request):
    """Send a test email via Resend to UNINSTALL_FORWARD_TO. Confirms
    the API key + the from-address are still valid."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/sentry/test")
async def test_sentry(request: Request):
    """Capture a synthetic exception via the Sentry SDK to verify
    SENTRY_DSN is still valid and events flow."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/github-app/test")
async def test_github_app(request: Request):
    """Call GitHub API /repos/<GITHUB_APP_REPO> with the App JWT.
    Confirms knowledge-demon.private-key.pem is still installed,
    valid, and authorized on the configured repo."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/cloudflare/test")
async def test_cloudflare(request: Request):
    """Call CF /zones/{zone_id} with the stored API token. Verifies
    the token still authenticates and still has scope on the zone
    (rotation breaks this silently otherwise)."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/indexnow/test")
async def test_indexnow(request: Request):
    """Ping IndexNow for one URL (e.g. the home page). Confirms
    api.indexnow.org is accepting our key."""
    raise HTTPException(status_code=501, detail="Not implemented yet")
