"""Backfill `run_encounters` + `run_encounter_monsters` for runs submitted
before the schema existed.

Walks `data/runs/*.json` (the archived raw run submissions), looks up
each run's `runs` row by hash, and replays `extract_run_encounters()` to
populate the two new analytics tables. Idempotent: skips any run that
already has rows in `run_encounters`.

Designed to run on the prod host. SSH in, then:

    cd /var/www/spire-codex
    docker exec -it spire-codex-backend python3 -m tools.backfill_run_encounters

Or locally:

    DATA_DIR=$(pwd)/data python3 tools/backfill_run_encounters.py

Reports rows inserted and dry-run optionable via --dry-run.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Make `backend.app.*` importable regardless of cwd.
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backend"))

from app.services.runs_db import (  # noqa: E402
    extract_run_encounters,
    _insert_run_encounters,
    get_conn,
)


def _data_dir() -> Path:
    return Path(os.environ.get("DATA_DIR", HERE.parent / "data"))


def _runs_dir() -> Path:
    return _data_dir() / "runs"


def _runs_already_backfilled(conn) -> set[int]:
    """Return run_ids that already have at least one encounter row."""
    rows = conn.execute("SELECT DISTINCT run_id FROM run_encounters").fetchall()
    return {r["run_id"] for r in rows}


def _player_id_for_hash(conn, run_hash: str) -> tuple[int, int] | None:
    """Resolve (run_id, player_idx) for one hash.

    Multiplayer runs produce multiple `runs` rows sharing a base seed but
    distinct hashes; the hash is deterministic on the player index. We
    look up the row, then derive player_id from the archived JSON's
    player list (player_id matches the `id` field on the player block,
    not the row index).
    """
    row = conn.execute(
        "SELECT id, character FROM runs WHERE run_hash = ?", (run_hash,)
    ).fetchone()
    if not row:
        return None
    return (row["id"], 0)  # player_id resolved below


def backfill(dry_run: bool = False) -> dict:
    runs_dir = _runs_dir()
    if not runs_dir.exists():
        print(f"runs directory missing: {runs_dir}", file=sys.stderr)
        return {"runs_processed": 0, "encounters_inserted": 0, "skipped": 0}

    runs_processed = 0
    encounters_inserted = 0
    skipped = 0
    no_match = 0

    with get_conn() as conn:
        already = _runs_already_backfilled(conn)

        for json_path in sorted(runs_dir.glob("*.json")):
            run_hash = json_path.stem
            row = conn.execute(
                "SELECT id, character, win, was_abandoned FROM runs WHERE run_hash = ?",
                (run_hash,),
            ).fetchone()
            if not row:
                no_match += 1
                continue
            run_id = row["id"]
            if run_id in already:
                skipped += 1
                continue

            try:
                data = json.loads(json_path.read_text(encoding="utf-8"))
            except Exception as exc:
                print(f"!! {run_hash}: bad JSON ({exc})", file=sys.stderr)
                continue

            # Find which player in the JSON corresponds to this hash's row.
            # The hash baked in `player_idx`; the easiest re-derivation is
            # to match by character — single-character collisions across
            # players in the same run are vanishingly rare (different
            # characters per player is the multiplayer convention).
            char = row["character"]
            target_player = None
            for p in data.get("players", []):
                p_char = (p.get("character", "") or "").replace("CHARACTER.", "")
                if p_char == char:
                    target_player = p
                    break
            if not target_player:
                print(
                    f"!! {run_hash}: no player matched character {char}",
                    file=sys.stderr,
                )
                continue
            player_id = target_player.get("id", 1)

            encounters = extract_run_encounters(
                data,
                player_id=player_id,
                is_win=bool(data.get("win", False)),
                is_abandoned=bool(row["was_abandoned"]),
            )
            if not encounters:
                runs_processed += 1
                continue

            if not dry_run:
                _insert_run_encounters(conn, run_id, encounters)
            runs_processed += 1
            encounters_inserted += len(encounters)

        if dry_run:
            conn.rollback()

    return {
        "runs_processed": runs_processed,
        "encounters_inserted": encounters_inserted,
        "skipped_already_backfilled": skipped,
        "skipped_no_db_row": no_match,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse + report without writing rows.",
    )
    args = parser.parse_args()

    result = backfill(dry_run=args.dry_run)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
