"""Competitive mode: leaderboards and item usage for runs the replay judge
marked, served from the lake-built competitive store. Nothing here computes
on the request path beyond sorting the stored player rows."""

import os

from fastapi import APIRouter, HTTPException, Query, Request, Response

from ..dependencies import shared_limiter
from ..services import competitive_store, rate_limit_config
from ..services.official_content import official_characters

router = APIRouter(prefix="/api/competitive", tags=["Competitive"])
limiter = shared_limiter

DEFAULT_MIN_RUNS = int(os.environ.get("COMPETITIVE_MIN_RUNS", "") or 1)
MAX_LIMIT = 100


@router.get("")
@limiter.limit(rate_limit_config.endpoint_limit("competitive.view", "60/minute"))
def competitive(
    request: Request,
    response: Response,
    bracket: str = Query("a10_solo"),
    character: str | None = Query(None, max_length=32),
    min_runs: int = Query(DEFAULT_MIN_RUNS, ge=1, le=1000),
    limit: int = Query(MAX_LIMIT, ge=1, le=MAX_LIMIT),
):
    """Leaderboards (most wins, win rate, fastest win), most used cards,
    relics and potions, and chart series for one competitive bracket
    (`a10_solo` or `dread_solo`), optionally for one character.

    A cleared run counts with its own result. A run that broke the
    competitive rules, or was started and never uploaded, counts as a loss
    on the win rate board. Item usage and the charts read cleared runs
    only. `min_runs` is the fewest runs a player needs to appear on the win
    rate board."""
    if bracket not in competitive_store.BRACKETS:
        raise HTTPException(status_code=400, detail="Unknown bracket")
    if character:
        known = {c.lower() for c in official_characters()}
        if character.lower() not in known:
            raise HTTPException(status_code=400, detail="Unknown character")
    store = competitive_store.load()
    response.headers["Cache-Control"] = (
        "public, max-age=300, stale-while-revalidate=900"
        if store
        else "no-cache, no-store"
    )
    return competitive_store.view(store, bracket, character, min_runs, limit)
