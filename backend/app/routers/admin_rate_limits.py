"""Admin endpoint for runtime rate-limit overrides.

## Defense in depth

Two layers gate this surface:

1. **Cloudflare Access** at the edge. The admin subdomain is added
   to a CF Access application that requires OAuth login (Google,
   GitHub, etc.). CF only forwards the request to the origin once
   the user is authenticated. Unauthenticated traffic never reaches
   us — see `infrastructure/ansible/playbooks/admin-install.yml`.

2. **X-Admin-Token header** verified here. Defense in depth: if CF
   Access is ever bypassed (misconfig, leaked Tunnel cert), the
   token check still rejects unauthenticated callers. Token comes
   from `ADMIN_TOKEN` env var, sourced from 1Password.

The combination lets us reuse the existing token-checked admin
pattern AND give ourselves a graphical UI behind OAuth without
inventing session management.

## Endpoints (sketched, not yet implemented)

  GET  /api/admin/rate-limits          → list every (slug, current, default)
  PUT  /api/admin/rate-limits/{slug}   → body: {"limit": "3000/hour"}
  DEL  /api/admin/rate-limits/{slug}   → revert to hardcoded default

## Routing

`/api/admin/*` is served by the same FastAPI backend, not a separate
container. The "admin container" the deploy playbook talks about is
just a tiny static UI that consumes these endpoints — separating UI
from API keeps the API on the existing scale-tested path while the
UI can be iterated on without backend redeploys.

TODO before merging the follow-up:
- [ ] Implement GET — return slugs from REGISTRY + overrides from store
- [ ] Implement PUT — validate limit string via slowapi's parser
- [ ] Implement DEL — clear from store
- [ ] Wire `submit_run` first as the smoke test target
- [ ] Add a `recent_changes` collection so the UI can show audit log
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/api/admin/rate-limits", tags=["Admin"])


def require_admin_token(request: Request) -> str:
    """Reject any request without a matching X-Admin-Token header.

    Lives here (rather than as a shared dependency) until we have a
    second admin router that needs it; at that point promote to
    `app/dependencies.py::require_admin`.
    """
    from ..services.rate_limits_store import _admin_token_from_env

    expected = _admin_token_from_env()
    if not expected:
        # No token configured = the endpoint stays unreachable. Better
        # than silently disabling auth.
        raise HTTPException(status_code=503, detail="Admin disabled")
    presented = request.headers.get("x-admin-token", "")
    if presented != expected:
        raise HTTPException(status_code=401, detail="Bad admin token")
    return "ok"


# Slugs each decorated endpoint will register itself under. The
# registry lets the GET endpoint list every overridable limit even
# if no override is set yet. Populated at module-import time once
# the rewrite of the actual decorators lands.
REGISTRY: dict[str, str] = {
    # "submit_run":     "3000/hour",
    # "claim_runs":     "10/minute",
    # "list_runs":      "120/minute",
    # "shared_run":     "60/minute",
    # "feedback":       "5/minute",
    # "guide_submit":   "3/minute",
    # ...
}


@router.get("")
def list_limits(request: Request):
    """Return every registered limit + any active override.

    Response shape:
      {
        "limits": [
          {"slug": "submit_run", "default": "3000/hour", "override": null},
          {"slug": "feedback",   "default": "5/minute",  "override": "10/minute"},
          ...
        ]
      }
    """
    require_admin_token(request)
    # TODO: implement once REGISTRY is populated.
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.put("/{slug}")
async def set_limit(slug: str, request: Request):
    """Set a runtime override. Body: `{"limit": "3000/hour"}`."""
    require_admin_token(request)
    # TODO: validate slug ∈ REGISTRY, validate body.limit parses,
    # call rate_limits_store.set_override.
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.delete("/{slug}")
def clear_limit(slug: str, request: Request):
    """Revert a slug to its hardcoded default."""
    require_admin_token(request)
    # TODO: call rate_limits_store.clear_override.
    raise HTTPException(status_code=501, detail="Not implemented yet")
