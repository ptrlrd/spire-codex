"""Bulk operations — the "I'd rather click than re-write a script"
endpoints.

These are operator power tools: ops you'd otherwise do via a
one-shot Python script in tools/. Each is a long-running job that
returns a job id immediately and lets you poll status separately.

## Job pattern

Every bulk op writes a `bulk_jobs` doc:

  {
    "_id": "job_<uuid>",
    "kind": "rehash_runs",          # operation slug
    "params": {...},                # original request body
    "status": "queued|running|done|failed",
    "started_at": ..., "finished_at": ...,
    "processed": 0, "total": null,  # progress counters
    "error": null,
    "actor": "peter",
  }

Endpoint kicks off the job in a background thread (FastAPI's
BackgroundTasks for the simple case, or a separate worker if jobs
ever get bigger). GET /jobs/{id} returns current status.

## Initial set of bulk ops

- `POST /api/admin/bulk/rehash-runs` — recompute run_hash for runs
  matching a filter (after a hash-formula change)
- `POST /api/admin/bulk/dedupe-runs` — find duplicates by
  (seed, character, start, run_time) and hide all but the oldest
- `POST /api/admin/bulk/reattach-files` — for runs missing JSON
  files on disk, attempt sibling-copy or synthesize from Mongo doc
- `POST /api/admin/bulk/import-beta-version` — parse a fresh beta
  PCK + DLL extraction into a versioned data-beta/ dir
- `POST /api/admin/bulk/recompute-scores` — full rebuild of
  spire_codex_entity_scores (Codex Score) — same as /ops/refresh-
  entity-scores but as a tracked job for visibility
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from ..dependencies import require_admin

router = APIRouter(
    prefix="/api/admin/bulk",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


@router.get("/jobs")
async def list_jobs(request: Request):
    """Last N jobs across all kinds. Query: `?limit=50&kind=...&status=...`."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, request: Request):
    """Poll a specific job's status + progress."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/rehash-runs")
async def rehash_runs(request: Request):
    """Body: `{"filter": {...}}`. Recompute run_hash on matching docs."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/dedupe-runs")
async def dedupe_runs(request: Request):
    """Find duplicates by (seed, character, start_time, run_time) and
    hide all but the oldest. Returns a job id; results in audit log."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/reattach-files")
async def reattach_files(request: Request):
    """For runs missing JSON files on disk: try sibling-copy first,
    fall back to synthesizing a minimal blob from Mongo. Same logic
    as `/api/runs/shared/{hash}` does on-demand, batched."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/import-beta-version")
async def import_beta_version(request: Request):
    """Body: `{"version": "v0.106.0"}`. Parse a fresh beta extraction
    (assumes extraction/beta/raw + decompiled are populated) into
    data-beta/<version>/."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/recompute-scores")
async def recompute_scores(request: Request):
    """Full Codex Score rebuild as a tracked job. Same logic as the
    startup pre-warm and `/ops/refresh-entity-scores`, but progress
    is visible in /bulk/jobs."""
    raise HTTPException(status_code=501, detail="Not implemented yet")
