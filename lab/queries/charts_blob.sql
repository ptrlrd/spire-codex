SET memory_limit='1500MB';
SET threads=2;
CREATE OR REPLACE TEMP VIEW eligible AS
SELECT r.* FROM read_parquet('/lake/runs.parquet') r
ANTI JOIN read_parquet('/lake/excluded.parquet') x ON r.run_hash = x.run_hash
WHERE r.ascension BETWEEN 0 AND 10
  AND r.character IN ('IRONCLAD','SILENT','DEFECT','NECROBINDER','REGENT','FOOL');

-- hp-trajectory: avg % of max HP per floor, wins vs losses (player 1).
SELECT fe.floor_idx AS floor, e.win,
  round(avg(fe.p1_hp * 100.0 / nullif(fe.p1_max_hp, 0)), 1) AS avg_hp_pct,
  count(*) AS n
FROM read_parquet('/lake/floor_events.parquet') fe
JOIN eligible e ON fe.run_hash = e.run_hash
WHERE fe.floor_idx <= 16 AND fe.p1_max_hp > 0
GROUP BY 1, 2 ORDER BY 1, 2 LIMIT 32;

-- gold-curve: avg gold per floor.
SELECT fe.floor_idx AS floor, round(avg(fe.p1_gold), 0) AS avg_gold, count(*) AS n
FROM read_parquet('/lake/floor_events.parquet') fe
JOIN eligible e ON fe.run_hash = e.run_hash
WHERE fe.floor_idx <= 16 GROUP BY 1 ORDER BY 1 LIMIT 16;

-- deck-growth: avg cards added by floor (cumulative), from deck membership.
WITH adds AS (
  SELECT d.run_hash, d.floor_added, count(*) AS added
  FROM read_parquet('/lake/deck.parquet') d
  JOIN eligible e ON d.run_hash = e.run_hash
  WHERE d.floor_added IS NOT NULL AND d.floor_added BETWEEN 0 AND 48
  GROUP BY 1, 2
)
SELECT floor_added AS floor, round(avg(added), 2) AS avg_cards_added, count(*) AS runs
FROM adds GROUP BY 1 ORDER BY 1 LIMIT 16;

-- encounter-damage + turns rankings.
SELECT fe.encounter,
  round(avg(fe.damage_taken), 1) AS avg_damage,
  round(avg(fe.turns), 1) AS avg_turns, count(*) AS fights
FROM read_parquet('/lake/floor_events.parquet') fe
JOIN eligible e ON fe.run_hash = e.run_hash
WHERE fe.encounter IS NOT NULL AND fe.room_type = 'monster'
GROUP BY 1 HAVING count(*) >= 100 ORDER BY avg_damage DESC LIMIT 15;

-- deaths-by-room: the room type each dead run ended in.
WITH last_room AS (
  SELECT fe.run_hash,
    arg_max(fe.room_type, fe.act * 10000 + fe.floor_idx) AS room_type
  FROM read_parquet('/lake/floor_events.parquet') fe
  JOIN eligible e ON fe.run_hash = e.run_hash
  WHERE coalesce(e.killed_by_encounter, '') <> '' OR coalesce(e.killed_by_event, '') <> ''
  GROUP BY 1
)
SELECT room_type, count(*) AS deaths FROM last_room GROUP BY 1 ORDER BY 2 DESC;
