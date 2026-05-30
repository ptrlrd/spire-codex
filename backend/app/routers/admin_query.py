"""Locked-down Mongo read-only query console.

Lets the operator answer one-off questions ("how many wins by
Necrobinder since the last patch", "every run with seed starting
'21_04_2026'") without dropping into mongosh on the box or writing
a throwaway Python script.

## Threat model

The admin token gate + CF Access OAuth already establish operator
identity. The remaining concern is *operator footgun* — accidentally
running `{$out: "runs"}` and wiping a collection, or `count` on an
unbounded set that locks the worker. Defense:

1. **Whitelist-only operations**. The endpoint only accepts:
     find, find_one, count_documents, aggregate, distinct
   Everything else (insert*, update*, delete*, drop*, etc.) is
   rejected before touching pymongo.

2. **Whitelist-only collections**. `runs`, `stats_summary`,
   `bulk_jobs`, `admin_audit` — and that's it for now. New
   collections need an explicit allow.

3. **Result cap**. Hard limit of 100 documents in the response, no
   matter what limit the operator passed. Counts are exact, finds
   are sampled.

4. **Aggregation pipeline filtering**. `$out`, `$merge`,
   `$function`, `$accumulator`, `$where` (server-side JS), `$lookup`
   targeting non-whitelisted collections — all rejected by a static
   pre-pass before sending to Mongo.

5. **Query timeout**. `maxTimeMS: 5000` on every call so a runaway
   aggregation can't pin a worker.

6. **Audit log entry per query**. Every query (filter + pipeline +
   result count) is written to `admin_audit` so future-you can see
   what you ran last Tuesday at 3am.

## Endpoints

  POST /api/admin/query/find
       Body: {"collection": "runs", "filter": {...}, "projection": {...}, "limit": 100}

  POST /api/admin/query/count
       Body: {"collection": "runs", "filter": {...}}

  POST /api/admin/query/aggregate
       Body: {"collection": "runs", "pipeline": [...], "limit": 100}

  POST /api/admin/query/distinct
       Body: {"collection": "runs", "field": "character", "filter": {...}}

  GET  /api/admin/query/saved-queries
  POST /api/admin/query/saved-queries
       Lets you bookmark a query you'll re-run (e.g. "weekly
       cheater-candidate scan: deck_size > 200 sorted by submitted_at desc").
       Stored in `saved_queries` collection.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from ..dependencies import require_admin

router = APIRouter(
    prefix="/api/admin/query",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


# Whitelists enforced at request time. Keeping them at module scope so
# they show up in repo grep — easier to audit than runtime config.
ALLOWED_COLLECTIONS = {"runs", "stats_summary", "bulk_jobs", "admin_audit"}
ALLOWED_OPS = {"find", "find_one", "count_documents", "aggregate", "distinct"}
FORBIDDEN_PIPELINE_STAGES = {
    "$out",
    "$merge",
    "$function",
    "$accumulator",
    "$where",
}
MAX_RESULT_DOCS = 100
QUERY_TIMEOUT_MS = 5000


@router.post("/find")
async def query_find(request: Request):
    """Read a few documents matching the filter. Capped at 100 hard."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/count")
async def query_count(request: Request):
    """Exact count_documents for the filter. Cheap; no result cap."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/aggregate")
async def query_aggregate(request: Request):
    """Run an aggregation pipeline. Pipeline pre-validated against
    FORBIDDEN_PIPELINE_STAGES; $lookup `from` collection must be in
    ALLOWED_COLLECTIONS too. Results capped, 5s timeout."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/distinct")
async def query_distinct(request: Request):
    """Distinct field values for the matched docs. Useful for the
    "what build_ids have we seen this month" class of question."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.get("/saved")
async def list_saved(request: Request):
    """List the operator's bookmarked queries."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/saved")
async def save_query(request: Request):
    """Bookmark a query for re-use. Body: `{"name": "...", "op": "find",
    "collection": "runs", "filter": {...}}`."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.delete("/saved/{name}")
async def delete_saved(name: str, request: Request):
    """Drop a saved query."""
    raise HTTPException(status_code=501, detail="Not implemented yet")
