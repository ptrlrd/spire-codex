"""Admin-only search analytics: what people type into the global search bar.

Gated by the same `require_admin` dependency as the rest of the admin surface
(site user id / Steam64 / Discord id on the ADMIN_IDS allowlist), so it rides
the existing operator login instead of a separate token. Reads the `search_log`
collection populated by the /api/search hook.
"""

from fastapi import APIRouter, Depends, Request

from ..services import search_analytics
from ..services.auth_jwt import require_admin
from .admin import _audit

router = APIRouter(
    prefix="/api/admin/searches",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


@router.get("")
def searches_overview(request: Request, days: int = 7, limit: int = 50):
    """Everything the /admin/searches page needs in one call: headline summary,
    top queries, top zero-result queries, per-day volume, and a recent feed."""
    _audit(request)
    return search_analytics.overview(days, limit)
