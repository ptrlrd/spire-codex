-- Lake-side community-stats deaths, replicating the walk's filters for the
-- "all" bracket: hidden/deleted out (excluded sidecar), A0-A10 only,
-- official characters only, losses only, NONE sentinels dropped. Catalog
-- (modded-id) filtering happens in shadow_diff.py by comparing against the
-- live payload's ids.
--   docker compose -f docker-compose.lab.yml run --rm duckdb /lake/build.duckdb -c ".read /lake/lab/shadow_deaths.sql"
SET memory_limit='1500MB';
SET threads=2;

CREATE OR REPLACE TEMP VIEW eligible AS
SELECT killed_by_encounter, killed_by_event
FROM read_parquet('/lake/runs.parquet') r
ANTI JOIN read_parquet('/lake/excluded.parquet') x ON r.run_hash = x.run_hash
WHERE NOT r.win
  AND r.ascension BETWEEN 0 AND 10
  AND r.character IN ('IRONCLAD','SILENT','DEFECT','NECROBINDER','REGENT','FOOL');

COPY (
SELECT killed_by_encounter AS id, count(*) AS count
FROM eligible
WHERE killed_by_encounter IS NOT NULL AND killed_by_encounter NOT LIKE 'NONE%'
GROUP BY 1 ORDER BY 2 DESC
) TO '/lake/shadow_deaths_encounters.json' (FORMAT json, ARRAY true);

COPY (
SELECT killed_by_event AS id, count(*) AS count
FROM eligible
WHERE killed_by_event IS NOT NULL AND killed_by_event NOT LIKE 'NONE%'
GROUP BY 1 ORDER BY 2 DESC
) TO '/lake/shadow_deaths_events.json' (FORMAT json, ARRAY true);

SELECT 'encounter ids' AS t, count(*) AS n FROM read_json('/lake/shadow_deaths_encounters.json')
UNION ALL SELECT 'event ids', count(*) FROM read_json('/lake/shadow_deaths_events.json');

COPY (
SELECT (SELECT count(*) FROM read_parquet('/lake/runs.parquet')) AS lake_runs,
       (SELECT count(*) FROM eligible) AS eligible_losses
) TO '/lake/shadow_meta.json' (FORMAT json, ARRAY true);
