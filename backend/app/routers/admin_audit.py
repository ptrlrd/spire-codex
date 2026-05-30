"""Audit log — read-only view of every admin action.

Records are written by `services/audit_log.py::record()` from each
admin write endpoint. This router is read-only — it never writes,
and there's deliberately no DELETE endpoint. An append-only log
that can be edited isn't an audit log.

## Endpoints

  GET /api/admin/audit
    Last 100 entries, newest first.
    Query: ?limit=100, ?since=ISO, ?actor=..., ?action=...

  GET /api/admin/audit/by-target/{target}
    Every entry referencing a specific run hash, slug, etc. — useful
    for "show me everything that's ever been done to run X."

## Retention

Append-only, no TTL on the application side. Mongo collection has a
date-based partial index for fast `?since=...` queries. For
long-term retention, run `playbooks/backup.yml` (existing) which
already snapshots Mongo dumps to B2.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from ..dependencies import require_admin

router = APIRouter(
    prefix="/api/admin/audit",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


@router.get("")
async def list_audit(request: Request):
    """Most recent entries, newest first.
    Query: ?limit=100, ?since=2026-05-20T00:00:00, ?actor=..., ?action=..."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.get("/by-target/{target}")
async def by_target(target: str, request: Request):
    """All audit entries referencing a specific target (run hash,
    guide slug, username, rate-limit slug, etc.)."""
    raise HTTPException(status_code=501, detail="Not implemented yet")
