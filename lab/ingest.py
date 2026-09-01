"""Nightly lake ingest: incremental extract, then rebuild the parquet lake.

Runs to completion for host cron, using the backend image (pymongo for the extract,
the pinned duckdb for the build). The shadow SQL files run too when
present, so the nightly log carries fresh comparison inputs for free.

    docker compose -f docker-compose.prod.yml run --rm lake-ingest
"""

import json
import pathlib
import sys
import time

sys.path.insert(0, "/lab")
sys.path.insert(0, "/app")

import extract

LAKE = pathlib.Path("/lake")


def _utc(ts: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts))


def _sidecar_digest() -> str:
    """Content hash of the two mutable sidecars, ignoring gzip headers
    (they embed a timestamp, so identical content still differs on bytes)."""
    import gzip
    import hashlib

    h = hashlib.sha256()
    for name in ("excluded_current.jsonl.gz", "run_scalars_current.jsonl.gz"):
        try:
            with gzip.open(LAKE / name, "rb") as f:
                for chunk in iter(lambda: f.read(1 << 20), b""):
                    h.update(chunk)
        except OSError:
            h.update(b"missing")
    return h.hexdigest()


def _no_source_change(rows_added: int, generation_id: str, t0: float) -> bool:
    """True when this cycle can be skipped outright: no new runs and no
    hidden/deleted/username mutations since the last completed cycle. The
    heavy rebuild would reproduce the exact artifacts already serving."""
    state_path = LAKE / "change_state.json"
    digest = _sidecar_digest()
    prev = None
    try:
        prev = json.loads(state_path.read_text()).get("sidecar_digest")
    except Exception:
        pass
    # Recorded every cycle (even ones that run) so the comparison is always
    # against the last extract, not the last skip.
    state_path.write_text(json.dumps({"sidecar_digest": digest}))
    if rows_added or prev != digest:
        return False
    record = {
        "generation_id": generation_id,
        "cycle_started_at": _utc(t0),
        "skipped": "no source change",
        "complete": True,
        "published_at": _utc(time.time()),
    }
    with open(LAKE / "ingest_metrics.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(record, separators=(",", ":")) + "\n")
    return True


def main() -> None:
    # One ingest at a time: an overlapping cron start would race the shared
    # scratch DB and double the box's memory pressure. The lock lives for
    # the process; a crashed run releases it automatically.
    import fcntl

    lock = open(LAKE / "ingest.lock", "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print("another ingest holds /lake/ingest.lock; exiting", flush=True)
        sys.exit(1)

    t0 = time.time()
    generation_id = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime(t0))
    print(f"generation {generation_id} starting", flush=True)

    # Fresh scratch every cycle: a DuckDB file never returns freed pages to
    # the OS, so a persistent scratch keeps last cycle's high-water mark on
    # disk forever. Nothing outside a cycle reads it (pfloors is rebuilt per
    # ingest), and the spill dir can hold orphans from a killed run.
    import shutil

    (LAKE / "build.duckdb").unlink(missing_ok=True)
    (LAKE / "build.duckdb.wal").unlink(missing_ok=True)
    shutil.rmtree(LAKE / "tmp", ignore_errors=True)

    # Extract and the SQL build have no per-stage soft-fail like the store
    # stages below, so a crash here must still leave a metrics record and a
    # nonzero exit for cron to notice.
    try:
        extracted = extract.main() or (0, 0)
        t_extract = time.time()
        if _no_source_change(extracted[0], generation_id, t0):
            print(
                f"generation {generation_id} skipped: no source change since "
                "the last cycle",
                flush=True,
            )
            return

        import duckdb

        con = duckdb.connect("/lake/build.duckdb")
        # build.sql inherits THIS connection's settings (its old hard-coded
        # 1800MB/2-thread block starved the parse into ~300GB of spill).
        import os as _os

        mem = _os.environ.get("LAKE_BUILD_MEMORY", "") or "3500MB"
        con.execute(f"SET memory_limit='{mem}'")
        con.execute("SET threads=5")
        con.execute("SET temp_directory='/lake/tmp'")
        con.execute("SET preserve_insertion_order=false")
        # The shadow SQLs were the migration validation gate; the gate
        # passed, and the payload builder computes the same sections anyway,
        # so the nightly run skips them (halves the tail). Run them by hand
        # from lab/ when a fresh lake-vs-snapshot diff is wanted.
        for name in ("build.sql",):
            path = pathlib.Path("/lab") / name
            if not path.exists():
                print(f"{name}: not present, skipped", flush=True)
                continue
            con.execute(path.read_text())
            print(f"{name}: done", flush=True)
    except Exception as e:
        record = {
            "generation_id": generation_id,
            "cycle_started_at": _utc(t0),
            "failed_stage": "extract/build",
            "error": str(e)[:500],
            "complete": False,
            "published_at": _utc(time.time()),
        }
        with open(LAKE / "ingest_metrics.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(record, separators=(",", ":")) + "\n")
        print(f"generation {generation_id} FAILED in extract/build: {e}", flush=True)
        sys.exit(1)
    t_build = time.time()
    # Per-stage wall clock for the manifest: total_seconds said the store
    # tail was ~6.6h of a 7.1h cycle but couldn't say which stage.
    stage_seconds: dict[str, float] = {}
    ts = time.time()

    def _mark(name: str) -> None:
        nonlocal ts
        stage_seconds[name] = round(time.time() - ts, 1)
        ts = time.time()

    try:
        from app.services import lake_stats

        session = lake_stats.prepare_build_session()
        session.close()
        print("build session prepared (pfloors materialized)", flush=True)
        _mark("prepare_session")
        lake_stats.build_and_store_payload()
        print("community payload stored", flush=True)
        _mark("community_payload")
        lake_stats.build_entity_store()
        print("entity store stored", flush=True)
        _mark("entity_store")
        lake_stats.build_encounter_store()
        print("encounter store stored", flush=True)
        _mark("encounter_store")
        lake_stats.build_entity_cube()
        print("entity cube stored", flush=True)
        _mark("entity_cube")
        n_deep = lake_stats.build_deep_tables()
        print(f"deep tables stored ({n_deep} combos)", flush=True)
        _mark("deep_tables")
        from app.services import charts_blob_lake

        charts_blob_lake.build_charts_blob()
        print("charts blob stored", flush=True)
        _mark("charts_blob")
        from app.services.run_entity_stats import (
            archive_entity_metric_history_from_lake,
        )

        n_hist = archive_entity_metric_history_from_lake()
        print(f"metric history archived ({n_hist} rows)", flush=True)
        _mark("metric_history")
        lake_stats.cleanup_build_session()
    except Exception as e:
        print(f"community payload build failed: {e}", flush=True)
    # The rebuilder is retired, so the materialized summaries that fed the
    # home overview and the leaderboards move here: plain Mongo aggregations
    # plus a Redis warm, no snapshot involved.
    # Core stats (homepage totals / characters / ascensions) come from the
    # lake in seconds; the legacy Mongo aggregation only tops up the deep
    # item tables and is allowed to fail until its own conversion lands.
    ts = time.time()
    try:
        n = lake_stats.refresh_stats_core()
        print(f"stats core refreshed ({n} combos)", flush=True)
    except Exception as e:
        print(f"stats core failed: {e}", flush=True)
    _mark("stats_core")
    try:
        from app.services.runs_db_mongo import refresh_leaderboard_summary

        n = refresh_leaderboard_summary()
        print(f"leaderboard summary refreshed ({n} boards)", flush=True)
        # The legacy deep-tables aggregation (refresh_stats_summary) is
        # REMOVED from the cycle: with a 600s budget it hammered Mongo for
        # up to ~80 minutes per ingest and starved the serving workers
        # (2026-08-27, sitewide slowness). The stats core (#920) keeps the
        # headline numbers fresh; the deep item tables stay as-is until
        # their lake conversion replaces them.
    except Exception as e:
        print(f"legacy summary refresh failed: {e}", flush=True)
    _mark("leaderboard_summary")
    try:
        from app.services.charts_stats import store_frame_parquet

        n = store_frame_parquet()
        print(f"frame parquet stored ({n} rows)", flush=True)
    except Exception as e:
        print(f"frame parquet failed: {e}", flush=True)
    _mark("frame_parquet")
    # Profile insights: re-walk only accounts with runs newer than their
    # stored payload (skip-if-current), so each cycle refreshes just that
    # window's active uploaders — seconds per account with the winrate
    # ranking pinned. This is what keeps every profile cycle-fresh; the
    # in-worker walk is only a best-effort accelerant for the owner's view.
    profiles = None
    try:
        import precompute_insights

        t_profiles = time.time()
        profiles = precompute_insights.refresh_profiles()
        print(
            f"profiles refreshed ({profiles[0]} stored, {profiles[1]} current, "
            f"{profiles[2]} failed) in {time.time() - t_profiles:.0f}s",
            flush=True,
        )
    except Exception as e:
        print(f"profile refresh failed: {e}", flush=True)
    _mark("profiles")
    # A box that publishes to R2 must never purge the edge, even if CF creds
    # leak into its env: purging before the serving box pulls would let the
    # edge re-cache stale origin data for the whole pull gap.
    purge_ok = None
    try:
        import os

        import edge_purge

        if os.environ.get("LAKE_R2_PUBLISH", "").strip().lower() == "on":
            print("edge purge skipped: publisher role; the puller purges", flush=True)
        else:
            purge_ok = edge_purge.purge()
    except Exception as e:
        purge_ok = False
        print(f"edge purge failed: {e}", flush=True)

    # Cycle record. Stages publish independently (each store is its own
    # atomic rename), so the generation manifest is the completeness
    # contract: it only advances when every serving artifact this cycle
    # owns was rebuilt after the cycle started. /health reports it; a
    # cycle that lost a stage leaves the previous manifest in place and
    # shows up in ingest_metrics.jsonl with complete=false.
    published = time.time()
    manifest: dict = {
        "generation_id": generation_id,
        "cycle_started_at": _utc(t0),
        "source_watermark": None,
        "rows_added": extracted[0],
        "rows_skipped": extracted[1],
        "extract_seconds": round(t_extract - t0, 1),
        "build_sql_seconds": round(t_build - t_extract, 1),
        "stores_seconds": round(published - t_build, 1),
        "stage_seconds": stage_seconds,
        "total_seconds": round(published - t0, 1),
        "profiles_refreshed": profiles,
        "purge_ok": purge_ok,
        "published_at": _utc(published),
        "artifacts": {},
    }
    try:
        st = json.loads((LAKE / "staging" / "state.json").read_text())
        manifest["source_watermark"] = st.get("submitted_at")
    except Exception:
        pass
    required = ("community_payload.json", "entity_store.json", "frame.parquet")
    mtimes: dict[str, float] = {}
    for name in required + ("community_cube.json.gz",):
        try:
            s = (LAKE / name).stat()
            manifest["artifacts"][name] = {
                "bytes": s.st_size,
                "modified_at": _utc(s.st_mtime),
            }
            mtimes[name] = s.st_mtime
        except OSError:
            manifest["artifacts"][name] = None
    # Numeric comparison: the ISO strings are second-truncated, so an old
    # artifact written earlier in the cycle's start second could pass.
    manifest["complete"] = all(mtimes.get(n, 0.0) >= t0 for n in required)
    with open(LAKE / "ingest_metrics.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(manifest, separators=(",", ":")) + "\n")
    if manifest["complete"]:
        tmp = LAKE / "generation.json.tmp"
        tmp.write_text(json.dumps(manifest, indent=1))
        tmp.replace(LAKE / "generation.json")
        print(f"generation {generation_id} published", flush=True)
        # A failed publish doesn't void the local cycle; the puller's age
        # warning is the staleness alarm.
        import os

        if os.environ.get("LAKE_R2_PUBLISH", "").strip().lower() == "on":
            try:
                import publish_lake

                publish_lake.publish()
            except Exception as e:
                print(f"lake publish failed: {e}", flush=True)
        print("ingest complete", flush=True)
    else:
        missing = [n for n in required if mtimes.get(n, 0.0) < t0]
        print(
            f"generation {generation_id} INCOMPLETE (stale: {', '.join(missing)}); "
            "manifest not advanced",
            flush=True,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
