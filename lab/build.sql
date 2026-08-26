-- Build the analytical lake from /lake/staging/*.jsonl.gz.
-- Fully streaming with explicit per-pass schemas: no sniffing pass, and the
-- reader only parses the declared fields, so memory stays low and bounded
-- (auto-inference held ~30k sample lines and blew both a 2g and 3g cap).
-- Missing fields in old runs become NULL; a line that can't convert is
-- dropped (ignore_errors) -- the final counts surface any aggregate loss.
--   docker compose -f docker-compose.lab.yml run --rm duckdb /lake/build.duckdb -c ".read /lake/lab/build.sql"
SET memory_limit='1800MB';
SET threads=2;
SET temp_directory='/lake/tmp';
SET preserve_insertion_order=false;

COPY (
SELECT run_hash,
  upper(split_part(players[1].character,'.',-1)) AS character,
  win, coalesce(was_abandoned, false) AS was_abandoned,
  ascension, lower(coalesce(game_mode,'standard')) AS game_mode,
  _meta.player_count AS player_count, build_id, seed, start_time, run_time,
  upper(split_part(killed_by_encounter,'.',-1)) AS killed_by_encounter,
  upper(split_part(killed_by_event,'.',-1)) AS killed_by_event,
  _meta.username AS username, _meta.user_id AS user_id,
  _meta.hidden AS hidden, _meta.deleted AS deleted,
  coalesce(len(modifiers), 0) > 0 AS has_modifiers,
  _meta.submitted_at AS submitted_at, _meta.played_at AS played_at
FROM read_ndjson('/lake/staging/*.jsonl.gz',
  maximum_object_size=33554432, ignore_errors=true,
  columns={run_hash: 'VARCHAR',
    players: 'STRUCT("character" VARCHAR)[]',
    win: 'BOOLEAN', was_abandoned: 'BOOLEAN', ascension: 'BIGINT',
    game_mode: 'VARCHAR', build_id: 'VARCHAR', seed: 'VARCHAR',
    start_time: 'BIGINT', run_time: 'BIGINT',
    killed_by_encounter: 'VARCHAR', killed_by_event: 'VARCHAR',
    modifiers: 'VARCHAR[]',
    _meta: 'STRUCT(username VARCHAR, user_id VARCHAR, hidden BOOLEAN, deleted BOOLEAN, submitted_at TIMESTAMP, played_at TIMESTAMP, player_count BIGINT)'})
) TO '/lake/runs.parquet' (FORMAT parquet, COMPRESSION zstd);

-- Sidecar from the extractor's fresh scan, NOT the per-page _meta: hidden
-- and deleted flags mutate after a run's page is written.
COPY (
SELECT run_hash FROM read_ndjson('/lake/excluded_current.jsonl.gz',
  columns={run_hash: 'VARCHAR'})
) TO '/lake/excluded.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (
SELECT r.run_hash, act.i AS act, loc.i AS floor_idx,
  lower(loc.u.map_point_type) AS map_point_type,
  lower(room.u.room_type) AS room_type,
  upper(split_part(room.u.model_id,'.',-1)) AS encounter,
  room.u.turns_taken AS turns,
  (SELECT sum(ps.u.damage_taken) FROM (SELECT unnest(loc.u.player_stats) AS u) ps) AS damage_taken,
  loc.u.player_stats[1].current_hp AS p1_hp,
  loc.u.player_stats[1].max_hp AS p1_max_hp,
  loc.u.player_stats[1].current_gold AS p1_gold
FROM read_ndjson('/lake/staging/*.jsonl.gz',
  maximum_object_size=33554432, ignore_errors=true,
  columns={run_hash: 'VARCHAR',
    map_point_history: 'STRUCT(map_point_type VARCHAR, player_stats STRUCT(current_gold BIGINT, current_hp BIGINT, damage_taken BIGINT, max_hp BIGINT)[], rooms STRUCT(model_id VARCHAR, room_type VARCHAR, turns_taken BIGINT)[])[][]'}) r,
  LATERAL (SELECT unnest(map_point_history) AS u, generate_subscripts(map_point_history,1) AS i) act,
  LATERAL (SELECT unnest(act.u) AS u, generate_subscripts(act.u,1) AS i) loc,
  LATERAL (SELECT unnest(loc.u.rooms) AS u) room
) TO '/lake/floor_events.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (
SELECT r.run_hash, p.i AS player_idx,
  upper(split_part(p.u.character,'.',-1)) AS character,
  upper(split_part(c.u.id,'.',-1)) AS card,
  c.u.floor_added_to_deck AS floor_added,
  c.u.current_upgrade_level AS upgrade_level,
  upper(split_part(c.u.enchantment.id, '.', -1)) AS enchantment
FROM read_ndjson('/lake/staging/*.jsonl.gz',
  maximum_object_size=33554432, ignore_errors=true,
  columns={run_hash: 'VARCHAR',
    players: 'STRUCT("character" VARCHAR, deck STRUCT(floor_added_to_deck BIGINT, id VARCHAR, current_upgrade_level BIGINT, enchantment STRUCT(id VARCHAR))[])[]'}) r,
  LATERAL (SELECT unnest(players) AS u, generate_subscripts(players,1) AS i) p,
  LATERAL (SELECT unnest(p.u.deck) AS u) c
) TO '/lake/deck.parquet' (FORMAT parquet, COMPRESSION zstd);

-- Location-level table (one row per visited map point, players kept as a
-- nested list): floor_events drops roomless locations via its rooms
-- unnest, so survival and map-danger need this shape.
COPY (
SELECT r.run_hash, act.i - 1 AS act, loc.i AS floor_idx,
  lower(loc.u.map_point_type) AS map_point_type,
  loc.u.player_stats AS players,
  [x.model_id FOR x IN loc.u.rooms] AS room_models
FROM read_ndjson('/lake/staging/*.jsonl.gz',
  maximum_object_size=33554432, ignore_errors=true,
  columns={run_hash: 'VARCHAR',
    map_point_history: 'STRUCT(map_point_type VARCHAR, player_stats STRUCT(player_id BIGINT, current_gold BIGINT, current_hp BIGINT, damage_taken BIGINT, max_hp BIGINT, event_choices STRUCT(title STRUCT("key" VARCHAR, "table" VARCHAR))[], rest_site_choices VARCHAR[], upgraded_cards VARCHAR[], ancient_choice STRUCT(TextKey VARCHAR, title STRUCT("key" VARCHAR, "table" VARCHAR), was_chosen BOOLEAN)[], cards_removed JSON[], card_choices STRUCT(was_picked BOOLEAN, card STRUCT(id VARCHAR))[])[], rooms STRUCT(model_id VARCHAR)[])[][]'}) r,
  LATERAL (SELECT unnest(map_point_history) AS u, generate_subscripts(map_point_history,1) AS i) act,
  LATERAL (SELECT unnest(act.u) AS u, generate_subscripts(act.u,1) AS i) loc
) TO '/lake/floors.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (
SELECT r.run_hash, p.i AS player_idx,
  upper(split_part(rel.u.id, '.', -1)) AS relic,
  rel.u.floor_added_to_deck AS floor_added
FROM read_ndjson('/lake/staging/*.jsonl.gz',
  maximum_object_size=33554432, ignore_errors=true,
  columns={run_hash: 'VARCHAR',
    players: 'STRUCT(relics STRUCT(id VARCHAR, floor_added_to_deck BIGINT)[])[]'}) r,
  LATERAL (SELECT unnest(players) AS u, generate_subscripts(players,1) AS i) p,
  LATERAL (SELECT unnest(p.u.relics) AS u) rel
) TO '/lake/relics.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (
SELECT r.run_hash, p.i AS player_idx,
  upper(split_part(pot.u.id, '.', -1)) AS potion
FROM read_ndjson('/lake/staging/*.jsonl.gz',
  maximum_object_size=33554432, ignore_errors=true,
  columns={run_hash: 'VARCHAR',
    players: 'STRUCT(potions STRUCT(id VARCHAR)[])[]'}) r,
  LATERAL (SELECT unnest(players) AS u, generate_subscripts(players,1) AS i) p,
  LATERAL (SELECT unnest(p.u.potions) AS u) pot
) TO '/lake/potions.parquet' (FORMAT parquet, COMPRESSION zstd);

-- Per-player identity + deck size: keys player_id to a character for the
-- co-op attributions, and carries deck size for the records section.
COPY (
SELECT r.run_hash, p.i AS player_idx, p.u.id AS player_id,
  upper(split_part(p.u.character,'.',-1)) AS character,
  coalesce(len(p.u.deck), 0) AS deck_size
FROM read_ndjson('/lake/staging/*.jsonl.gz',
  maximum_object_size=33554432, ignore_errors=true,
  columns={run_hash: 'VARCHAR',
    players: 'STRUCT(id BIGINT, "character" VARCHAR, deck STRUCT(id VARCHAR)[])[]'}) r,
  LATERAL (SELECT unnest(players) AS u, generate_subscripts(players,1) AS i) p
) TO '/lake/players.parquet' (FORMAT parquet, COMPRESSION zstd);

-- Per-user rollups: profile pages become point reads instead of
-- per-request blob walks. Grouped once per ingest; keyed by user_id.
COPY (
SELECT user_id, character, coalesce(ascension, 0) AS ascension,
  count(*) AS runs, count(*) FILTER (win) AS wins,
  count(*) FILTER (was_abandoned) AS abandoned,
  max(submitted_at) AS last_submitted_at,
  min(run_time) FILTER (win AND game_mode = 'standard' AND NOT has_modifiers AND run_time > 0) AS fastest_win
FROM read_parquet('/lake/runs.parquet')
WHERE user_id IS NOT NULL
GROUP BY 1, 2, 3
) TO '/lake/user_rollup.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (
SELECT user_id, killed_by_encounter AS encounter, count(*) AS deaths
FROM read_parquet('/lake/runs.parquet')
WHERE user_id IS NOT NULL AND NOT win
  AND killed_by_encounter IS NOT NULL AND killed_by_encounter NOT LIKE 'NONE%'
GROUP BY 1, 2
) TO '/lake/user_deaths.parquet' (FORMAT parquet, COMPRESSION zstd);

SELECT 'runs' AS t, count(*) AS n FROM read_parquet('/lake/runs.parquet')
UNION ALL SELECT 'excluded', count(*) FROM read_parquet('/lake/excluded.parquet')
UNION ALL SELECT 'floor_events', count(*) FROM read_parquet('/lake/floor_events.parquet')
UNION ALL SELECT 'deck', count(*) FROM read_parquet('/lake/deck.parquet')
UNION ALL SELECT 'floors', count(*) FROM read_parquet('/lake/floors.parquet')
UNION ALL SELECT 'players', count(*) FROM read_parquet('/lake/players.parquet')
UNION ALL SELECT 'relics', count(*) FROM read_parquet('/lake/relics.parquet')
UNION ALL SELECT 'potions', count(*) FROM read_parquet('/lake/potions.parquet');
