SET memory_limit='1500MB';
SET threads=2;
CREATE OR REPLACE TEMP VIEW eligible AS
SELECT r.* FROM read_parquet('/lake/runs.parquet') r
ANTI JOIN read_parquet('/lake/excluded.parquet') x ON r.run_hash = x.run_hash
WHERE r.ascension BETWEEN 0 AND 10
  AND r.character IN ('IRONCLAD','SILENT','DEFECT','NECROBINDER','REGENT','FOOL');

WITH offers AS (
  SELECT f.act, upper(split_part(cc.u.card.id, '.', -1)) AS card,
    coalesce(cc.u.was_picked, false) AS picked
  FROM read_parquet('/lake/floors.parquet') f
  JOIN eligible e ON f.run_hash = e.run_hash,
  LATERAL (SELECT unnest(f.players) AS u) ps,
  LATERAL (SELECT unnest(ps.u.card_choices) AS u) cc
  WHERE cc.u.card.id IS NOT NULL
)
SELECT card,
  count(*) AS offered,
  count(*) FILTER (picked) AS picked,
  round(count(*) FILTER (picked) * 100.0 / count(*), 1) AS pick_rate,
  round(count(*) FILTER (picked AND act = 0) * 100.0
    / greatest(count(*) FILTER (act = 0), 1), 1) AS pick_rate_act1
FROM offers GROUP BY 1 HAVING count(*) >= 200
ORDER BY pick_rate DESC LIMIT 25;
