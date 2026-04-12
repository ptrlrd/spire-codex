"""Version listing API endpoint — returns available data versions (beta only)."""

from fastapi import APIRouter

from ..services.data_service import get_available_versions

router = APIRouter(prefix="/api/versions", tags=["Versions"])


@router.get("")
def list_versions():
    """Return available data versions (e.g. v0.102.0, v0.103.0)."""
    return get_available_versions()
