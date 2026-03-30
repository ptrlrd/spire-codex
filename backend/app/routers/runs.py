"""Run submission and community stats API endpoints."""
from fastapi import APIRouter, HTTPException, Request
from ..services.runs_db import submit_run, get_stats

router = APIRouter(prefix="/api/runs", tags=["Runs"])

MAX_BODY_SIZE = 512 * 1024  # 512 KB


@router.post("", tags=["Runs"])
async def submit_run_endpoint(request: Request):
    """Submit a run for community stats. Paste the .run file JSON content."""
    body = await request.body()
    if len(body) > MAX_BODY_SIZE:
        raise HTTPException(status_code=413, detail=f"Request too large. Max {MAX_BODY_SIZE // 1024} KB.")
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    result = submit_run(data)
    if result.get("error"):
        if result.get("duplicate"):
            raise HTTPException(status_code=409, detail=result["error"])
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/stats", tags=["Runs"])
def get_community_stats(request: Request, character: str | None = None, win: str | None = None):
    """Get aggregated community run stats. Filter by character and/or win (true/false)."""
    return get_stats(character=character, win=win)
