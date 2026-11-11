"""Remove the runs that were only soft deleted.

A user delete used to set deleted_at on the run doc and leave everything in
place. Deletes are permanent now, so the leftover docs go the same way: the
run doc, its blob, its file on disk and its replay. A run whose deleted_at
was cleared by a re-upload in the meantime is left alone. Safe to run again.
Dry run by default.

    python -m scripts.purge_soft_deleted_runs
    python -m scripts.purge_soft_deleted_runs --apply
"""

import argparse
import os
import time

SOFT_DELETED = {"deleted_at": {"$ne": None}}
FIELDS = {
    "hidden": 1,
    "deleted_at": 1,
    "character": 1,
    "win": 1,
    "was_abandoned": 1,
    "ascension": 1,
}


def survey(batch: int = 500) -> dict:
    from app.services import runs_db_mongo
    from app.services.replays_db import _coll as replays

    coll = runs_db_mongo._get_collection()
    counts = {
        "runs": coll.count_documents(SOFT_DELETED),
        "blobs": 0,
        "replays": 0,
        "files": 0,
    }

    def tally(hashes: list[str]) -> None:
        query = {"_id": {"$in": hashes}}
        counts["blobs"] += runs_db_mongo._blob_collection().count_documents(query)
        counts["replays"] += replays().count_documents(query)
        runs_dir = runs_db_mongo._data_dir / "runs"
        counts["files"] += sum((runs_dir / f"{h}.json").exists() for h in hashes)

    pending: list[str] = []
    for doc in coll.find(SOFT_DELETED, {"_id": 1}):
        pending.append(doc["_id"])
        if len(pending) >= batch:
            tally(pending)
            pending = []
    if pending:
        tally(pending)
    return counts


def purge(batch: int = 200, pause: float = 0.5) -> int:
    from app.services import runs_db_mongo

    coll = runs_db_mongo._get_collection()
    removed = 0
    while True:
        docs = list(coll.find(SOFT_DELETED, FIELDS).limit(batch))
        if not docs:
            break
        done = sum(runs_db_mongo._remove_run(doc, SOFT_DELETED) for doc in docs)
        removed += done
        print(f"removed {removed}", flush=True)
        if not done:
            break
        time.sleep(pause)
    return removed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--batch", type=int, default=200)
    ap.add_argument("--sleep", type=float, default=0.5)
    args = ap.parse_args()
    if not os.environ.get("MONGO_URL", "").strip():
        print("MONGO_URL unset; nothing to do")
        return 1

    counts = survey()
    print(
        f"soft-deleted runs: {counts['runs']} "
        f"(blobs {counts['blobs']}, replays {counts['replays']}, "
        f"files {counts['files']})",
        flush=True,
    )
    if not args.apply:
        print("dry-run; pass --apply to remove them")
        return 0

    removed = purge(max(1, args.batch), max(0.0, args.sleep))
    from app.services import runs_db_mongo

    left = runs_db_mongo._get_collection().count_documents(SOFT_DELETED)
    print(f"removed {removed}, {left} soft-deleted runs left", flush=True)
    return 0 if left == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
