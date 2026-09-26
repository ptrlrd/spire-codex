# On-box analytics lab (DuckDB 1.5.5)

One-shot tooling to build a Parquet lake from prod Mongo, on the box itself.
Nothing here touches the running services: `extract` is a throwaway container
using the existing backend image, `duckdb` is the official `duckdb/duckdb`
image pinned to 1.5.5. Output lands in `./lake/` (gitignored, local to the box).

## One-time setup (on the box, from the repo root)

```
git fetch origin lab/on-box-lake
git checkout origin/lab/on-box-lake -- lab docker-compose.lab.yml
mkdir -p lake
```

This only copies the lab files into the working tree; the checked-out branch
stays `main` and the deploy script is unaffected.

## 1. Extract (wait for any full walk to finish first — it reads the same blobs)

```
docker compose -f docker-compose.lab.yml run --rm extract
```

Streams every run (Mongo blobs first, file fallback) into
`lake/staging/*.jsonl.gz` pages of 50k, each line tagged with `_meta`
(username, hidden, deleted, submitted_at, played_at, player_count) — fields
the HTTP export doesn't carry. Prints progress per page; capped at 1.5GB RAM.

Incremental: `lake/staging/state.json` records the cursor, so re-running
only appends runs submitted since the last pull (minutes, not hours). Every
run also refreshes `lake/excluded_current.jsonl.gz`, the full current
hidden/deleted id set, since those flags mutate after a run's page is
written. If your staging predates state.json, bootstrap the cursor once:

```
docker compose -f docker-compose.lab.yml run --rm extract --bootstrap
```

## 2. Build the lake

```
docker compose -f docker-compose.lab.yml run --rm duckdb /lake/build.duckdb -c ".read /lake/lab/build.sql"
```

Produces `lake/runs.parquet`, `excluded.parquet`, `floor_events.parquet`,
`deck.parquet` and prints row counts. Capped at 2GB RAM (1.5GB inside
DuckDB). The `/lake/build.duckdb` argument matters: the corpus is far
larger than the memory cap, so the build needs a disk-backed database to
spill into. `lake/build.duckdb` and `lake/tmp/` are scratch — delete them
(and `lake/staging/` if you want the ~4GB back) once the parquet files
exist.

## 3. Query

```
docker compose -f docker-compose.lab.yml run --rm duckdb -c "
SELECT killed_by_encounter, count(*) AS deaths
FROM read_parquet('/lake/runs.parquet') r
ANTI JOIN read_parquet('/lake/excluded.parquet') x ON r.run_hash = x.run_hash
WHERE NOT win AND killed_by_encounter IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC LIMIT 15"
```

Interactive shell: `docker compose -f docker-compose.lab.yml run --rm duckdb`
(`.quit` to exit). Queries read the parquet files directly — no database
file argument needed. Always anti-join `excluded.parquet` (with an explicit ON -- DuckDB
rejects ANTI JOIN with USING) so hidden/deleted runs stay out, same as
the site.

## Refresh

Re-run steps 1-2. The extract is a full re-pull (staging pages are
overwritten); incremental append is a later problem, this is a lab.

## Shadow-diff: lake vs the live site

The migration gate: prove the lake reproduces the live community-stats
deaths numbers before anything serves from it. Run an incremental extract
first so the lake is minutes behind the live snapshot, then:

```
docker compose -f docker-compose.lab.yml run --rm extract
docker compose -f docker-compose.lab.yml run --rm duckdb /lake/build.duckdb -c ".read /lake/lab/build.sql"
docker compose -f docker-compose.lab.yml run --rm duckdb /lake/build.duckdb -c ".read /lake/lab/shadow_deaths.sql"
docker compose -f docker-compose.lab.yml run --rm shadow
```

`shadow_deaths.sql` replicates the walk's filters (hidden/deleted out via
the sidecar, A0-A10 only, official characters only, losses only, NONE
sentinels dropped); `shadow` fetches the live payload (backend-direct, so
no edge cache) and prints a per-id drift table for both top-15 lists. The
verdict passes under 1% worst drift — the residual is fold lag between the
extract and the live snapshot's incremental updates.

## Daily run export

`export_dump.py` builds `lake/runs_export.jsonl.gz` (every exportable run as one
line: the raw blob plus `run_hash` and `player_token`) from the staging pages, at
most once per 20 hours, and writes `runs_export.json` beside it. Both ship with
the serve artifacts, and nginx serves the file at `/exports/runs-latest.jsonl.gz`.
The bare `GET /api/exports/runs` redirects there; `--force` rebuilds now:

```
docker compose -f docker-compose.prod.yml run --rm --entrypoint python lake-ingest /lab/export_dump.py --force
```

## Nightly player Elo board

`player_elo_board.py` rates every linked account the way the admin board and
profiles do (solo A10 standard runs on the official cast) and writes the top
500 named accounts to `lake/player_elo.json`. It runs as the `player_elo`
stage after profiles, ships with the serve files, and `/api/leaderboards/elo`
serves the top 100 from it (min 10 rated runs by default). Standalone:

    docker compose -f docker-compose.prod.yml run --rm --entrypoint python lake-ingest /lab/player_elo_board.py

