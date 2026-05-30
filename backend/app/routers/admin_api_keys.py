"""API key management — issue, list, rotate, revoke.

Backed by `services/api_keys_store.py`. The store handles hashing
and Mongo persistence; this router is the admin surface.

## Endpoints

  GET    /api/admin/api-keys             — list (without plaintext)
  POST   /api/admin/api-keys             — create — returns plaintext ONCE
  POST   /api/admin/api-keys/{id}/rotate — issue new plaintext, invalidate old
  DELETE /api/admin/api-keys/{id}        — soft revoke (audit trail preserved)

## Single-show semantics

Creation and rotation are the only times the operator sees the
plaintext key. The response body contains it once with explicit
"this won't be shown again" language; the UI surfaces it as a
copy-button + warning banner. Hash is what's stored.

## What keys unlock

Once this PR lands AND the consumer-side wiring lands:

- Service accounts (e.g. Spire Compendium / Overwolf desktop app)
  authenticate as themselves rather than per-user-IP. Higher rate
  limits, revocable identity, accurate attribution.
- Power users opt into a "claimed" identity that survives across
  IP changes (so a user with VPN-rotation behaviour can still get
  consistent rate limits + run attribution).
- Third-party widget embedders get analytics on who's using the
  public API; we can revoke a single abuser without IP-banning.

## Future: scope strings

`scopes: ["runs:submit", "runs:read", "guides:read", "admin:*"]` —
intentionally not enforced in this sketch. The first PR ships with
all keys having full read+submit access; scope checking lands as a
follow-up once a real use case for narrower access shows up.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from ..dependencies import require_admin

router = APIRouter(
    prefix="/api/admin/api-keys",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


@router.get("")
async def list_keys(request: Request):
    """List every key (hashes + metadata, never plaintext). Query:
    ?include_revoked=false (default)."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("")
async def create_key(request: Request):
    """Body: `{"owner": "spire-compendium", "owner_kind": "service",
              "scopes": ["runs:submit"], "rate_limit_override": null}`.

    Response includes plaintext key — show to operator immediately;
    it's not recoverable after this response is closed."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/{key_id}/rotate")
async def rotate_key(key_id: str, request: Request):
    """Issue new plaintext for an existing key_id. Old plaintext stops
    working immediately. Response shape same as create."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.delete("/{key_id}")
async def revoke_key(key_id: str, request: Request):
    """Soft revoke — sets `revoked=true` + `revoked_at` + `revoked_by`.
    Key doc stays for audit trail; subsequent presentations are
    rejected by the lookup hot path."""
    raise HTTPException(status_code=501, detail="Not implemented yet")
