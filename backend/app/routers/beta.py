"""Beta channel endpoints for the unified site (BETA-MIGRATION-PLAN.md).

The channel itself needs no endpoints: every data route serves beta content
when the request carries ?channel=beta or arrives via a beta.* host (see
VersionMiddleware). What lives here is the metadata about the beta branch.
"""

from fastapi import APIRouter, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..services.beta_diff import get_beta_diff
from ..services.data_service import get_beta_version

router = APIRouter(prefix="/api/beta", tags=["Beta"])
limiter = Limiter(key_func=get_remote_address)


@router.get("/diff")
@limiter.limit("120/minute")
def beta_diff(request: Request):
    """What the current beta adds, changes, and removes, per entity type.

    Shape: {beta_version, types: {cards: {added: [ids], changed: {id:
    [fields]}, removed: [ids]}, ...}}. Comparison runs on English catalogs
    with presentation-only fields excluded. This is the single source for
    every BETA badge and changed-in-beta cross-link on the site.
    """
    return get_beta_diff()


@router.get("/version")
@limiter.limit("120/minute")
def beta_version(request: Request):
    """The current beta version (from the data-beta latest pointer)."""
    return {"beta_version": get_beta_version()}
