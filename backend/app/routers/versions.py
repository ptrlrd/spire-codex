"""Version listing API endpoint."""

from fastapi import APIRouter

from ..services.data_service import get_available_versions

router = APIRouter(prefix="/api/versions", tags=["Versions"])


@router.get("")
def list_versions():
    """Game versions the data endpoints can serve, newest first.

    Pass one as `?version=` on any game data endpoint (cards, relics,
    potions, monsters, events, powers and the rest of the catalog) to get
    the data as it was on that version, for example
    `/api/cards?version=v0.110.0` or `/api/cards/SCARE?version=v0.109.1`.
    A version that is not in this list returns 404."""
    return get_available_versions()
