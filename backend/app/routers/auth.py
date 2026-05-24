"""User-facing auth endpoints: profile, runs, settings."""

from __future__ import annotations

import json
import os

from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from fastapi.responses import JSONResponse
from slowapi import Limiter

from ..dependencies import client_ip
from ..services.auth_jwt import (
    get_current_user,
    require_user,
    clear_auth_cookie,
)

router = APIRouter(prefix="/api/auth", tags=["Auth"])
limiter = Limiter(key_func=client_ip)

_MAX_UPLOAD_SIZE = 512 * 1024  # 512 KB per file
_MAX_UPLOAD_FILES = 100


@router.get("/me")
async def me(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {
        "user_id": user["_id"],
        "username": user.get("username"),
        "email": user.get("email"),
        "steam_id": user.get("steam_id"),
        "discord_id": user.get("discord_id"),
        "created_at": user.get("created_at"),
        "needs_email": not user.get("email"),
    }


@router.post("/logout")
async def logout(request: Request):
    response = JSONResponse({"success": True})
    clear_auth_cookie(response)
    return response


@router.patch("/username")
@limiter.limit("10/minute")
async def update_username(request: Request):
    user = require_user(request)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    new_name = body.get("username", "")
    if not isinstance(new_name, str) or not new_name.strip():
        raise HTTPException(status_code=400, detail="Username is required")

    from ..services.users_db import update_username as _update

    result = _update(user["_id"], new_name)
    if result.get("error"):
        status = 429 if "3 times" in result["error"] else 400
        raise HTTPException(status_code=status, detail=result["error"])

    # Propagate to existing runs
    _propagate_username(user["_id"], result["username"])

    return result


@router.get("/username/check")
async def check_username(username: str):
    if not username or not username.strip():
        return {"available": False}
    from ..services.users_db import check_username_available

    return {
        "available": check_username_available(username),
        "username": username.strip(),
    }


@router.patch("/email")
@limiter.limit("10/minute")
async def update_email(request: Request):
    user = require_user(request)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    email = body.get("email", "")
    if not isinstance(email, str) or not email.strip():
        raise HTTPException(status_code=400, detail="Email is required")

    from ..services.users_db import update_email as _update

    result = _update(user["_id"], email)
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])

    return result


@router.get("/runs")
@limiter.limit("60/minute")
async def get_my_runs(
    request: Request,
    page: int = 1,
    limit: int = 50,
):
    user = require_user(request)
    if limit > 100:
        limit = 100
    if page < 1:
        page = 1

    if not os.environ.get("MONGO_URL", "").strip():
        return {"runs": [], "total": 0, "page": page, "limit": limit}

    from ..services.runs_db_mongo import get_user_runs

    return get_user_runs(user["_id"], page=page, limit=limit)


@router.delete("/runs/{run_hash}")
@limiter.limit("30/minute")
async def delete_run(run_hash: str, request: Request):
    user = require_user(request)

    if not os.environ.get("MONGO_URL", "").strip():
        raise HTTPException(status_code=404, detail="Run not found")

    from ..services.runs_db_mongo import soft_delete_run

    result = soft_delete_run(run_hash, user["_id"])
    if result.get("error"):
        status_map = {
            "Run not found": 404,
            "You do not own this run": 403,
        }
        status = status_map.get(result["error"], 400)
        raise HTTPException(status_code=status, detail=result["error"])

    return {"success": True}


@router.post("/runs/upload")
@limiter.limit("10/minute")
async def upload_runs(request: Request, files: list[UploadFile] = File(...)):
    user = require_user(request)

    if len(files) > _MAX_UPLOAD_FILES:
        raise HTTPException(
            status_code=413,
            detail=f"Too many files. Max {_MAX_UPLOAD_FILES} per upload.",
        )

    results = []
    for upload in files:
        filename = upload.filename or "unknown"

        if not filename.endswith((".run", ".json")):
            results.append(
                {
                    "filename": filename,
                    "status": "error",
                    "detail": "Only .run and .json files are accepted",
                }
            )
            continue

        try:
            content = await upload.read()
        except Exception:
            results.append(
                {
                    "filename": filename,
                    "status": "error",
                    "detail": "Failed to read file",
                }
            )
            continue

        if len(content) > _MAX_UPLOAD_SIZE:
            results.append(
                {
                    "filename": filename,
                    "status": "error",
                    "detail": f"File too large (max {_MAX_UPLOAD_SIZE // 1024} KB)",
                }
            )
            continue

        try:
            data = json.loads(content)
        except (json.JSONDecodeError, UnicodeDecodeError):
            results.append(
                {
                    "filename": filename,
                    "status": "error",
                    "detail": "Invalid JSON",
                }
            )
            continue

        if not isinstance(data, dict) or not data.get("players"):
            results.append(
                {
                    "filename": filename,
                    "status": "error",
                    "detail": "Invalid run data: missing players",
                }
            )
            continue

        # Submit the run
        from ..services.runs_db import submit_run

        submit_result = submit_run(data, username=user.get("username"))
        if submit_result.get("error"):
            if submit_result.get("duplicate"):
                run_hash = submit_result.get("run_hash", "")
                _try_claim_run(run_hash, user)
                results.append(
                    {
                        "filename": filename,
                        "status": "duplicate",
                        "run_hash": run_hash,
                    }
                )
            else:
                results.append(
                    {
                        "filename": filename,
                        "status": "error",
                        "detail": submit_result["error"],
                    }
                )
        else:
            run_hash = submit_result.get("run_hash", "")
            _try_claim_run(run_hash, user)
            results.append(
                {
                    "filename": filename,
                    "status": "claimed",
                    "run_hash": run_hash,
                }
            )

    claimed = sum(1 for r in results if r["status"] == "claimed")
    duplicates = sum(1 for r in results if r["status"] == "duplicate")
    errors = sum(1 for r in results if r["status"] == "error")

    return {
        "results": results,
        "summary": {
            "total": len(results),
            "claimed": claimed,
            "duplicates": duplicates,
            "errors": errors,
        },
    }


@router.get("/runs/stats")
@limiter.limit("60/minute")
async def get_my_stats(request: Request):
    user = require_user(request)
    username = user.get("username")
    if not username:
        return {
            "total_runs": 0,
            "total_wins": 0,
            "win_rate": 0,
            "characters": [],
        }

    from ..services.runs_db import get_stats

    return get_stats(username=username)


def _propagate_username(user_id: str, new_username: str) -> None:
    if not os.environ.get("MONGO_URL", "").strip():
        return
    try:
        from ..services.runs_db_mongo import _get_collection

        coll = _get_collection()
        from bson import ObjectId

        coll.update_many(
            {"user_id": ObjectId(user_id)},
            {"$set": {"username": new_username}},
        )
    except Exception:
        pass


def _try_claim_run(run_hash: str, user: dict) -> None:
    if not os.environ.get("MONGO_URL", "").strip() or not run_hash:
        return
    try:
        from ..services.runs_db_mongo import _get_collection
        from bson import ObjectId

        coll = _get_collection()
        coll.update_one(
            {"_id": run_hash},
            {
                "$set": {
                    "user_id": ObjectId(user["_id"]),
                    "username": user.get("username", ""),
                }
            },
        )
    except Exception:
        pass
