import base64
import gzip
import io
import json
import os
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pymongo import ASCENDING
from slowapi import Limiter

from ..dependencies import VALID_LANGUAGES, client_ip
from ..services import rate_limit_config
from ..metrics import data_exports, run_export_pages, run_exports
from ..services.data_service import DATA_DIR

router = APIRouter(prefix="/api/exports", tags=["Exports"])

limiter = Limiter(key_func=client_ip, **rate_limit_config.storage_kwargs())

ENTITY_FILES = [
    "cards",
    "relics",
    "potions",
    "characters",
    "monsters",
    "powers",
    "events",
    "encounters",
    "enchantments",
    "keywords",
    "intents",
    "orbs",
    "afflictions",
    "modifiers",
    "achievements",
    "epochs",
]

_RUNS_DIR = (
    Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data"))
    / "runs"
)

OFFICIAL_CHARACTERS = {"IRONCLAD", "SILENT", "DEFECT", "NECROBINDER", "REGENT"}

# Upper bound on a single page so one request can't ask for the whole corpus
# while still claiming the cheap (paginated) rate-limit cost.
MAX_PAGE_LIMIT = 50000


def _parse_iso(value: str, field: str) -> datetime:
    """Parse an ISO-8601 timestamp param into an aware UTC datetime (400 on
    malformed input). Naive timestamps are assumed UTC."""
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        raise HTTPException(
            status_code=400, detail=f"invalid {field}: expected an ISO-8601 timestamp"
        )
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _encode_cursor(submitted_at, run_hash: str) -> str:
    """Encode a keyset position as an opaque, URL-safe token. Runs missing a
    submitted_at sort first, encoded with an empty timestamp.

    submitted_at is normally a datetime (or None). Legacy runs imported from the
    old SQLite store can still hold it as a string, which has no isoformat() and
    used to crash here, 500-ing the whole page. Coerce anything non-datetime to
    text so a page boundary never raises. tools/backfill_run_submitted_at.py
    converts those strings to real dates so the keyset walk covers the whole
    corpus; until it runs, such a boundary just reads as its raw timestamp."""
    if submitted_at is None:
        sa = ""
    elif hasattr(submitted_at, "isoformat"):
        sa = submitted_at.isoformat()
    else:
        sa = str(submitted_at)
    return base64.urlsafe_b64encode(f"{sa}|{run_hash}".encode("utf-8")).decode("ascii")


def _decode_cursor(token: str):
    """Decode an X-Next-Cursor token back into (submitted_at|None, run_hash).
    400 on a malformed token. binascii.Error subclasses ValueError, so a bad
    base64 payload is covered too."""
    try:
        raw = base64.urlsafe_b64decode(token.encode("ascii")).decode("utf-8")
        sa_str, run_hash = raw.split("|", 1)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="invalid cursor")
    submitted_at = _parse_iso(sa_str, "cursor") if sa_str else None
    return submitted_at, run_hash


def _build_match(start, end, cursor) -> dict:
    """Mongo filter for the export: official runs (an official character in
    the official ascension range; A11+ is modded), an optional half-open
    [start, end) submitted_at window, and an optional keyset continuation
    strictly after `cursor`'s (submitted_at, _id)."""
    clauses: list[dict] = [
        {"character": {"$in": list(OFFICIAL_CHARACTERS)}},
        {"ascension": {"$gte": 0, "$lte": 10}},
    ]

    range_q: dict = {}
    if start is not None:
        range_q["$gte"] = start
    if end is not None:
        range_q["$lt"] = end
    if range_q:
        clauses.append({"submitted_at": range_q})

    if cursor is not None:
        sa, run_hash = cursor
        if sa is None:
            # Still inside the leading null/missing-submitted_at block: take
            # the remaining nulls by _id, then everything with a timestamp.
            clauses.append(
                {
                    "$or": [
                        {"submitted_at": None, "_id": {"$gt": run_hash}},
                        {"submitted_at": {"$ne": None}},
                    ]
                }
            )
        else:
            clauses.append(
                {
                    "$or": [
                        {"submitted_at": {"$gt": sa}},
                        {"submitted_at": sa, "_id": {"$gt": run_hash}},
                    ]
                }
            )

    return clauses[0] if len(clauses) == 1 else {"$and": clauses}


def _page_hashes(start, end, cursor, limit):
    """Return (ordered_hashes, next_cursor). Runs are ordered by
    (submitted_at, _id); next_cursor is None unless a bounded page is full
    and at least one more run follows it."""
    from ..services.runs_db_mongo import _get_collection

    coll = _get_collection()
    finder = coll.find(
        _build_match(start, end, cursor),
        {"_id": 1, "submitted_at": 1},
        no_cursor_timeout=True,
    ).sort([("submitted_at", ASCENDING), ("_id", ASCENDING)])
    if limit is not None:
        finder = finder.limit(limit + 1)  # one extra row probes for a next page
    try:
        docs = list(finder)
    finally:
        finder.close()

    next_cursor = None
    if limit is not None and len(docs) > limit:
        docs = docs[:limit]
        last = docs[-1]
        next_cursor = _encode_cursor(last.get("submitted_at"), last["_id"])
    return [doc["_id"] for doc in docs], next_cursor


def _page_params(
    start: str | None = Query(
        None, description="Inclusive lower bound on submitted_at (ISO-8601)."
    ),
    end: str | None = Query(
        None, description="Exclusive upper bound on submitted_at (ISO-8601)."
    ),
    cursor: str | None = Query(
        None,
        description="Opaque keyset token from a prior page's X-Next-Cursor header.",
    ),
):
    """Parse the window/cursor params as a dependency. Dependencies resolve
    before the rate-limit decorator charges the request, so a malformed value
    400s without spending budget — the same phase FastAPI validates ``limit``
    in. Parsed inside the handler these would be charged first (60 for an
    unbounded request), letting a few junk requests lock an IP out."""
    return (
        _parse_iso(start, "start") if start else None,
        _parse_iso(end, "end") if end else None,
        _decode_cursor(cursor) if cursor else None,
    )


def _export_cost(request: Request) -> int:
    """Rate-limit cost: a bounded (paginated) pull is cheap; an unbounded full
    dump stays rare. 60 against the 120/hour bucket reproduces the historical
    2/hour ceiling for the full export."""
    return 1 if request.query_params.get("limit") else 60


def _stream_runs_jsonl(hashes):
    buf = io.BytesIO()
    gz = gzip.GzipFile(fileobj=buf, mode="wb")

    for run_hash in hashes:
        run_file = _RUNS_DIR / f"{run_hash}.json"
        if not run_file.exists():
            continue
        try:
            raw = run_file.read_text(encoding="utf-8").strip()
            json.loads(raw)
        except (json.JSONDecodeError, OSError):
            continue
        gz.write(raw.encode("utf-8"))
        gz.write(b"\n")
        if buf.tell() > 65536:
            gz.flush()
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate()

    gz.close()
    tail = buf.getvalue()
    if tail:
        yield tail


# Declared BEFORE the /{lang} route so FastAPI matches the literal
# path "runs" instead of treating it as a language code.
@router.get("/runs")
@limiter.limit(
    rate_limit_config.endpoint_limit("exports.export_runs", "120/hour"),
    cost=_export_cost,
)
def export_runs(
    request: Request,
    limit: int | None = Query(
        None,
        ge=1,
        le=MAX_PAGE_LIMIT,
        description="Max runs in this page. Omit for the full (unbounded) export.",
    ),
    page: tuple = Depends(_page_params),
):
    """Bulk export of submitted runs as gzipped JSONL.

    Each line is the full raw game JSON as submitted by the client,
    including players, map_point_history, acts, deck, relics, and
    card_choices. Only runs with official characters are included.

    Runs are ordered by ``(submitted_at, _id)``. With no params the response
    is the full corpus (unchanged behaviour). To pull it in reliable chunks:

    * ``limit=N`` bounds the page to N runs. When more runs follow, the
      response carries an ``X-Next-Cursor`` header; pass it back as
      ``cursor=`` to fetch the next page. The ascending order means runs
      submitted *during* a long bootstrap sort after the cursor, so a
      forward pager never misses them.
    * ``start`` / ``end`` restrict to a half-open ``[start, end)``
      submitted_at window (e.g. an incremental "everything since my last
      sync"). Combine with ``limit`` to also bound each page.

    Consumer notes:

    * Terminate a paged walk on the **absence of ``X-Next-Cursor``**, never on
      "fewer lines than ``limit``": a page is ``limit`` *runs*, but the streamed
      line count can differ (missing/unreadable run files are skipped, and a
      multiplayer run emits one raw line per player).
    * The cursor does **not** embed the window, so keep ``start`` / ``end``
      constant across a paged sequence.
    * ``start`` / ``end`` filter on ``submitted_at``, so they exclude legacy
      runs that have no ``submitted_at``. Omit both to receive the whole corpus.
    * ``X-Next-Cursor`` is in the CORS ``Access-Control-Expose-Headers`` list,
      so browser clients can read it too; non-browser clients never needed it.
    """
    start_dt, end_dt, cursor_key = page

    (run_export_pages if limit is not None else run_exports).inc()
    hashes, next_cursor = _page_hashes(start_dt, end_dt, cursor_key, limit)

    headers = {
        "Content-Disposition": 'attachment; filename="spire-codex-runs.jsonl.gz"',
        "Cache-Control": "no-store",
    }
    if next_cursor is not None:
        headers["X-Next-Cursor"] = next_cursor

    return StreamingResponse(
        _stream_runs_jsonl(hashes),
        media_type="application/gzip",
        headers=headers,
    )


@router.get("/{lang}")
@limiter.limit(rate_limit_config.endpoint_limit("exports.export_language", "10/hour"))
def export_language(lang: str, request: Request):
    if lang not in VALID_LANGUAGES:
        lang = "eng"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for entity in ENTITY_FILES:
            filepath = DATA_DIR / lang / f"{entity}.json"
            if filepath.exists():
                zf.write(filepath, f"{entity}.json")
    buf.seek(0)
    data_exports.labels(lang=lang).inc()
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="spire-codex-{lang}.zip"'
        },
    )
