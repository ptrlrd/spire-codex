#!/usr/bin/env python3
"""Backfill: normalize legacy string ``submitted_at`` values on run docs to dates.

The keyset run export (GET /api/exports/runs) orders runs by
``(submitted_at, _id)`` and encodes each page boundary from ``submitted_at``.
Runs imported from the old SQLite store kept ``submitted_at`` as a *string*,
which sorts ahead of the real date-typed runs (BSON orders string before date)
and used to crash cursor encoding. Converting them to real BSON dates puts the
whole corpus in one clean order so a paged export walks every run.

Safe to re-run: it only touches docs whose ``submitted_at`` is still a string.
The runs validator is ``moderate``, so it spares these currently-invalid docs
and the $set is allowed.

Dry-run by default; pass --apply to write. Reads MONGO_URL from the env:

    MONGO_URL='mongodb://app:<pass>@<host>:27017/spire_codex?authSource=admin' \\
        python tools/backfill_run_submitted_at.py --apply
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

try:
    from pymongo import MongoClient, UpdateOne
except ImportError:
    print("pymongo is required (pip install pymongo)", file=sys.stderr)
    raise


def _parse(value: str) -> datetime | None:
    """Parse a legacy submitted_at string into an aware UTC datetime, or None if
    it can't be parsed. SQLite CURRENT_TIMESTAMP is 'YYYY-MM-DD HH:MM:SS' (UTC),
    which datetime.fromisoformat accepts."""
    try:
        dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def main() -> int:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument(
        "--apply", action="store_true", help="write changes (default: dry-run)"
    )
    p.add_argument("--batch", type=int, default=1000, help="bulk-write batch size")
    args = p.parse_args()

    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        print("MONGO_URL env var required", file=sys.stderr)
        return 1

    coll = MongoClient(mongo_url).get_default_database().runs
    query = {"submitted_at": {"$type": "string"}}
    total = coll.count_documents(query)
    print(f"{total} run(s) with a string submitted_at")
    if total == 0:
        return 0

    converted = skipped = 0
    ops: list[UpdateOne] = []
    for doc in coll.find(query, {"submitted_at": 1}):
        dt = _parse(doc["submitted_at"])
        if dt is None:
            skipped += 1
            continue
        converted += 1
        if args.apply:
            ops.append(UpdateOne({"_id": doc["_id"]}, {"$set": {"submitted_at": dt}}))
            if len(ops) >= args.batch:
                coll.bulk_write(ops, ordered=False)
                ops = []
    if args.apply and ops:
        coll.bulk_write(ops, ordered=False)

    verb = "converted" if args.apply else "would convert"
    print(f"{verb}: {converted}   unparseable (left as-is): {skipped}")
    if not args.apply:
        print("dry-run only; re-run with --apply to write")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
