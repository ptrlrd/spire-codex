"""Per-username run and win counts for the win rate filters on the run
list and leaderboards, written to /lake/user_winrates.json each cycle.

    docker compose -f docker-compose.prod.yml run -d --rm --entrypoint python lake-ingest /lab/run_stage.py user_winrates
"""

import json
import os
import pathlib
import sys
import time

sys.path.insert(0, "/app")

LAKE = pathlib.Path(os.environ.get("LAKE_DIR", "/lake"))


def build(con=None) -> dict:
    import duckdb

    from app.services.lake_stats import _unlisted_runs_sql
    from app.services.official_content import official_characters_sql
    from app.services.runs_db_mongo import (
        USER_WINRATES_NAME,
        USER_WINRATES_PREV_NAME,
    )

    t0 = time.time()
    lake = str(LAKE)
    own = con is None
    con = con or duckdb.connect()
    try:
        rows = con.execute(
            f"""SELECT lower(r.username), count(*),
              count(*) FILTER (coalesce(r.win, false))
            FROM read_parquet('{lake}/runs.parquet') r
            ANTI JOIN {_unlisted_runs_sql(lake)} x ON r.run_hash = x.run_hash
            WHERE r.username IS NOT NULL AND r.username <> ''
              AND r.ascension BETWEEN 0 AND 10
              AND r.character IN {official_characters_sql()}
            GROUP BY 1"""
        ).fetchall()
    finally:
        if own:
            con.close()
    out = {"at": time.time(), "rates": {u: [int(n), int(w)] for u, n, w in rows}}
    path = LAKE / USER_WINRATES_NAME
    tmp = LAKE / f"{USER_WINRATES_NAME}.{os.getpid()}.tmp"
    tmp.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    if path.exists():
        path.replace(LAKE / USER_WINRATES_PREV_NAME)
    tmp.replace(path)
    return {
        "users": len(rows),
        "bytes": path.stat().st_size,
        "seconds": round(time.time() - t0, 1),
    }


if __name__ == "__main__":
    print(f"user winrates: {build()}", flush=True)
