# On-box analytics lab (DuckDB 1.5.5)

Tooling to build a Parquet lake from prod Mongo, on the box itself, and the
ingest cycle that turns it into what the site serves. `lab/` is on `main`;
nothing to check out separately. The backend reads the lake read-only through
`backend/app/services/lake_stats.py`: the community payload and cube, the
entity store and cube, encounter stats, deep item tables, charts, the
leaderboard boards and the frame all serve from the stored artifacts, so a
completed cycle is what changes the live numbers. The `extract` and `duckdb`
helper containers in `docker-compose.lab.yml` are still side tools (the
`duckdb` one is the official `duckdb/duckdb` image pinned to 1.5.5). Output
lands in `./lake/` (gitignored, local to the box).

## The ingest cycle

`ingest.py` is the nightly job: incremental extract, rebuild the parquet lake,
then run every stage in order and publish. On the box:

```
docker compose -f docker-compose.prod.yml run --rm lake-ingest
```

(`lake-ingest` is the `ops` profile service in `docker-compose.prod.yml`; its
entrypoint is `python /lab/ingest.py`.)

Stages, from `run_stage.py`:

| Stage | What it builds |
|---|---|
| `payload` | The community-stats payload and cube (`lake_stats.build_and_store_payload`) |
| `entity_store` | Per-entity run stats store (`build_entity_store`) |
| `encounter_store` | Encounter stats store (`build_encounter_store`) |
| `entity_cube` | The entity cube the `/stats` metrics tables fold per bracket (`build_entity_cube`) |
| `deep_tables` | Per-combo deep item tables for the materialized stats docs (`build_deep_tables`) |
| `charts_blob` | The charts blob (`charts_blob_lake.build_charts_blob`) |
| `stats_core` | Refreshes the Mongo `stats_summary` docs from the lake (`refresh_stats_core`) |
| `leaderboard_summary` | Leaderboard boards (`runs_db_mongo.refresh_leaderboard_summary`) |
| `frame` | The charts frame as parquet (`charts_stats.store_frame_parquet`) |
| `history` | Daily Codex Score + Elo history per entity (`archive_entity_metric_history_from_lake`) |
| `profiles` | Profile insights for every linked account (`precompute_insights.py`) |
| `replay_guard` | Save-reload detection over replays (`replay_guard.py`) |
| `player_elo` | Nightly player Elo board (`player_elo_board.py`) |
| `player_stats` | Per-player stats tables for the profile (`player_stats.py`) |

Run one stage on its own with the same lock the cycle holds:

```
docker compose -f docker-compose.prod.yml run -d --rm --entrypoint python lake-ingest /lab/run_stage.py entity_store
```

## File index

- `extract.py`: every run from Mongo into gzipped JSONL pages in `/lake/staging`
- `build_lake.py`, `build.sql`, `build_page.sql`, `floor_tables.sql`: staging pages into the parquet lake, parsing only what changed
- `ingest.py`, `run_stage.py`: the nightly cycle and the single-stage runner
- `publish_lake.py`, `pull_lake.py`: upload the serve artifacts to R2 after a cycle; pull the newest generation into `/lake` on the serving box
- `edge_purge.py`: Cloudflare purge for the analytics endpoints after a cycle
- `export_dump.py`: the daily full-corpus run export
- `precompute_insights.py`, `player_elo_board.py`, `player_stats.py`, `replay_guard.py`: the stages of the same name
- `seed_profiles.py`: nightly seed profiles, everything the community's runs have shown for a seed (`seed_predict.py` is its companion, no docstring yet)
- `replays_explode.py`: stored replays into parquet for DuckDB
- `parity_elo.py`, `validate_deep_tables.py`, `validate_fossil_parity.py`, `validate_frame_lake.py`, `validate_payload_rewrite.py`, `shadow_diff.py`, `shadow_community.sql`, `shadow_deaths.sql`: parity and shadow-diff gates against the old Mongo paths
- `queries/`: the SQL behind the lake stages (`card_rewards`, `charts_blob`, `charts_frame`, `elo_pairs`, `tierlist_cards`, `winrate_brackets`)

## 1. Extract (wait for any full walk to finish first - it reads the same blobs)

```
docker compose -f docker-compose.lab.yml run --rm extract
```

Streams every run (Mongo blobs first, file fallback) into
`lake/staging/*.jsonl.gz` pages of 50k, each line tagged with `_meta`
(username, hidden, deleted, submitted_at, played_at, player_count) - fields
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
docker compose -f docker-compose.lab.yml run --rm -e LAKE_BUILD_MEMORY=1000MB --entrypoint python extract /lab/build_lake.py
```

Produces `lake/runs.parquet`, `excluded.parquet`, `floor_events.parquet`,
`deck.parquet` and the rest, and prints row counts. Each staging page is
parsed once by `build_page.sql` and `floor_tables.sql` into
`lake/parts/<page>/` and kept, so a rerun only parses pages that are new or
changed; `build.sql` then reassembles the single-file tables from the
parts. Editing either SQL file reparses every page on the next run.
`lake/build.duckdb` and `lake/tmp/` are scratch; `lake/parts/` is what
makes the next build fast, so keep it (delete it to force a full parse).

The build also emits the decision-level tables the metrics pages use:

- `relic_choices.parquet` - one row per relic reward screen with
  `n_options`, `n_picked`, and `is_shop` (shop screens are excluded from
  free-choice Elo/pick rate).
- `shop_items.parquet` - shop shelf offers with the acquisition floor.
- `potion_events.parquet` - per-floor potion use events (feeds potion
  use_rate).
- `relics_removed.parquet` - per-floor relic removal events (Relic Trader
  trades, Sword of Stone transforms, replaced starters, event removals).
- `card_choices.parquet`, `rest_choices.parquet`, `upgrades.parquet` and
  `event_choices.parquet` - flat per-seat rows cut from `floors.parquet` by
  `floor_tables.sql` (card screens, rest sites with the HP the seat walked
  in with, smith upgrades, event options), so the store stages never
  unnest the nested `players` column.
- `relics.parquet` gains an `is_wax` flag so wax-block copies can be
  counted separately from Toy Box duplicates, plus `removed` /
  `floor_removed`: one row per relic a seat EVER held - the end-of-run belt
  (removed=false) plus removals never re-acquired (removed=true, with the
  pickup floor filled in from picked relic_choices rows when known).

`lake_stats` session tables (`run_depth`, `floor_curve`, `act_offsets`,
`relic_choice_rows`) and the entity cube sections (`wax`, `potion_used`,
`relic_removed`, `offers` per type, `offers_by_character`, `shops`,
`events`, `rest`) are loaded from these parquet files by the lake_stats
stage.

## Running a single stage

Every stage in `docker-compose.prod.yml` can run on its own with the
`lake-ingest` entrypoint, e.g.:

```
docker compose -f docker-compose.prod.yml run --rm --entrypoint python lake-ingest /lab/export_dump.py --force
```

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
(`.quit` to exit). Queries read the parquet files directly - no database
file argument needed. Always anti-join `excluded.parquet` (with an explicit ON -- DuckDB
rejects ANTI JOIN with USING) so hidden/deleted runs stay out, same as
the site.

## Refresh

Re-run steps 1-2. The extract appends only new runs as a new page, and
the build parses only that page before reassembling the tables.

## Shadow-diff: lake vs the live site

The migration gate: prove the lake reproduces the live community-stats
deaths numbers before anything serves from it. Run an incremental extract
first so the lake is minutes behind the live snapshot, then:

```
docker compose -f docker-compose.lab.yml run --rm extract
docker compose -f docker-compose.lab.yml run --rm --entrypoint python extract /lab/build_lake.py
docker compose -f docker-compose.lab.yml run --rm duckdb /lake/build.duckdb -c ".read /lake/lab/shadow_deaths.sql"
docker compose -f docker-compose.lab.yml run --rm shadow
```

`shadow_deaths.sql` replicates the walk's filters (hidden/deleted out via
the sidecar, A0-A10 only, official characters only, losses only, NONE
sentinels dropped); `shadow` fetches the live payload (backend-direct, so
no edge cache) and prints a per-id drift table for both top-15 lists. The
verdict passes under 1% worst drift - the residual is fold lag between the
extract and the live snapshot's incremental updates.

## Daily run export

`export_dump.py` builds `lake/runs_export.jsonl.gz` (every exportable run as one
line: the raw blob plus `run_hash` and `player_token`) from the staging pages, at
most once per 20 hours, and writes `runs_export.json` beside it. Both ship with
the serve artifacts, and nginx serves the file at `/exports/runs-latest.jsonl.gz`.
The same pass writes one file per release-looking build id into
`lake/exports_by_version/` (`runs_<build_id>.jsonl.gz`, ids like `v0.111.0`
or `v0.111.0-rc.1` only), lists them in the manifest's `versions` map, and
nginx serves them at `/exports/runs-<version>.jsonl.gz`.
The bare `GET /api/exports/runs` redirects there; `--force` rebuilds now:

```
docker compose -f docker-compose.prod.yml run --rm --entrypoint python lake-ingest /lab/export_dump.py --force
```

## Replay guard (save reloads)

`replay_guard.py` reads the committed `replay_rooms` view and flags every
replay whose floor drops below a floor it already passed and then keeps going
(a save copied aside, played on, and copied back). Save-and-quit then Continue
never lowers the floor, so it never trips this. Flagged runs get the admin
`hidden` flag with reason `auto:save_reload`; already-hidden runs are skipped.
It runs in the cycle right after the export (set `REPLAY_GUARD_DRY_RUN=1` to
report only), or by hand:

```
docker compose -f docker-compose.prod.yml run --rm --entrypoint python lake-ingest /lab/replay_guard.py --dry-run
```
## Nightly player Elo board

`player_elo_board.py` rates every linked account the way the admin board and
profiles do (solo A10 standard runs on the official cast) and writes the top
500 named accounts to `lake/player_elo.json`. It runs as the `player_elo`
stage after profiles, ships with the serve files, and the `/top-players`
page serves the top 100 from it via `/api/leaderboards/elo` (min 10 rated
runs by default). Standalone:

    docker compose -f docker-compose.prod.yml run --rm --entrypoint python lake-ingest /lab/player_elo_board.py

