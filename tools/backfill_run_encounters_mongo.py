"""Backfill `map_point_history` onto existing Mongo run docs.

The runs_db_mongo schema used to store only denormalized fields (deck,
relics, killed_by, card_choices, etc.). The encounter-stats aggregation
at /api/runs/encounter-stats walks `map_point_history` per run to
compute per-encounter sample counts, fatal counts, average damage taken,
and average turns. Without that field on the doc, the aggregation
returns zero rows.

The raw run JSON is preserved on disk at `data/runs/<hash>.json` (the
share-run page already reads from there). This script walks those files,
parses each, and `$set`s `map_point_history` on the corresponding Mongo
doc when the field is missing.

Idempotent: docs that already have a non-empty `map_point_history` are
skipped. Safe to re-run after a partial pass or to catch up on submissions
made between deploy and full backfill.

Usage on the prod box:

  cd /var/www/spire-codex
  docker compose -f docker-compose.prod.yml exec backend \
    python3 -m tools.backfill_run_encounters_mongo

Add `--dry-run` to see what would change without writing. `--limit N`
caps the number of docs processed (useful for spot-checking on a slice).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

# Allow running as a module from anywhere under /var/www/spire-codex.
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.services.runs_db_mongo import _get_collection  # noqa: E402


def _runs_dir() -> Path:
    """Locate the on-disk runs/ dir. Mirrors the env-var conventions used
    by the backend (`DATA_DIR` set to /data in prod, defaults under the
    project tree for local dev)."""
    candidates = [
        Path(os.environ.get("DATA_DIR", "")) / "runs",
        ROOT / "data" / "runs",
        Path("/data/runs"),
    ]
    for c in candidates:
        if c.is_dir():
            return c
    raise SystemExit(f"runs/ dir not found in any of: {[str(c) for c in candidates]}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--dry-run", action="store_true", help="print actions, write nothing"
    )
    p.add_argument(
        "--limit", type=int, default=0, help="cap docs processed (0 = no cap)"
    )
    args = p.parse_args()

    coll = _get_collection()
    runs_dir = _runs_dir()
    print(f"reading runs from: {runs_dir}", flush=True)

    # Pull the set of run hashes that need backfill in one round trip,
    # rather than checking every disk file against Mongo individually.
    needs_backfill: set[str] = set(
        d["_id"]
        for d in coll.find(
            {
                "$or": [
                    {"map_point_history": {"$exists": False}},
                    {"map_point_history": []},
                ]
            },
            {"_id": 1},
        )
    )
    total_to_check = len(needs_backfill)
    print(f"docs needing backfill: {total_to_check}", flush=True)

    seen = 0
    updated = 0
    skipped_no_file = 0
    skipped_no_history = 0
    started = time.time()

    for hash_id in list(needs_backfill):
        if args.limit and updated >= args.limit:
            break
        seen += 1
        run_file = runs_dir / f"{hash_id}.json"
        if not run_file.exists():
            skipped_no_file += 1
            continue
        try:
            with open(run_file, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            print(f"  ✗ {hash_id[:12]}: {e}", flush=True)
            continue

        history = data.get("map_point_history")
        if not history:
            skipped_no_history += 1
            continue

        if args.dry_run:
            updated += 1
            if updated <= 5:
                act_count = len(history)
                room_count = sum(len(a) for a in history if isinstance(a, list))
                print(
                    f"  would set {hash_id[:12]}: {act_count} acts, {room_count} rooms",
                    flush=True,
                )
            continue

        coll.update_one({"_id": hash_id}, {"$set": {"map_point_history": history}})
        updated += 1
        if updated % 500 == 0:
            elapsed = time.time() - started
            print(
                f"  ... {updated:>5d}/{total_to_check} written in {elapsed:.1f}s",
                flush=True,
            )

    elapsed = time.time() - started
    print()
    print(f"checked   : {seen}")
    print(f"updated   : {updated}")
    print(f"no file   : {skipped_no_file}")
    print(f"no history: {skipped_no_history}")
    print(f"elapsed   : {elapsed:.1f}s")
    if args.dry_run:
        print("(dry-run — nothing written)")


if __name__ == "__main__":
    main()
