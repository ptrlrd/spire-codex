-- Reassemble the single-file lake tables from the per-page outputs that
-- build_lake.py keeps under /lake/parts (one directory per staging page),
-- then rebuild the small sidecar and per-user tables. Every reader keeps
-- reading /lake/<table>.parquet; only the parse moved per page.

COPY (SELECT * FROM read_parquet('/lake/parts/*/runs.parquet'))
  TO '/lake/runs.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (SELECT * FROM read_parquet('/lake/parts/*/floor_events.parquet'))
  TO '/lake/floor_events.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (SELECT * FROM read_parquet('/lake/parts/*/deck.parquet'))
  TO '/lake/deck.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (SELECT * FROM read_parquet('/lake/parts/*/floors.parquet'))
  TO '/lake/floors.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (SELECT * FROM read_parquet('/lake/parts/*/players.parquet'))
  TO '/lake/players.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (SELECT * FROM read_parquet('/lake/parts/*/relic_choices.parquet'))
  TO '/lake/relic_choices.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (SELECT * FROM read_parquet('/lake/parts/*/potions.parquet'))
  TO '/lake/potions.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (SELECT * FROM read_parquet('/lake/parts/*/shop_potions.parquet'))
  TO '/lake/shop_potions.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (SELECT * FROM read_parquet('/lake/parts/*/relics_removed.parquet'))
  TO '/lake/relics_removed.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (SELECT * FROM read_parquet('/lake/parts/*/relics.parquet'))
  TO '/lake/relics.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (SELECT * FROM read_parquet('/lake/parts/*/shop_items.parquet'))
  TO '/lake/shop_items.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (SELECT * FROM read_parquet('/lake/parts/*/potion_events.parquet'))
  TO '/lake/potion_events.parquet' (FORMAT parquet, COMPRESSION zstd);

-- Sidecar from the extractor's fresh scan, NOT the per-page _meta: hidden
-- and deleted flags mutate after a run's page is written.
COPY (
SELECT run_hash FROM read_ndjson('/lake/excluded_current.jsonl.gz',
  columns={run_hash: 'VARCHAR'})
) TO '/lake/excluded.parquet' (FORMAT parquet, COMPRESSION zstd);

-- Same fresh-scan sidecar pattern: the frame's doc-scalar columns plus the
-- mutable username/hidden, so frame.parquet builds from the lake.
COPY (
SELECT run_hash, floors_reached, deck_size, relic_count, acts_completed,
  username, hidden, character, build_id
FROM read_ndjson('/lake/run_scalars_current.jsonl.gz',
  columns={run_hash: 'VARCHAR', floors_reached: 'INTEGER',
           deck_size: 'INTEGER', relic_count: 'INTEGER',
           acts_completed: 'INTEGER', username: 'VARCHAR', hidden: 'BOOLEAN',
           character: 'VARCHAR', build_id: 'VARCHAR'})
) TO '/lake/run_scalars.parquet' (FORMAT parquet, COMPRESSION zstd);

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
UNION ALL SELECT 'potions', count(*) FROM read_parquet('/lake/potions.parquet')
UNION ALL SELECT 'relics_removed', count(*) FROM read_parquet('/lake/relics_removed.parquet')
UNION ALL SELECT 'shop_potions', count(*) FROM read_parquet('/lake/shop_potions.parquet')
UNION ALL SELECT 'relic_choices', count(*) FROM read_parquet('/lake/relic_choices.parquet')
UNION ALL SELECT 'shop_items', count(*) FROM read_parquet('/lake/shop_items.parquet')
UNION ALL SELECT 'potion_events', count(*) FROM read_parquet('/lake/potion_events.parquet');
