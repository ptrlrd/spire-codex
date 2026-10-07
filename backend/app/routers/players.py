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
    """One player's public insights: their runs through the same
    accumulator as /api/runs/community-stats, with community comparison
    fields (the profile Insights tab, public). `character` (e.g. IRONCLAD) scopes the view to that character.
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


@router.get("/{username}/stats", tags=["Players"])
@limiter.limit(rate_limit_config.endpoint_limit("players.stats", "60/minute"))
def player_stats(
    username: str,
    request: Request,
    response: Response,
    character: str | None = None,
    ascension: int | None = None,
    version: str | None = None,
    players: int | None = None,
):
    """One player's own cards, relics, potions, events, shops and campfire
    stats from their uploaded runs, with personal lift. Same filters and
    privacy rule as /insights: 404 for unknown or private profiles."""
    if not os.environ.get("MONGO_URL", "").strip():
        raise HTTPException(status_code=404, detail="Player not found")

    from ..services.users_db import get_user_by_username

    character = stats_filters(character, ascension, version, players)
    user = get_user_by_username(username)
    if not user or user.get("profile_private"):
        raise HTTPException(status_code=404, detail="Player not found")

    out = stats_for_user(user, character, ascension, version, players)
    response.headers["Cache-Control"] = (
        "public, max-age=300" if out["available"] else "no-store"
    )
    return out


def stats_filters(
    character: str | None,
    ascension: int | None,
    version: str | None,
    players: int | None,
) -> str | None:
    """Validates the stats filters and returns the normalized character."""
    from ..services.run_entity_stats import _official_character_ids

    character = (character or "").strip().upper() or None
    _validate_insight_filters(ascension, version, players)
    if character:
        official = _official_character_ids()
        if official and character not in official:
            raise HTTPException(status_code=400, detail="Unknown character")
    return character


def stats_for_user(
    user: dict,
    character: str | None,
    ascension: int | None,
    version: str | None,
    players: int | None,
) -> dict:
    from ..services.player_stats import get_player_stats

    data = get_player_stats(
        str(user["_id"]),
        character=character,
        ascension=ascension,
        version=version,
        players=players,
    )
    if data is None:
        return {"username": user.get("username"), "available": False}
    return {"username": user.get("username"), "available": True, **data}
