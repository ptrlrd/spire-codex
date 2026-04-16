"""Run submission and community stats API endpoints."""

import json
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from ..services.runs_db import submit_run, get_stats
from ..metrics import (
    run_submissions,
    run_character,
    run_outcome,
    run_errors,
    run_ascension,
    run_duration,
)

_data_dir = Path(
    os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data")
)

router = APIRouter(prefix="/api/runs", tags=["Runs"])

MAX_BODY_SIZE = 512 * 1024  # 512 KB


@router.post("", tags=["Runs"])
async def submit_run_endpoint(request: Request, username: str | None = None):
    """Submit a run for community stats. Paste the .run file JSON content. Optional ?username= param."""
    if os.environ.get("DISABLE_RUN_SUBMISSIONS"):
        run_errors.labels(reason="disabled").inc()
        raise HTTPException(
            status_code=403,
            detail="Run submissions are disabled on the beta site. Submit to spire-codex.com instead.",
        )
    body = await request.body()
    if len(body) > MAX_BODY_SIZE:
        run_errors.labels(reason="too_large").inc()
        raise HTTPException(
            status_code=413,
            detail=f"Request too large. Max {MAX_BODY_SIZE // 1024} KB.",
        )
    try:
        data = await request.json()
    except Exception:
        run_errors.labels(reason="invalid_json").inc()
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Sanitize username — alphanumeric, underscores, hyphens, spaces only
    clean_username = None
    if username:
        import re

        sanitized = re.sub(r"[^a-zA-Z0-9_\- ]", "", username.strip())[:25].strip()
        clean_username = sanitized or None

    result = submit_run(data, username=clean_username)
    if result.get("error"):
        if result.get("duplicate"):
            run_submissions.labels(status="duplicate").inc()
            return {
                "success": True,
                "duplicate": True,
                "run_hash": result.get("run_hash"),
            }
        run_submissions.labels(status="error").inc()
        run_errors.labels(reason="missing_fields").inc()
        raise HTTPException(status_code=400, detail=result["error"])

    # Track successful submission metrics
    run_submissions.labels(status="success").inc()
    player = data.get("players", [{}])[0]
    char = player.get("character", "").replace("CHARACTER.", "")
    if char:
        run_character.labels(character=char).inc()
    if data.get("was_abandoned"):
        run_outcome.labels(outcome="abandoned").inc()
    elif data.get("win"):
        run_outcome.labels(outcome="win").inc()
    else:
        run_outcome.labels(outcome="loss").inc()

    ascension = data.get("ascension", 0)
    run_ascension.labels(ascension=str(ascension)).inc()

    run_time = data.get("run_time", 0)
    if run_time > 0:
        run_duration.observe(run_time)

    return result


@router.get("/list", tags=["Runs"])
def list_runs(
    request: Request,
    character: str | None = None,
    win: str | None = None,
    username: str | None = None,
    seed: str | None = None,
    sort: str | None = None,
    build_id: str | None = None,
    page: int = 1,
    limit: int = 50,
):
    """List submitted runs with optional filters, sorting, and pagination."""
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
        if username:
            conditions.append("username LIKE ?")
            params.append(f"%{username}%")
        if seed:
            conditions.append("seed LIKE ?")
            params.append(f"%{seed}%")
        if build_id:
            conditions.append("build_id = ?")
            params.append(build_id)
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        # Sort options
        order_clauses = {
            "time_asc": "run_time ASC",
            "time_desc": "run_time DESC",
            "ascension_desc": "ascension DESC, run_time ASC",
            "date": "submitted_at DESC",
        }
        order_by = order_clauses.get(sort, "submitted_at DESC")

        total = conn.execute(
            f"SELECT COUNT(*) as c FROM runs {where}", params
        ).fetchone()["c"]

        per_page = min(limit, 100)
        offset = (max(page, 1) - 1) * per_page
        query_params = list(params) + [per_page, offset]
        rows = conn.execute(
            f"""
            SELECT run_hash, character, win, was_abandoned, ascension, game_mode,
                   run_time, floors_reached, deck_size, relic_count, killed_by,
                   username, submitted_at, build_id
            FROM runs {where}
            ORDER BY {order_by} LIMIT ? OFFSET ?
        """,
            query_params,
        ).fetchall()

        return {
            "runs": [dict(r) for r in rows],
            "total": total,
            "page": max(page, 1),
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page,
        }


@router.get("/leaderboard", tags=["Runs"])
def get_leaderboard(
    request: Request,
    category: str = "fastest",
    character: str | None = None,
    page: int = 1,
    limit: int = 50,
):
    """Leaderboard for winning runs. Categories: fastest, highest_ascension."""
    from ..services.runs_db import get_conn

    with get_conn() as conn:
        conditions = ["win = 1"]
        params: list = []
        if character:
            conditions.append("character = ?")
            params.append(character.upper())
        where = "WHERE " + " AND ".join(conditions)

        if category == "highest_ascension":
            order_by = "ascension DESC, run_time ASC"
        else:
            # Default: fastest
            order_by = "run_time ASC"

        total = conn.execute(
            f"SELECT COUNT(*) as c FROM runs {where}", params
        ).fetchone()["c"]

        per_page = min(limit, 100)
        offset = (max(page, 1) - 1) * per_page
        query_params = list(params) + [per_page, offset]
        rows = conn.execute(
            f"""
            SELECT run_hash, character, win, ascension, run_time, floors_reached,
                   deck_size, relic_count, username, submitted_at, killed_by
            FROM runs {where}
            ORDER BY {order_by} LIMIT ? OFFSET ?
        """,
            query_params,
        ).fetchall()

        return {
            "runs": [dict(r) for r in rows],
            "total": total,
            "page": max(page, 1),
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page,
            "category": category,
        }


@router.get("/versions", tags=["Runs"])
def get_run_versions(request: Request):
    """Return distinct build_id values from submitted runs."""
    from ..services.runs_db import get_conn

    with get_conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT build_id FROM runs WHERE build_id IS NOT NULL AND build_id != '' ORDER BY build_id DESC"
        ).fetchall()
        return {"versions": [r["build_id"] for r in rows]}


@router.get("/shared/{run_hash}", tags=["Runs"])
def get_shared_run(run_hash: str, request: Request):
    """Retrieve a shared run by its hash."""
    run_file = _data_dir / "runs" / f"{run_hash}.json"
    if run_file.exists():
        with open(run_file, "r", encoding="utf-8") as f:
            return json.load(f)

    # Fallback for multiplayer: find the run in DB, get its seed/start_time,
    # then look for any sibling player's file with the same seed
    from ..services.runs_db import get_conn

    with get_conn() as conn:
        row = conn.execute(
            "SELECT seed, character FROM runs WHERE run_hash = ?", (run_hash,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Run not found")
        # Find sibling hashes from the same seed
        siblings = conn.execute(
            "SELECT run_hash FROM runs WHERE seed = ? AND run_hash != ?",
            (row["seed"], run_hash),
        ).fetchall()
        for sib in siblings:
            sib_file = _data_dir / "runs" / f"{sib['run_hash']}.json"
            if sib_file.exists():
                # Copy for future lookups
                import shutil

                shutil.copy2(sib_file, run_file)
                with open(run_file, "r", encoding="utf-8") as f:
                    return json.load(f)

    raise HTTPException(status_code=404, detail="Run data not available")


@router.get("/stats", tags=["Runs"])
def get_community_stats(
    request: Request,
    character: str | None = None,
    win: str | None = None,
    ascension: str | None = None,
    game_mode: str | None = None,
    players: str | None = None,
):
    """Get aggregated community run stats. Filter by character, win/loss/abandoned, ascension, game_mode, players."""
    return get_stats(
        character=character,
        win=win,
        ascension=ascension,
        game_mode=game_mode,
        players=players,
    )
