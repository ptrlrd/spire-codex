"""Give back wins the old 15 minute cutoff auto-hid. The cutoff is 5 minutes
now, so a win between 5 and 15 minutes that was hidden only for its time
comes back, as long as the detector passes it today. Runs hidden by a
moderator, by their owner, or for any other reason are left alone.

Dry run by default: prints the counts and the hashes it would unhide.

    python -m scripts.unhide_old_time_cutoff            # dry run
    python -m scripts.unhide_old_time_cutoff --apply    # unhide them
"""

import os
import sys


def main() -> int:
    if not os.environ.get("MONGO_URL", "").strip():
        print("MONGO_URL unset; nothing to do")
        return 1
    apply = "--apply" in sys.argv[1:]
    from app.services.runs_db_mongo import unhide_relaxed_time_runs

    result = unhide_relaxed_time_runs(apply=apply)
    print(
        f"{result['candidates']} hidden win(s) between 5 and 15 minutes checked\n"
        f"  {result['other_reason']} left hidden: hidden for another reason\n"
        f"  {result['still_flagged']} left hidden: the detector still flags them\n"
        f"  {result['unhidden']} {'unhidden' if apply else 'would be unhidden'}",
        flush=True,
    )
    for h in result["hashes"]:
        print(f"  {h}")
    if not apply:
        print("Dry run. Pass --apply to unhide them.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
