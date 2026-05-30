"""Content moderation — hide individual runs, guides, usernames.

## Why "hide" instead of "delete"

Soft-delete pattern: every doc gets a `hidden_at`, `hidden_by`,
`hidden_reason` field set by the admin endpoint. Read paths add
`{"hidden_at": None}` (or `{$exists: false}`) to their match clauses.
Reasons:

- Undo is one update — restoring is `unset hidden_at`. Hard-delete
  has no undo.
- Audit log entry remains valid (it references the doc by id).
- Stats summary refresher already supports filtering by arbitrary
  match clause — adding `"hidden_at": None` is a one-line change.

## Categories

- `/api/admin/moderation/runs/{hash}/hide`        — flag a single run
- `/api/admin/moderation/runs/{hash}/unhide`      — restore
- `/api/admin/moderation/guides/{slug}/hide`      — same for guides
- `/api/admin/moderation/usernames/{name}/clear`  — strip a username
  from all runs that claimed it (e.g. impersonation report)
- `/api/admin/moderation/usernames/{name}/reassign` — reassign claimed
  hashes to a different name (dispute resolution)

## Read-path filtering (follow-up PR scope)

Every endpoint that lists runs needs a `"hidden_at": None` clause.
Doing that retroactively without breaking caches:

  1. Add the filter to runs_db_mongo.list_runs / leaderboard /
     get_stats / etc.
  2. Force-refresh stats_summary so the materialized doc reflects the
     filtered population.
  3. Purge CF cache for the affected list pages.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from ..dependencies import require_admin

router = APIRouter(
    prefix="/api/admin/moderation",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


@router.post("/runs/{run_hash}/hide")
async def hide_run(run_hash: str, request: Request):
    """Body: `{"reason": "impossible-time / sub-1-minute-win"}`.
    Sets `hidden_at`, `hidden_by`, `hidden_reason` on the Mongo doc.
    TODO: + audit log + stats_summary refresh trigger.
    """
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/runs/{run_hash}/unhide")
async def unhide_run(run_hash: str, request: Request):
    """Unset the hidden_* fields. Run re-appears in leaderboards on
    the next stats refresh."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/guides/{slug}/hide")
async def hide_guide(slug: str, request: Request):
    """Same shape as hide_run; soft-deletes a community guide.
    Body: `{"reason": "..."}`."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/guides/{slug}/unhide")
async def unhide_guide(slug: str, request: Request):
    """Restore a hidden guide."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/usernames/{name}/clear")
async def clear_username(name: str, request: Request):
    """Strip `name` from every run that claimed it (impersonation
    response). The runs themselves stay; they just become anonymous
    again."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/usernames/{name}/reassign")
async def reassign_username(name: str, request: Request):
    """Body: `{"new_name": "..."}`. Bulk rewrite all runs claimed
    under `name` to use `new_name`. Used for dispute resolution
    when two players claim the same handle."""
    raise HTTPException(status_code=501, detail="Not implemented yet")
