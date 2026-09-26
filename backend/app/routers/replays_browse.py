"""Public replay browser: the run list narrowed to runs that carry a replay
journal, with the same filters the /runs browser uses, plus a small summary
for the page header. Rows are run-list rows with a replay_url added.
"""

import json
import os

from fastapi import APIRouter, Request, Response

from ..dependencies import shared_limiter
from ..services import cache as app_cache
from ..services import rate_limit_config

router = APIRouter(prefix="/api/replays", tags=["Replays"])
limiter = shared_limiter

CACHE_CONTROL = "public, max-age=30, stale-while-revalidate=120"
CHARACTERS = ("IRONCLAD", "SILENT", "DEFECT", "NECROBINDER", "REGENT")


def _mongo() -> bool:
    return bool(os.environ.get("MONGO_URL", "").strip())


def _empty(page: int, limit: int) -> dict:
    return {"runs": [], "total": 0, "page": page, "per_page": limit, "total_pages": 0}


@router.get("")
@limiter.limit(rate_limit_config.endpoint_limit("replays.browse", "120/minute"))
def browse_replays(
    request: Request,
    response: Response,
    character: str | None = None,
    win: str | None = None,
    username: str | None = None,
    seed: str | None = None,
    sort: str | None = None,
    build_id: str | None = None,
    build_ids: str | None = None,
    players: str | None = None,
    game_mode: str | None = None,
    ascension: int | None = None,
    ascension_min: int | None = None,
    ascension_max: int | None = None,
    card: str | None = None,
    relic: str | None = None,
    shop: str | None = None,
    today: bool = False,
    page: int = 1,
    limit: int = 50,
):
    """Runs that have a replay to watch, newest first. Same filters and row
    shape as /api/runs/list; each row also carries `replay_url`."""
    if username:
        username = username.strip().lower()
    if character:
        character = character.strip().upper()
    response.headers["Cache-Control"] = CACHE_CONTROL
    if not _mongo():
        return _empty(page, limit)
    key = "replays_browse:" + json.dumps(
        [
            character,
            win,
            username,
            seed,
            sort,
            build_id,
            build_ids,
            players,
            game_mode,
            ascension,
            ascension_min,
            ascension_max,
            card,
            relic,
            shop,
            int(today),
            page,
            limit,
        ]
    )
    cached = app_cache.get_json(key)
    if cached is not None:
        return cached
    from ..services.runs_db_mongo import list_runs

    result = list_runs(
        character=character,
        win=win,
        username=username,
        seed=seed,
        sort=sort,
        build_id=build_id,
        build_ids=build_ids,
        players=players,
        game_mode=game_mode,
        ascension=ascension,
        ascension_min=ascension_min,
        ascension_max=ascension_max,
        card=card,
        relic=relic,
        shop=shop,
        today=today,
        has_replay=True,
        page=page,
        limit=limit,
    )
    for row in result.get("runs") or []:
        if row.get("run_hash"):
            row["replay_url"] = f"/runs/{row['run_hash']}/replay"
    app_cache.set_json(key, result, ttl_seconds=60)
    return result


@router.get("/summary")
@limiter.limit(rate_limit_config.endpoint_limit("replays.summary", "60/minute"))
def replays_summary(request: Request, response: Response):
    """How many replays are watchable, overall and per character."""
    response.headers["Cache-Control"] = (
        "public, max-age=300, stale-while-revalidate=600"
    )
    if not _mongo():
        return {"total": 0, "by_character": {}}
    cached = app_cache.get_json("replays_summary")
    if cached is not None:
        return cached
    from ..services.runs_db_mongo import _get_collection

    coll = _get_collection()
    base = {"has_replay": True, "hidden": {"$ne": True}}
    out = {
        "total": coll.count_documents(base),
        "by_character": {
            c: coll.count_documents({**base, "character": c}) for c in CHARACTERS
        },
    }
    app_cache.set_json("replays_summary", out, ttl_seconds=300)
    return out
