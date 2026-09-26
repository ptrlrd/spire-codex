"""Run one ingest stage exclusively.

Takes the same /lake/ingest.lock the full cycle holds, so a standalone
stage run can never race a cron cycle for the scratch database or spill
directory again (the 2026-08-28 collision: a cycle's startup rmtree
deleted a running stage's spill files out from under it).

    docker compose -f docker-compose.prod.yml run -d --rm --entrypoint python lake-ingest /lab/run_stage.py entity_store
"""

import fcntl
import pathlib
import sys
import time

sys.path.insert(0, "/lab")
sys.path.insert(0, "/app")

LAKE = pathlib.Path("/lake")


def _stages():
    from app.services import charts_blob_lake, lake_stats

    def profiles():
        import precompute_insights

        return precompute_insights.refresh_profiles()

    def frame():
        from app.services.charts_stats import store_frame_parquet

        return store_frame_parquet()

    def history():
        from app.services.run_entity_stats import (
            archive_entity_metric_history_from_lake,
        )

        return archive_entity_metric_history_from_lake()

    def leaderboard_summary():
        from app.services.runs_db_mongo import refresh_leaderboard_summary

        return refresh_leaderboard_summary()

    def replay_guard():
        import replay_guard as guard

        return guard.run()

    return {
        "payload": lake_stats.build_and_store_payload,
        "entity_store": lake_stats.build_entity_store,
        "encounter_store": lake_stats.build_encounter_store,
        "entity_cube": lake_stats.build_entity_cube,
        "deep_tables": lake_stats.build_deep_tables,
        "charts_blob": charts_blob_lake.build_charts_blob,
        "stats_core": lake_stats.refresh_stats_core,
        "leaderboard_summary": leaderboard_summary,
        "frame": frame,
        "history": history,
        "profiles": profiles,
        "replay_guard": replay_guard,
    }


def main() -> None:
    stages = _stages()
    name = sys.argv[1] if len(sys.argv) > 1 else ""
    fn = stages.get(name)
    if fn is None:
        print(f"usage: run_stage.py <{'|'.join(sorted(stages))}>")
        sys.exit(2)
    lock = open(LAKE / "ingest.lock", "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print("an ingest cycle holds /lake/ingest.lock; refusing to race it")
        sys.exit(1)
    t0 = time.time()
    print(f"stage {name} starting", flush=True)
    result = fn()
    print(f"stage {name} done in {time.time() - t0:.0f}s: {bool(result)}", flush=True)


if __name__ == "__main__":
    main()
