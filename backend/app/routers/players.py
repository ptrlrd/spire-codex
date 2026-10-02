"""Public player profile API: the /players/<username> pages.

Serves the same insights blob as the signed-in profile tab, resolved by
username instead of session, for accounts that haven't gone private. Runs
are public by design (leaderboards, run pages); the profile_private flag
only gates this aggregated view."""

import os

from fastapi import APIRouter, HTTPException, Query, Request, Response

from ..dependencies import shared_limiter
from ..services import rate_limit_config, supporters

router = APIRouter(prefix="/api/players", tags=["Players"])


def _validate_insight_filters(
    ascension: int | None, version: str | None, players: int | None
) -> None:
    import re

    from fastapi import HTTPException

    if ascension is not None and not (0 <= ascension <= 10):
        raise HTTPException(status_code=400, detail="ascension out of range")
    if version is not None and (
        len(version) > 16 or not re.fullmatch(r"v\d{1,2}(\.\d{1,4}){0,3}", version)
    ):
        raise HTTPException(status_code=400, detail="bad version")
    if players is not None and players not in (1, 2, 3, 4):
        raise HTTPException(status_code=400, detail="players must be 1-4")


limiter = shared_limiter


@router.get("/flair", tags=["Players"])
@limiter.limit(rate_limit_config.endpoint_limit("players.flair", "120/minute"))
def players_flair(
    request: Request,
    response: Response,
    u: list[str] = Query(default=[], description="Usernames, up to 100"),
):
    """Supporter flair for a batch of usernames: the theme each active
    supporter chose to show, keyed by lowercased username."""
    if len(u) > supporters.FLAIR_MAX_NAMES:
        raise HTTPException(status_code=400, detail="Too many names")
    response.headers["Cache-Control"] = "public, max-age=300"
    return supporters.flair(u)


@router.get("/{username}/insights", tags=["Players"])
@limiter.limit(rate_limit_config.endpoint_limit("players.insights", "30/minute"))
def player_insights(
    username: str,
    request: Request,
    response: Response,
    character: str | None = None,
    ascension: int | None = None,
    version: str | None = None,
    players: int | None = None,
):
    """One player's public insights: their runs through the community-stats
    accumulator with community comparison fields (the profile Insights tab,
    public). `character` (e.g. IRONCLAD) scopes the view to that character.
    404 for unknown usernames and for private profiles - the two are
    indistinguishable on purpose."""
    if not os.environ.get("MONGO_URL", "").strip():
        raise HTTPException(status_code=404, detail="Player not found")

    from ..services.run_entity_stats import _official_character_ids
    from ..services.user_insights import get_user_insights
    from ..services.users_db import get_user_by_username

    character = (character or "").strip().upper() or None
    _validate_insight_filters(ascension, version, players)
    if character:
        official = _official_character_ids()
        if official and character not in official:
            raise HTTPException(status_code=400, detail="Unknown character")

    user = get_user_by_username(username)
    if not user or user.get("profile_private"):
        raise HTTPException(status_code=404, detail="Player not found")

    data = get_user_insights(
        str(user["_id"]),
        username=user.get("username"),
        character=character,
        ascension=ascension,
        version=version,
        players=players,
    )
    # Never let the edge cache a building placeholder OR an empty profile:
    # CF would pin it for 5 minutes — poll loops would spin against a
    # placeholder, and a just-claimed account would look empty long after
    # its walk landed.
    response.headers["Cache-Control"] = (
        "public, max-age=300" if data.get("runs_walked") else "no-store"
    )
    return {"username": user.get("username"), **data}
