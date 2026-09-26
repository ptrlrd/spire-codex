"""Public player leaderboards served from nightly lake artifacts. The Elo
board is written by lab/player_elo_board.py and pulled to the serving box
with the other lake files; nothing here computes on the request path.
"""

import json
import os
from pathlib import Path

from fastapi import APIRouter, Query, Request, Response

from ..dependencies import shared_limiter
from ..services import rate_limit_config

router = APIRouter(prefix="/api/leaderboards", tags=["Leaderboards"])
limiter = shared_limiter

LAKE_DIR = Path(os.environ.get("LAKE_DIR", "/lake"))
BOARD_NAME = "player_elo.json"
DEFAULT_MIN_RUNS = 10
MAX_LIMIT = 100

_cache: tuple[tuple, dict] | None = None


def load_board() -> dict | None:
    global _cache
    path = LAKE_DIR / BOARD_NAME
    try:
        st = path.stat()
    except OSError:
        return None
    stamp = (st.st_mtime_ns, st.st_size, st.st_ino)
    if _cache and _cache[0] == stamp:
        return _cache[1]
    try:
        board = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return _cache[1] if _cache else None
    _cache = (stamp, board)
    return board


def top_players(board: dict | None, limit: int, min_runs: int) -> dict:
    players = []
    for row in (board or {}).get("players") or []:
        if (row.get("runs") or 0) < min_runs:
            continue
        players.append({**row, "rank": len(players) + 1})
        if len(players) >= limit:
            break
    return {
        "players": players,
        "total_rated": (board or {}).get("total_rated", 0),
        "min_runs": min_runs,
        "computed_at": (board or {}).get("computed_at"),
    }


@router.get("/elo")
@limiter.limit(rate_limit_config.endpoint_limit("leaderboards.elo", "60/minute"))
def elo_board(
    request: Request,
    response: Response,
    limit: int = Query(MAX_LIMIT, ge=1, le=MAX_LIMIT),
    min_runs: int = Query(DEFAULT_MIN_RUNS, ge=1, le=1000),
):
    """The Spire Codex top players by hidden Elo over solo A10 standard runs
    on the official cast, refreshed nightly. Only accounts with a public
    username and at least `min_runs` rated runs are ranked."""
    board = load_board()
    response.headers["Cache-Control"] = (
        "public, max-age=300, stale-while-revalidate=900"
        if board
        else "no-cache, no-store"
    )
    return top_players(board, limit, min_runs)
