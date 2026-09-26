"""Admin surface for the replay store: find uploads by player, state, version
or date, inspect one, pull the raw journal, and re-queue or remove it.
Guarded by `require_admin` like the rest of /api/admin.
"""

import os

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from ..services import replay_admin
from ..services.auth_jwt import require_admin
from .admin import _audit

router = APIRouter(
    prefix="/api/admin/replays",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


def _mongo() -> None:
    if not os.environ.get("MONGO_URL", "").strip():
        raise HTTPException(503, "replay store needs MONGO_URL")


def _call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except replay_admin.AdminReplayError as e:
        raise HTTPException(e.status, e.detail)


@router.get("")
def replays_list(
    request: Request,
    state: str | None = None,
    run_hash: str | None = None,
    user: str | None = None,
    character: str | None = None,
    replay_version: int | None = None,
    mod_version: str | None = None,
    win: bool | None = None,
    since: str | None = None,
    until: str | None = None,
    page: int = 1,
    limit: int = 50,
):
    """Newest first. `state` is one of pending, claimed, retry, quarantined,
    done, deleted, or all (default: everything not deleted). `user` takes a
    username, a Steam64 id, or an account id. `since`/`until` bound the
    upload time (ISO 8601)."""
    _audit(request)
    _mongo()
    return _call(
        replay_admin.list_replays,
        page=page,
        limit=limit,
        state=state,
        run_hash=run_hash,
        user=user,
        character=character,
        replay_version=replay_version,
        mod_version=mod_version,
        win=win,
        since=since,
        until=until,
    )


@router.get("/stats")
def replays_stats(request: Request, days: int = 14):
    """Counts by ingest state, recorder version, mod version and character,
    plus uploads per Pacific day for the last `days` days."""
    _audit(request)
    _mongo()
    return _call(replay_admin.stats, days)


@router.get("/{run_hash}")
def replay_detail(request: Request, run_hash: str):
    _audit(request)
    _mongo()
    return _call(replay_admin.get_replay, run_hash)


@router.get("/{run_hash}/blob")
def replay_blob(request: Request, run_hash: str):
    """The stored gzip journal, hidden and deleted replays included."""
    _audit(request)
    _mongo()
    data, sha = _call(replay_admin.blob, run_hash)
    return Response(
        content=data,
        media_type="application/gzip",
        headers={
            "Content-Disposition": f'attachment; filename="{run_hash}.jsonl.gz"',
            "X-Replay-Sha256": sha,
        },
    )


@router.post("/{run_hash}/requeue")
def replay_requeue(request: Request, run_hash: str):
    """Send a quarantined or retry replay back through the next ingest cycle."""
    _audit(request)
    _mongo()
    return _call(replay_admin.requeue, run_hash)


@router.delete("/{run_hash}")
def replay_delete(request: Request, run_hash: str):
    """Soft delete: the viewer stops serving it and the run loses has_replay.
    The blob stays so restore can undo it."""
    _audit(request)
    _mongo()
    return _call(replay_admin.soft_delete, run_hash)


@router.post("/{run_hash}/restore")
def replay_restore(request: Request, run_hash: str):
    _audit(request)
    _mongo()
    return _call(replay_admin.restore, run_hash)
