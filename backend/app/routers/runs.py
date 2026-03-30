"""Run submission and community stats API endpoints."""
import json
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from ..services.runs_db import submit_run, get_stats

_data_dir = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data"))

router = APIRouter(prefix="/api/runs", tags=["Runs"])

MAX_BODY_SIZE = 512 * 1024  # 512 KB


@router.post("", tags=["Runs"])
async def submit_run_endpoint(request: Request, username: str | None = None):
    """Submit a run for community stats. Paste the .run file JSON content. Optional ?username= param."""
    body = await request.body()
    if len(body) > MAX_BODY_SIZE:
        raise HTTPException(status_code=413, detail=f"Request too large. Max {MAX_BODY_SIZE // 1024} KB.")
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Sanitize username
    clean_username = None
    if username:
        clean_username = username.strip()[:25] or None

    result = submit_run(data, username=clean_username)
    if result.get("error"):
        if result.get("duplicate"):
            return {"success": True, "duplicate": True, "run_hash": result.get("run_hash")}
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/list", tags=["Runs"])
def list_runs(request: Request, character: str | None = None, win: str | None = None, limit: int = 50):
    """List submitted runs with optional filters."""
    from ..services.runs_db import get_conn
    with get_conn() as conn:
        conditions = []
        params: list = []
        if character:
            conditions.append("character = ?")
            params.append(character.upper())
        if win == "true":
            conditions.append("win = 1")
        elif win == "false":
            conditions.append("win = 0 AND was_abandoned = 0")
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        params.append(min(limit, 100))
        rows = conn.execute(f"""
            SELECT run_hash, character, win, was_abandoned, ascension, game_mode,
                   run_time, floors_reached, deck_size, relic_count, killed_by, username, submitted_at
            FROM runs {where}
            ORDER BY submitted_at DESC LIMIT ?
        """, params).fetchall()
        return [dict(r) for r in rows]


@router.get("/shared/{run_hash}", tags=["Runs"])
def get_shared_run(run_hash: str, request: Request):
    """Retrieve a shared run by its hash."""
    run_file = _data_dir / "runs" / f"{run_hash}.json"
    if not run_file.exists():
        raise HTTPException(status_code=404, detail="Run not found")
    with open(run_file, "r", encoding="utf-8") as f:
        return json.load(f)


@router.get("/stats", tags=["Runs"])
def get_community_stats(request: Request, character: str | None = None, win: str | None = None,
                        ascension: str | None = None, game_mode: str | None = None,
                        players: str | None = None):
    """Get aggregated community run stats. Filter by character, win/loss/abandoned, ascension, game_mode, players."""
    return get_stats(character=character, win=win, ascension=ascension, game_mode=game_mode, players=players)
