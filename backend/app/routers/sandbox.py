"""Solve an exported combat position with the installed simulator."""

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response

from ..dependencies import shared_limiter

router = APIRouter(prefix="/api/sandbox", tags=["Sandbox"])


@router.post("/solve")
@shared_limiter.limit("10/minute")
async def solve(request: Request, response: Response):
    body = await request.body()
    if len(body) > 512 * 1024:
        raise HTTPException(status_code=413, detail="Position is too large")
    try:
        position = json.loads(body)
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=422, detail="Invalid JSON") from exc
    if not isinstance(position, dict) or position.get("schema") not in {
        "sandbox_position/1",
        "sandbox_position/2",
        "sandbox_position/3",
    }:
        raise HTTPException(status_code=422, detail="Invalid sandbox position")
    binary = os.environ.get("SIM_CLI_PATH", "/opt/spire-sim/sim-cli")
    if not shutil.which(binary):
        raise HTTPException(status_code=503, detail="Solver is unavailable")
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "position.json"
        path.write_bytes(body)
        try:
            completed = subprocess.run(
                [binary, "solve", "--position", str(path), "--budget-ms", "2000"],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(status_code=504, detail="Solver timed out") from exc
    if completed.returncode:
        raise HTTPException(status_code=422, detail=completed.stderr.strip()[:500])
    try:
        result = json.loads(completed.stdout)
    except ValueError as exc:
        raise HTTPException(
            status_code=502, detail="Solver returned invalid data"
        ) from exc
    response.headers["Cache-Control"] = "no-store"
    return result
