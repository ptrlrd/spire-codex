SET memory_limit='1500MB';
SET threads=2;
CREATE OR REPLACE TEMP VIEW eligible AS
SELECT r.* FROM read_parquet('/lake/runs.parquet') r
ANTI JOIN read_parquet('/lake/excluded.parquet') x ON r.run_hash = x.run_hash
WHERE r.ascension BETWEEN 0 AND 10
  AND r.character IN ('IRONCLAD','SILENT','DEFECT','NECROBINDER','REGENT','FOOL');

-- Per-user winrate exactly like the walk: every run counted, abandons are
-- losses, 5-run floor. (Same username-stamped-per-doc caveat as the walk.)
CREATE OR REPLACE TEMP VIEW user_wr AS
SELECT lower(username) AS uname,
  count(*) AS runs, count(*) FILTER (win) AS wins,
  count(*) FILTER (win) * 1.0 / count(*) AS wr
FROM read_parquet('/lake/runs.parquet')
WHERE username IS NOT NULL AND username <> ''
GROUP BY 1 HAVING count(*) >= 5;

SELECT count(*) AS qualified_users,
  count(*) FILTER (wr > 0.30) AS wr30,
  count(*) FILTER (wr > 0.50) AS wr50,
  count(*) FILTER (wr > 0.75) AS wr75
FROM user_wr;

-- wr50 tier-list slice: A10 runs by >50% winrate players, like the snapshot
-- bracket, but one WHERE clause instead of 980 accumulators.
SELECT d.card, count(*) AS picks,
  round(count(*) FILTER (e.win) * 100.0 / count(*), 1) AS win_rate
FROM read_parquet('/lake/deck.parquet') d
JOIN eligible e ON d.run_hash = e.run_hash
JOIN user_wr u ON lower(e.username) = u.uname AND u.wr > 0.50
WHERE e.ascension = 10
GROUP BY 1 HAVING count(*) >= 25 ORDER BY win_rate DESC LIMIT 15;
