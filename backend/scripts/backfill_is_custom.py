"""Stamp is_custom on stored custom runs: the v0.113.0+ saves that keep their
real game_mode and say is_custom_game (read from run_blobs, walked in _id
batches), and the older game_mode "custom" runs. Idempotent and safe to
re-run if interrupted.

    python -m scripts.backfill_is_custom
"""

import os


def main() -> int:
    if not os.environ.get("MONGO_URL", "").strip():
        print("MONGO_URL unset; nothing to do")
        return 1
    from app.services.runs_db_mongo import backfill_is_custom

    stamped = backfill_is_custom()
    print(f"stamped is_custom on {stamped} run doc(s)", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
