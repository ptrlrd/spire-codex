"""Hide already-stored wins that finished impossibly fast (under the
minimum win time or faster than the per-floor floor; new uploads are caught
at submit time). Idempotent: hidden runs are skipped on re-runs.

    python -m scripts.rehide_impossible_time [--dry-run]
"""

import os
import sys


def main() -> int:
    if not os.environ.get("MONGO_URL", "").strip():
        print("MONGO_URL unset; nothing to do")
        return 1
    dry_run = "--dry-run" in sys.argv[1:]
    from app.services.runs_db_mongo import rehide_impossible_time_runs

    result = rehide_impossible_time_runs(dry_run=dry_run)
    verb = "would hide" if dry_run else "hid"
    print(
        f"{result['candidates']} candidate doc(s) checked, "
        f"{verb} {result['hidden']} run(s)",
        flush=True,
    )
    for h in result["hashes"]:
        print(f"  {h}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
