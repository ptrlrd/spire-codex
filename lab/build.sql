-- The tables rebuilt in full every cycle: the extractor's fresh sidecars
-- and the per-user rollups over the reassembled runs. build_lake.py has
-- already reassembled the per-run tables into __NEXT__; everything here
-- writes there too, and nothing moves into the lake until all of it
-- succeeded.

-- Sidecar from the extractor's fresh scan, NOT the per-page _meta: hidden
-- and deleted flags mutate after a run's page is written.
COPY (
SELECT run_hash FROM read_ndjson('__LAKE__/excluded_current.jsonl.gz',
  columns={run_hash: 'VARCHAR'})
) TO '__NEXT__/excluded.parquet' (FORMAT parquet, COMPRESSION zstd);

-- Same fresh-scan sidecar pattern: the frame's doc-scalar columns plus the
-- mutable username/hidden, so frame.parquet builds from the lake.
COPY (
SELECT run_hash, floors_reached, deck_size, relic_count, acts_completed,
  username, hidden, character, build_id
FROM read_ndjson('__LAKE__/run_scalars_current.jsonl.gz',
  columns={run_hash: 'VARCHAR', floors_reached: 'INTEGER',
           deck_size: 'INTEGER', relic_count: 'INTEGER',
           acts_completed: 'INTEGER', username: 'VARCHAR', hidden: 'BOOLEAN',
           character: 'VARCHAR', build_id: 'VARCHAR'})
) TO '__NEXT__/run_scalars.parquet' (FORMAT parquet, COMPRESSION zstd);

-- Per-user rollups: profile pages become point reads instead of
-- per-request blob walks. Grouped once per ingest; keyed by user_id.
COPY (
SELECT user_id, character, coalesce(ascension, 0) AS ascension,
  count(*) AS runs, count(*) FILTER (win) AS wins,
  count(*) FILTER (was_abandoned) AS abandoned,
  max(submitted_at) AS last_submitted_at,
  min(run_time) FILTER (win AND game_mode = 'standard' AND NOT has_modifiers AND run_time > 0) AS fastest_win
FROM read_parquet('__NEXT__/runs.parquet')
WHERE user_id IS NOT NULL
GROUP BY 1, 2, 3
) TO '__NEXT__/user_rollup.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (
SELECT user_id, killed_by_encounter AS encounter, count(*) AS deaths
FROM read_parquet('__NEXT__/runs.parquet')
WHERE user_id IS NOT NULL AND NOT win
  AND killed_by_encounter IS NOT NULL AND killed_by_encounter NOT LIKE 'NONE%'
GROUP BY 1, 2
) TO '__NEXT__/user_deaths.parquet' (FORMAT parquet, COMPRESSION zstd);

SELECT 'runs' AS t, count(*) AS n FROM read_parquet('__NEXT__/runs.parquet')
UNION ALL SELECT 'excluded', count(*) FROM read_parquet('__NEXT__/excluded.parquet')
UNION ALL SELECT 'floor_events', count(*) FROM read_parquet('__NEXT__/floor_events.parquet')
UNION ALL SELECT 'deck', count(*) FROM read_parquet('__NEXT__/deck.parquet')
UNION ALL SELECT 'floors', count(*) FROM read_parquet('__NEXT__/floors.parquet')
UNION ALL SELECT 'players', count(*) FROM read_parquet('__NEXT__/players.parquet')
UNION ALL SELECT 'relics', count(*) FROM read_parquet('__NEXT__/relics.parquet')
UNION ALL SELECT 'potions', count(*) FROM read_parquet('__NEXT__/potions.parquet')
UNION ALL SELECT 'relics_removed', count(*) FROM read_parquet('__NEXT__/relics_removed.parquet')
UNION ALL SELECT 'shop_potions', count(*) FROM read_parquet('__NEXT__/shop_potions.parquet')
UNION ALL SELECT 'relic_choices', count(*) FROM read_parquet('__NEXT__/relic_choices.parquet')
UNION ALL SELECT 'shop_items', count(*) FROM read_parquet('__NEXT__/shop_items.parquet')
UNION ALL SELECT 'potion_events', count(*) FROM read_parquet('__NEXT__/potion_events.parquet');
