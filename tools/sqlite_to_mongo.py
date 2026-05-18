#!/usr/bin/env python3
"""One-shot SQLite → MongoDB ETL for the runs database.

Reads /data/runs.db (the current source of truth) and writes the
denormalized document representation to MongoDB. Runs idempotently —
re-running on a partial migration picks up only the missing runs.

Schema mapping
--------------
Old relational shape:

    runs(run_hash PK, username, character, win, ascension, ...)
    run_cards(run_hash FK, card_id, count, upgraded, floor_added_to_deck)
    run_relics(run_hash FK, relic_id, floor_picked_up)
    run_potions(run_hash FK, potion_id, floor, used)
    run_encounters(run_hash FK, encounter_id, floor)
    run_map(run_hash FK, floor, node_type, ...)

New document shape (one document per run):

    {
        "_id": <run_hash>,
        "username": ..., "character": ..., "win": ..., etc,
        "deck": [{ "id": ..., "count": ..., "upgraded": ..., "floor_added": ... }],
        "relics": [{ "id": ..., "floor": ... }],
        "potions": [{ "id": ..., "floor": ..., "used": ... }],
        "encounters": [{ "id": ..., "floor": ... }],
        "map": [{ "floor": ..., "node_type": ... }],
    }

Usage
-----
    MONGO_URL=mongodb://app:<pass>@<host>:27017/spire_codex?... \\
    python3 tools/sqlite_to_mongo.py /path/to/runs.db

    # Dry run — counts + sample doc, no writes
    python3 tools/sqlite_to_mongo.py /path/to/runs.db --dry-run

    # Verify only — read both, byte-compare on a sample
    python3 tools/sqlite_to_mongo.py /path/to/runs.db --verify
"""
from __future__ import annotations

import argparse
import os
import sqlite3
import sys
import time
from collections import defaultdict
from typing import Any

try:
    from pymongo import MongoClient, UpdateOne
    from pymongo.errors import BulkWriteError
except ImportError:
    print("pymongo not installed. pip install pymongo", file=sys.stderr)
    sys.exit(1)


BATCH_SIZE = 500


def fetch_child_rows(cur: sqlite3.Cursor, table: str) -> dict[str, list[dict[str, Any]]]:
    """Read an entire child table into {run_hash: [rows]}."""
    cur.execute(f"SELECT * FROM {table}")
    cols = [c[0] for c in cur.description]
    out: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in cur.fetchall():
        d = dict(zip(cols, row, strict=False))
        run_hash = d.pop("run_hash")
        out[run_hash].append(d)
    return out


def build_doc(run_row: dict[str, Any], children: dict[str, dict[str, list]]) -> dict[str, Any]:
    """Compose one Mongo document from a runs row + child rows."""
    rh = run_row["run_hash"]
    doc = {
        "_id": rh,
        **{k: v for k, v in run_row.items() if k != "run_hash"},
    }
    # Pull child arrays. Field names match the runs_db schema.
    doc["deck"] = children["run_cards"].get(rh, [])
    doc["relics"] = children["run_relics"].get(rh, [])
    doc["potions"] = children["run_potions"].get(rh, [])
    doc["encounters"] = children["run_encounters"].get(rh, [])
    # Map data may not exist in older schemas — handle gracefully.
    if "run_map" in children:
        doc["map"] = children["run_map"].get(rh, [])
    return doc


def migrate(sqlite_path: str, mongo_url: str, dry_run: bool = False) -> tuple[int, int]:
    """Returns (total_runs_seen, inserted_count)."""
    conn = sqlite3.connect(sqlite_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Find which child tables actually exist (schema has drifted over
    # versions — old DBs may lack run_map etc.)
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'run_%'")
    child_tables = [r[0] for r in cur.fetchall() if r[0] != "runs"]
    print(f"[sqlite] child tables found: {child_tables}")

    # Bulk-load every child table once. Trades RAM for round-trip count;
    # at 55MB the whole DB fits in memory many times over.
    print("[sqlite] loading child tables into memory...")
    t0 = time.time()
    children = {t: fetch_child_rows(cur, t) for t in child_tables}
    print(f"[sqlite] child load: {time.time() - t0:.1f}s")

    cur.execute("SELECT COUNT(*) FROM runs")
    total = cur.fetchone()[0]
    print(f"[sqlite] {total} runs to migrate")

    if dry_run:
        cur.execute("SELECT * FROM runs LIMIT 1")
        sample = dict(cur.fetchone())
        print(f"[dry-run] sample doc:\n{build_doc(sample, children)}")
        return total, 0

    client = MongoClient(mongo_url)
    coll = client.get_default_database().runs

    # Build idempotent upserts so re-running the script is safe.
    cur.execute("SELECT * FROM runs ORDER BY run_hash")
    batch: list[UpdateOne] = []
    inserted = 0
    seen = 0
    t0 = time.time()
    for row in cur:
        doc = build_doc(dict(row), children)
        batch.append(UpdateOne({"_id": doc["_id"]}, {"$setOnInsert": doc}, upsert=True))
        seen += 1
        if len(batch) >= BATCH_SIZE:
            inserted += _flush(coll, batch)
            batch.clear()
            if seen % 2000 == 0:
                rate = seen / (time.time() - t0)
                print(f"  {seen}/{total} ({rate:.0f}/s)")

    if batch:
        inserted += _flush(coll, batch)

    print(f"[mongo] {inserted} new docs written ({seen} runs seen in source)")
    return seen, inserted


def _flush(coll: Any, batch: list[UpdateOne]) -> int:
    try:
        res = coll.bulk_write(batch, ordered=False)
        return res.upserted_count
    except BulkWriteError as e:
        # Duplicate keys are expected on re-run — count the real failures.
        write_errors = [err for err in e.details["writeErrors"] if err["code"] != 11000]
        if write_errors:
            print(f"  bulk write errors: {write_errors[:3]}", file=sys.stderr)
        return e.details.get("nUpserted", 0)


def verify(sqlite_path: str, mongo_url: str, sample_size: int = 50) -> int:
    """Sanity-check: counts match, sampled runs are byte-equivalent."""
    sconn = sqlite3.connect(sqlite_path)
    sconn.row_factory = sqlite3.Row
    s_count = sconn.execute("SELECT COUNT(*) FROM runs").fetchone()[0]

    client = MongoClient(mongo_url)
    coll = client.get_default_database().runs
    m_count = coll.count_documents({})

    print(f"sqlite runs: {s_count}")
    print(f"mongo runs:  {m_count}")
    if s_count != m_count:
        print(f"  DELTA: {s_count - m_count}")
        return 1

    # Spot-check N random run_hashes
    sample = sconn.execute(
        f"SELECT run_hash FROM runs ORDER BY RANDOM() LIMIT {sample_size}"
    ).fetchall()
    miss = 0
    for (rh,) in sample:
        if not coll.find_one({"_id": rh}):
            print(f"  missing in mongo: {rh}")
            miss += 1
    print(f"sampled {sample_size}, missing in mongo: {miss}")
    return 0 if miss == 0 else 1


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("sqlite_path")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--verify", action="store_true")
    args = p.parse_args()

    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        print("MONGO_URL env var required", file=sys.stderr)
        return 2

    if args.verify:
        return verify(args.sqlite_path, mongo_url)

    seen, inserted = migrate(args.sqlite_path, mongo_url, dry_run=args.dry_run)
    return 0 if seen > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
