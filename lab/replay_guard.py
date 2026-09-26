"""Replay-only cheat signals the submitted .run can't carry. A save reload
(copy the save aside, play on, copy it back) leaves the .run clean, but the
journal keeps recording through the reload: the floor number goes backwards
and the same rooms get walked twice under one start time. A save-and-quit
then Continue never lowers the floor, so it never trips this.

    python /lab/replay_guard.py --dry-run     # report only
    python /lab/replay_guard.py               # hide with reason auto:save_reload
"""

import os
import pathlib
import sys

sys.path.insert(0, "/lab")
sys.path.insert(0, "/app")

LAKE = pathlib.Path(os.environ.get("LAKE_DIR", "/lake"))
REASON = "auto:save_reload"

DETECT_SQL = """
WITH ordered AS (
    SELECT run_hash, s, floor,
           MAX(floor) OVER (PARTITION BY run_hash ORDER BY s
                            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS seen,
           COUNT(*) OVER (PARTITION BY run_hash ORDER BY s
                          ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING) AS after
    FROM replay_rooms
    WHERE floor IS NOT NULL AND floor > 0
)
SELECT run_hash,
       MIN(seen) FILTER (WHERE floor < seen) AS from_floor,
       MIN(floor) FILTER (WHERE floor < seen) AS to_floor,
       COUNT(*) FILTER (WHERE floor < seen) AS drops
FROM ordered
WHERE floor < seen AND after >= 1
GROUP BY run_hash
ORDER BY run_hash
"""


def detect_save_reloads(con) -> list[dict]:
    """Every replay whose room floor drops below a floor it already passed
    and then keeps going. Rows come from the committed replay_rooms view."""
    rows = con.execute(DETECT_SQL).fetchall()
    return [
        {
            "run_hash": r[0],
            "from_floor": int(r[1]),
            "to_floor": int(r[2]),
            "drops": int(r[3]),
        }
        for r in rows
    ]


def already_hidden(coll, hashes: list[str]) -> set[str]:
    if not hashes:
        return set()
    out: set[str] = set()
    for doc in coll.find(
        {
            "hidden": True,
            "$or": [{"_id": {"$in": hashes}}, {"run_hash": {"$in": hashes}}],
        },
        {"run_hash": 1},
    ):
        out.add(doc.get("run_hash") or doc["_id"])
    return out


def apply(findings: list[dict], dry_run: bool, coll=None, hide=None) -> dict:
    """Hide each flagged run (all docs sharing the hash) unless it already
    is. dry_run only reports. `coll` and `hide` are injectable for tests."""
    if coll is None or hide is None:
        from app.services.runs_db_mongo import _get_collection, set_run_hidden

        coll = coll or _get_collection()
        hide = hide or set_run_hidden
    hashes = [f["run_hash"] for f in findings]
    skip = already_hidden(coll, hashes)
    to_hide = [f for f in findings if f["run_hash"] not in skip]
    hidden: list[str] = []
    for f in to_hide:
        print(
            f"{'would hide' if dry_run else 'hiding'} {f['run_hash']}: "
            f"floor {f['from_floor']} -> {f['to_floor']} ({f['drops']} drops)",
            flush=True,
        )
        if not dry_run:
            hide(f["run_hash"], True, reason=REASON)
            hidden.append(f["run_hash"])
    return {
        "flagged": len(findings),
        "already_hidden": len(skip),
        "hidden": len(hidden),
        "hashes": hidden if not dry_run else [f["run_hash"] for f in to_hide],
        "dry_run": dry_run,
    }


def run(dry_run: bool = False) -> dict:
    import duckdb

    import replays_explode

    con = duckdb.connect()
    try:
        replays_explode.attach_views(con, LAKE / "replays")
        findings = detect_save_reloads(con)
    finally:
        con.close()
    return apply(findings, dry_run)


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    out = run(dry_run=dry_run)
    print(
        f"save-reload guard: {out['flagged']} flagged, {out['already_hidden']} already hidden, "
        f"{out['hidden']} hidden{' (dry run)' if dry_run else ''}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
