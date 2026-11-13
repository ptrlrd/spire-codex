SET memory_limit='1500MB';
SET threads=2;
SET TimeZone='America/Los_Angeles';
CREATE OR REPLACE TEMP VIEW eligible AS
SELECT r.* FROM read_parquet('/lake/runs.parquet') r
ANTI JOIN read_parquet('/lake/excluded.parquet') x ON r.run_hash = x.run_hash
WHERE r.ascension BETWEEN 0 AND 10
  AND r.character IN ('IRONCLAD','SILENT','DEFECT','NECROBINDER','REGENT','FOOL');

-- winrate-by-floor: of runs that reached floor f, how many won.
WITH per_run AS (
  SELECT f.run_hash, least(count(*), 48) AS floors, bool_or(e.win) AS win
  FROM read_parquet('/lake/floors.parquet') f
  JOIN eligible e ON f.run_hash = e.run_hash
  GROUP BY 1
)
SELECT fl.f AS floor,
  count(*) AS reached, count(*) FILTER (win) AS wins,
  round(count(*) FILTER (win) * 100.0 / count(*), 1) AS win_rate
FROM per_run, LATERAL (SELECT unnest(generate_series(1, floors)) AS f) fl
GROUP BY 1 ORDER BY 1 LIMIT 48;

-- runs-over-time + winrate-over-time (Pacific run-date buckets).
SELECT date_trunc('day', played_at AT TIME ZONE 'UTC') AS day,
  count(*) AS runs,
  round(count(*) FILTER (win) * 100.0 / count(*), 1) AS win_rate
FROM eligible WHERE played_at IS NOT NULL
GROUP BY 1 ORDER BY 1 DESC LIMIT 14;

-- time-to-win histogram (10-minute buckets, standard wins).
SELECT (run_time // 600) * 10 AS minutes_bucket, count(*) AS wins
FROM eligible WHERE win AND game_mode = 'standard' AND run_time > 0
GROUP BY 1 ORDER BY 1 LIMIT 20;
