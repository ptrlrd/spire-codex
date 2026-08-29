"""On-box lake extraction: every run -> gzipped JSONL pages in /lake/staging.

Runs inside the backend image (has pymongo + the app's Mongo config), so it
reads blobs Mongo-first with per-run file fallback -- the same source of
truth the site serves from. Each line is the raw run blob plus a _meta
envelope carrying server-side fields the blob lacks (username, hidden,
timestamps).

Incremental: /lake/staging/state.json records the (submitted_at, _id)
cursor; when present, only newer runs are pulled and appended as new pages.
Every run also refreshes /lake/excluded_current.jsonl.gz (outside the
pages glob) -- the
full current hidden/deleted id set -- because runs mutate (hide/unhide,
deletes) after their page was written.

    docker compose -f docker-compose.lab.yml run --rm extract
    docker compose -f docker-compose.lab.yml run --rm extract --bootstrap
      (one-time: derive state.json from existing pages that predate it)
"""

import gzip
import json
import pathlib
import sys
import time

sys.path.insert(0, "/app")

from app.services.runs_db_mongo import _get_collection, get_run_blobs

STAGING = pathlib.Path("/lake/staging")
STATE = STAGING / "state.json"
RUNS_DIR = pathlib.Path("/data/runs")
PAGE_SIZE = 50_000
BATCH = 300


def _iso(v):
    return v.isoformat() if hasattr(v, "isoformat") else v


def _bootstrap() -> None:
    """Write state.json from the newest existing page (pre-state extracts)."""
    pages = sorted(STAGING.glob("[0-9]*.jsonl.gz"))
    if not pages:
        print("no pages found; nothing to bootstrap")
        return
    last = None
    with gzip.open(pages[-1], "rt", encoding="utf-8") as f:
        for line in f:
            last = line
    obj = json.loads(last)
    state = {
        "submitted_at": obj["_meta"]["submitted_at"],
        "run_hash": obj["run_hash"],
        "page_next": int(pages[-1].name.split(".")[0]) + 1,
    }
    STATE.write_text(json.dumps(state))
    print(f"state bootstrapped from {pages[-1].name}: {state}")


def _refresh_excluded(coll) -> None:
    n = 0
    tmp = pathlib.Path("/lake/excluded_current.jsonl.gz.tmp")
    with gzip.open(tmp, "wt", encoding="utf-8") as out:
        for doc in coll.find(
            {"$or": [{"hidden": True}, {"deleted_at": {"$ne": None}}]}, {"_id": 1}
        ):
            out.write(json.dumps({"run_hash": doc["_id"]}) + "\n")
            n += 1
    tmp.replace(pathlib.Path("/lake/excluded_current.jsonl.gz"))
    print(f"excluded sidecar refreshed: {n:,} hidden/deleted runs", flush=True)


def _refresh_scalars(coll) -> None:
    """Frame inputs that exist only as doc scalars, plus the two mutable
    fields (username, hidden) the frame needs fresh. Full projection scan
    like the excluded sidecar, so frame.parquet can build from the lake
    instead of walking every Mongo doc through Python."""
    n = 0
    tmp = pathlib.Path("/lake/run_scalars_current.jsonl.gz.tmp")
    with gzip.open(tmp, "wt", encoding="utf-8") as out:
        for doc in coll.find(
            {},
            {
                "_id": 1,
                "floors_reached": 1,
                "deck_size": 1,
                "relic_count": 1,
                "acts_completed": 1,
                "username": 1,
                "hidden": 1,
                "character": 1,
                "build_id": 1,
            },
        ):
            out.write(
                json.dumps(
                    {
                        "run_hash": doc["_id"],
                        "floors_reached": doc.get("floors_reached"),
                        "deck_size": doc.get("deck_size"),
                        "relic_count": doc.get("relic_count"),
                        "acts_completed": doc.get("acts_completed"),
                        "username": doc.get("username"),
                        "hidden": bool(doc.get("hidden")),
                        "character": doc.get("character"),
                        "build_id": doc.get("build_id"),
                    }
                )
                + "\n"
            )
            n += 1
    tmp.replace(pathlib.Path("/lake/run_scalars_current.jsonl.gz"))
    print(f"run-scalars sidecar refreshed: {n:,} runs", flush=True)


def main() -> tuple[int, int]:
    """Returns (written, skipped) so the ingest can record cycle metrics."""
    STAGING.mkdir(parents=True, exist_ok=True)
    if "--bootstrap" in sys.argv:
        _bootstrap()
        return (0, 0)
    coll = _get_collection()
    _refresh_excluded(coll)
    _refresh_scalars(coll)

    query: dict = {}
    page = 0
    if STATE.exists():
        st = json.loads(STATE.read_text())
        page = st["page_next"]
        ts, last_id = st["submitted_at"], st["run_hash"]
        from datetime import datetime

        cutoff = datetime.fromisoformat(ts)
        query = {
            "$or": [
                {"submitted_at": {"$gt": cutoff}},
                {"submitted_at": cutoff, "_id": {"$gt": last_id}},
            ]
        }
        print(f"incremental from ({ts}, {last_id}), next page {page}", flush=True)

    cursor = coll.find(
        query,
        {
            "_id": 1,
            "username": 1,
            "user_id": 1,
            "hidden": 1,
            "deleted_at": 1,
            "submitted_at": 1,
            "played_at": 1,
            "player_count": 1,
            "character": 1,
        },
        no_cursor_timeout=True,
    ).sort([("submitted_at", 1), ("_id", 1)])

    t0 = time.time()
    written = skipped = 0
    last_meta: dict = {}
    out = gzip.open(STAGING / f"{page:05d}.jsonl.gz", "wt", encoding="utf-8")
    batch: list[dict] = []

    def flush(rows: list[dict]) -> None:
        nonlocal written, skipped, page, out, last_meta
        try:
            blobs = get_run_blobs([r["_id"] for r in rows])
        except Exception:
            blobs = {}
        for r in rows:
            h = r["_id"]
            obj = blobs.get(h)
            if obj is None:
                try:
                    obj = json.loads(
                        (RUNS_DIR / f"{h}.json").read_text(encoding="utf-8")
                    )
                except Exception:
                    skipped += 1
                    continue
            try:
                obj["run_hash"] = h
                obj["_meta"] = {
                    "username": r.get("username"),
                    "user_id": str(r["user_id"]) if r.get("user_id") else None,
                    "hidden": bool(r.get("hidden")),
                    "deleted": r.get("deleted_at") is not None,
                    "submitted_at": _iso(r.get("submitted_at")),
                    "played_at": _iso(r.get("played_at")),
                    "player_count": r.get("player_count") or 1,
                    # THIS document's character. Party runs fan out to one
                    # doc per player over the same shared blob, so the
                    # blob's players[1] is only right for player 1 — every
                    # sibling was being credited to it.
                    "character": r.get("character"),
                }
                out.write(json.dumps(obj, separators=(",", ":")) + "\n")
                written += 1
                last_meta = {
                    "submitted_at": obj["_meta"]["submitted_at"],
                    "run_hash": h,
                }
            except Exception:
                skipped += 1
                continue
            if written % PAGE_SIZE == 0:
                out.close()
                page += 1
                out = gzip.open(
                    STAGING / f"{page:05d}.jsonl.gz", "wt", encoding="utf-8"
                )
                rate = written / max(1.0, time.time() - t0)
                print(
                    f"page {page}: {written:,} written, {skipped:,} skipped, "
                    f"{rate:.0f} runs/s",
                    flush=True,
                )

    try:
        for row in cursor:
            batch.append(row)
            if len(batch) >= BATCH:
                flush(batch)
                batch = []
        if batch:
            flush(batch)
    finally:
        cursor.close()
        out.close()
    if last_meta:
        STATE.write_text(json.dumps({**last_meta, "page_next": page + 1}))
    print(
        f"DONE: {written:,} written, {skipped:,} skipped in "
        f"{(time.time() - t0) / 60:.1f} min",
        flush=True,
    )
    return (written, skipped)


if __name__ == "__main__":
    main()
