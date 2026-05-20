"""Scheduled task viewer — when did each cron / GH Actions / systemd
timer / backend background job last run, with what result.

## What we schedule today

1. **GitHub Actions cron workflows** (in `.github/workflows/`):
   - `news-refresh.yml` — every 6h, parses Steam news into data/news/
   - `runs-db-backup.yml` — nightly snapshot of the runs DB

2. **Backend background daemons** (in-process threads):
   - `stats_summary` refresher — every 60s, materializes
     /api/runs/stats output (see `routers/runs.py::start_stats_refresher`)
   - `run-entity-stats` warm-up — once at startup, then opportunistic
     refresh

3. **Systemd / OS-level timers on the DO box**:
   - `logrotate.timer` — nightly
   - (nothing else app-specific currently)

The dashboard surface unifies these into one panel: "everything
that's supposed to run on a schedule, and when it last ran."

## Sources

- **GH Actions**: `gh api /repos/{owner}/{repo}/actions/workflows`
  + `/runs?per_page=1&status=completed` per workflow. ~5 cron
  workflows × 1 API call each → ~250ms total, cached for 60s.
- **Backend daemons**: each writes its last-success timestamp to a
  `schedule_health` Mongo doc on every tick. Read here.
- **Systemd timers** on the host: harder to query from inside the
  container without exposing the host. Punt for v1 — admin can
  `systemctl list-timers` on the box if they need it.

## Endpoints

  GET /api/admin/schedules
  →
  {
    "github_actions": [
      {"name": "news-refresh", "last_run_at": ISO, "conclusion": "success",
       "next_estimated_at": ISO},
      ...
    ],
    "backend_daemons": [
      {"name": "stats_summary_refresher", "last_tick_at": ISO,
       "interval_seconds": 60, "lag_seconds": 12.4},
      ...
    ]
  }

  POST /api/admin/schedules/{name}/trigger-now
       Where supported (GH workflows have a `workflow_dispatch` event)
       — kicks off the workflow immediately. Returns the new run id.

## What this catches

The half-life on "a scheduled job stopped running but nobody
noticed" is usually as long as it takes for someone to notice the
*output* missing. For news: a week. For backups: until you need a
restore. This panel makes the silence audible.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from ..dependencies import require_admin

router = APIRouter(
    prefix="/api/admin/schedules",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


@router.get("")
async def list_schedules(request: Request):
    """Combined view of GH Actions cron workflows + backend daemons.
    See module docstring for the response shape."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/{name}/trigger-now")
async def trigger_now(name: str, request: Request):
    """Force an immediate run of a scheduled job. Only works for
    things that support manual triggers (GitHub Actions via
    workflow_dispatch; backend daemons via an explicit wake-up
    method on the daemon thread)."""
    raise HTTPException(status_code=501, detail="Not implemented yet")
