"""Admin review queue for suspicious wins: one ranked list, with hide, bulk
hide, hide a player's runs, and a looks-fine verdict that sticks. Guarded by
`require_admin` like the rest of /api/admin."""

import os

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..services import cheat_review
from ..services.auth_jwt import require_admin
from .admin import _audit

router = APIRouter(
    prefix="/api/admin/cheat-review",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)

MAX_BATCH = 200


class HideRequest(BaseModel):
    run_hashes: list[str] = Field(..., min_length=1, max_length=MAX_BATCH)
    hidden: bool = True
    reason: str | None = Field(None, max_length=200)


class ClearRequest(BaseModel):
    run_hashes: list[str] = Field(..., min_length=1, max_length=MAX_BATCH)
    cleared: bool = True


class PlayerRequest(BaseModel):
    run_hash: str = Field(..., min_length=1, max_length=64)
    hidden: bool = True
    reason: str | None = Field(None, max_length=200)


def _mongo() -> None:
    if not os.environ.get("MONGO_URL", "").strip():
        raise HTTPException(503, "the review queue needs MongoDB")


def _hashes(raw: list[str]) -> list[str]:
    return list(dict.fromkeys(h.strip() for h in raw if h.strip()))


def _drop_blob_cache() -> None:
    from .runs import _load_run_blob_cached

    _load_run_blob_cached.cache_clear()


@router.get("/queue")
def queue(request: Request, limit: int = 50):
    _audit(request)
    _mongo()
    return cheat_review.review_queue(limit=limit)


@router.post("/hide")
def hide(request: Request, body: HideRequest):
    _audit(request)
    _mongo()
    hashes = _hashes(body.run_hashes)
    if body.hidden:
        result = cheat_review.hide_runs(hashes, body.reason)
    else:
        result = cheat_review.unhide_runs(hashes)
    _drop_blob_cache()
    return result


@router.post("/clear")
def clear(request: Request, body: ClearRequest):
    _audit(request)
    _mongo()
    admin = getattr(request.state, "admin_user", None) or {}
    by = str(admin.get("_id") or "") or None
    return cheat_review.set_cleared(_hashes(body.run_hashes), body.cleared, by)


@router.post("/hide-player")
def hide_player(request: Request, body: PlayerRequest):
    _audit(request)
    _mongo()
    result = cheat_review.set_player_hidden(
        body.run_hash.strip(), body.hidden, body.reason
    )
    if result.get("error"):
        status = 404 if result["error"] == "Run not found" else 400
        raise HTTPException(status, result["error"])
    _drop_blob_cache()
    return result
