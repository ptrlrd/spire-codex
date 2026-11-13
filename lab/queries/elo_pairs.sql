SET memory_limit='1500MB';
SET threads=2;
CREATE OR REPLACE TEMP VIEW eligible AS
SELECT r.* FROM read_parquet('/lake/runs.parquet') r
ANTI JOIN read_parquet('/lake/excluded.parquet') x ON r.run_hash = x.run_hash
WHERE r.ascension BETWEEN 0 AND 10
  AND r.character IN ('IRONCLAD','SILENT','DEFECT','NECROBINDER','REGENT','FOOL');

-- One row per (winner, loser) per reward screen: the Elo fit's raw input.
WITH screens AS (
  SELECT f.run_hash, f.act, f.floor_idx, ps.i AS player_idx,
    [upper(split_part(c.card.id, '.', -1)) FOR c IN ps.u.card_choices IF coalesce(c.was_picked, false) AND c.card.id IS NOT NULL] AS picked,
    [upper(split_part(c.card.id, '.', -1)) FOR c IN ps.u.card_choices IF NOT coalesce(c.was_picked, false) AND c.card.id IS NOT NULL] AS skipped
  FROM read_parquet('/lake/floors.parquet') f
  JOIN eligible e ON f.run_hash = e.run_hash,
  LATERAL (SELECT unnest(f.players) AS u, generate_subscripts(f.players, 1) AS i) ps
  WHERE len(ps.u.card_choices) > 0
)
SELECT w.u AS winner, l.u AS loser, count(*) AS n
FROM screens, LATERAL (SELECT unnest(picked) AS u) w, LATERAL (SELECT unnest(skipped) AS u) l
GROUP BY 1, 2 ORDER BY n DESC LIMIT 20;
