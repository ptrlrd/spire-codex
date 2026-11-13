SET memory_limit='1500MB';
SET threads=2;
CREATE OR REPLACE TEMP VIEW eligible AS
SELECT r.* FROM read_parquet('/lake/runs.parquet') r
ANTI JOIN read_parquet('/lake/excluded.parquet') x ON r.run_hash = x.run_hash
WHERE r.ascension BETWEEN 0 AND 10
  AND r.character IN ('IRONCLAD','SILENT','DEFECT','NECROBINDER','REGENT','FOOL');

-- "all" bracket: per-instance deck membership, like the walk counts picks.
SELECT d.card,
  count(*) AS picks,
  count(*) FILTER (e.win) AS wins,
  round(count(*) FILTER (e.win) * 100.0 / count(*), 1) AS win_rate,
  count(*) FILTER (coalesce(d.upgrade_level, 0) = 0) AS base_copies,
  count(*) FILTER (coalesce(d.upgrade_level, 0) > 0) AS upgraded_copies
FROM read_parquet('/lake/deck.parquet') d
JOIN eligible e ON d.run_hash = e.run_hash
GROUP BY 1 HAVING count(*) >= 50 ORDER BY win_rate DESC LIMIT 25;

-- A10 slice: same thing, one WHERE clause.
SELECT d.card, count(*) AS picks,
  round(count(*) FILTER (e.win) * 100.0 / count(*), 1) AS win_rate
FROM read_parquet('/lake/deck.parquet') d
JOIN eligible e ON d.run_hash = e.run_hash
WHERE e.ascension = 10
GROUP BY 1 HAVING count(*) >= 50 ORDER BY win_rate DESC LIMIT 10;

-- Solo slice.
SELECT d.card, count(*) AS picks,
  round(count(*) FILTER (e.win) * 100.0 / count(*), 1) AS win_rate
FROM read_parquet('/lake/deck.parquet') d
JOIN eligible e ON d.run_hash = e.run_hash
WHERE e.player_count = 1
GROUP BY 1 HAVING count(*) >= 50 ORDER BY win_rate DESC LIMIT 10;
