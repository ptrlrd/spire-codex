-- Raw aggregates for the community-stats shadow diff, "all" bracket.
-- Eligibility mirrors the walk's row filter: hidden/deleted out, A0-A10,
-- official characters. Finalization (sorting, percentages, gates) happens
-- in shadow_diff.py, replicating community_stats.py exactly.
--   docker compose -f docker-compose.lab.yml run --rm duckdb /lake/build.duckdb -c ".read /lake/lab/shadow_community.sql"
SET memory_limit='1500MB';
SET threads=2;

CREATE OR REPLACE TEMP VIEW eligible AS
SELECT r.*
FROM read_parquet('/lake/runs.parquet') r
ANTI JOIN read_parquet('/lake/excluded.parquet') x ON r.run_hash = x.run_hash
WHERE r.ascension BETWEEN 0 AND 10
  AND r.character IN ('IRONCLAD','SILENT','DEFECT','NECROBINDER','REGENT','FOOL');

COPY (
SELECT lower(character) AS character, coalesce(ascension, 0) AS ascension,
  count(*) AS runs, count(*) FILTER (win) AS wins
FROM eligible GROUP BY 1, 2
) TO '/lake/shadow_char_asc.json' (FORMAT json, ARRAY true);

-- floors_reached histogram (runs with at least one visited location).
COPY (
WITH per_run AS (
  SELECT f.run_hash, count(*) AS floors_reached
  FROM read_parquet('/lake/floors.parquet') f
  JOIN eligible e ON f.run_hash = e.run_hash
  GROUP BY 1
)
SELECT floors_reached, count(*) AS runs, count(*) FILTER (e.win) AS wins
FROM per_run p JOIN eligible e ON p.run_hash = e.run_hash
GROUP BY 1
) TO '/lake/shadow_floors_hist.json' (FORMAT json, ARRAY true);

-- Map danger raw: per (act, node type) player-visits, damage%-of-max-hp sum,
-- and deaths attributed to the run's final visited typed location. The died
-- flag is raw truthiness like the walk's: NONE sentinels count.
COPY (
WITH typed AS (
  SELECT f.* FROM read_parquet('/lake/floors.parquet') f
  JOIN eligible e ON f.run_hash = e.run_hash
  WHERE f.map_point_type IS NOT NULL AND f.map_point_type <> ''
),
visits AS (
  SELECT act, map_point_type,
    count(*) AS visits,
    sum(least(100.0, greatest(0, coalesce(ps.u.damage_taken, 0)) * 100.0 / ps.u.max_hp)) AS dmg_sum
  FROM typed, LATERAL (SELECT unnest(players) AS u) ps
  WHERE coalesce(ps.u.max_hp, 0) > 0
  GROUP BY 1, 2
),
last_floor AS (
  SELECT t.run_hash,
    arg_max(t.act, t.act * 10000 + t.floor_idx) AS act,
    arg_max(t.map_point_type, t.act * 10000 + t.floor_idx) AS map_point_type
  FROM typed t
  JOIN eligible e ON t.run_hash = e.run_hash
  WHERE coalesce(e.killed_by_encounter, '') <> '' OR coalesce(e.killed_by_event, '') <> ''
  GROUP BY 1
),
deaths AS (
  SELECT act, map_point_type, count(*) AS deaths FROM last_floor GROUP BY 1, 2
)
SELECT v.act, v.map_point_type, v.visits, v.dmg_sum, coalesce(d.deaths, 0) AS deaths
FROM visits v LEFT JOIN deaths d USING (act, map_point_type)
) TO '/lake/shadow_map_danger.json' (FORMAT json, ARRAY true);

-- Per-player floor rows for the choice-driven sections, with the walk's
-- carried-forward HP for campfire banding and the hopper-floor flag.
CREATE OR REPLACE TEMP VIEW pfloors AS
SELECT f.run_hash, f.act, f.floor_idx, ps.u AS p,
  e.win, lower(e.character) AS run_char,
  len(list_filter(f.room_models, m -> m LIKE '%THIEVING_HOPPER%')) > 0 AS hopper_floor,
  last_value(CASE WHEN ps.u.current_hp IS NOT NULL AND coalesce(ps.u.max_hp, 0) > 0
    THEN struct_pack(hp := ps.u.current_hp, mx := ps.u.max_hp) END IGNORE NULLS)
    OVER (PARTITION BY f.run_hash, ps.u.player_id ORDER BY f.act, f.floor_idx
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS hp_prev
FROM read_parquet('/lake/floors.parquet') f
JOIN eligible e ON f.run_hash = e.run_hash,
LATERAL (SELECT unnest(f.players) AS u) ps;

CREATE OR REPLACE TEMP VIEW pid_char AS
SELECT run_hash, player_id, lower(character) AS character
FROM read_parquet('/lake/players.parquet') WHERE player_id IS NOT NULL AND character <> '';

-- Event option counts (official-option filtering happens in the diff).
COPY (
SELECT split_part(ec.u.title."key", '.', 1) AS event_id,
  split_part(split_part(ec.u.title."key", '.options.', 2), '.', 1) AS option_id,
  count(*) AS n
FROM pfloors, LATERAL (SELECT unnest(p.event_choices) AS u) ec
WHERE ec.u.title."table" = 'events' AND ec.u.title."key" LIKE '%.options.%'
  AND split_part(ec.u.title."key", '.', 1) <> ''
  AND split_part(split_part(ec.u.title."key", '.options.', 2), '.', 1) <> ''
GROUP BY 1, 2
) TO '/lake/shadow_events.json' (FORMAT json, ARRAY true);

-- Campfire choices: count / wins / made-at-low-HP, plus per-character counts.
COPY (
WITH choices AS (
  SELECT rc.u AS choice, f.win,
    coalesce(f.hp_prev, struct_pack(hp := f.p.current_hp, mx := coalesce(f.p.max_hp, 0))) AS ref,
    coalesce(pc.character, f.run_char) AS ps_char
  FROM pfloors f
  LEFT JOIN pid_char pc ON f.run_hash = pc.run_hash AND f.p.player_id = pc.player_id,
  LATERAL (SELECT unnest(f.p.rest_site_choices) AS u) rc
  WHERE rc.u IS NOT NULL AND rc.u <> ''
)
SELECT choice, ps_char, count(*) AS n, count(*) FILTER (win) AS wins,
  count(*) FILTER (ref.mx > 0 AND ref.hp IS NOT NULL AND ref.hp * 2 < ref.mx) AS low
FROM choices GROUP BY 1, 2
) TO '/lake/shadow_rest.json' (FORMAT json, ARRAY true);

-- Ancient offers: chosen and offered per relic id.
COPY (
WITH offers AS (
  SELECT coalesce(ac.u.TextKey,
    CASE WHEN ac.u.title."key" LIKE '%.%'
         THEN substr(ac.u.title."key", strpos(ac.u.title."key", '.') + 1)
         ELSE ac.u.title."key" END) AS rid,
    ac.u.was_chosen AS was_chosen
  FROM pfloors, LATERAL (SELECT unnest(p.ancient_choice) AS u) ac
)
SELECT rid, count(*) FILTER (coalesce(was_chosen, false)) AS chosen, count(*) AS offered
FROM offers WHERE rid IS NOT NULL AND rid <> '' AND upper(rid) NOT LIKE 'NONE%'
GROUP BY 1
) TO '/lake/shadow_ancient.json' (FORMAT json, ARRAY true);

-- Removed vs hopper-stolen cards (starter variants merged), + per-char removes.
COPY (
WITH rem AS (
  SELECT f.hopper_floor, coalesce(pc.character, f.run_char) AS ps_char,
    coalesce(json_extract_string(cr.u, '$.card.id'),
             json_extract_string(cr.u, '$.id'),
             CASE WHEN json_type(cr.u) = 'VARCHAR' THEN cr.u::VARCHAR END) AS raw_id
  FROM pfloors f
  LEFT JOIN pid_char pc ON f.run_hash = pc.run_hash AND f.p.player_id = pc.player_id,
  LATERAL (SELECT unnest(f.p.cards_removed) AS u) cr
),
named AS (
  SELECT hopper_floor, ps_char,
    CASE WHEN upper(split_part(raw_id, '.', -1)) LIKE 'STRIKE_%' THEN 'STRIKE'
         WHEN upper(split_part(raw_id, '.', -1)) LIKE 'DEFEND_%' THEN 'DEFEND'
         ELSE upper(split_part(raw_id, '.', -1)) END AS cid
  FROM rem WHERE raw_id IS NOT NULL AND raw_id <> ''
    AND upper(split_part(raw_id, '.', -1)) NOT LIKE 'NONE%'
)
SELECT cid, hopper_floor, ps_char, count(*) AS n FROM named GROUP BY 1, 2, 3
) TO '/lake/shadow_removed.json' (FORMAT json, ARRAY true);

-- Card-reward screens and skips.
COPY (
SELECT count(*) AS screens,
  count(*) FILTER (NOT list_bool_or([coalesce(c.was_picked, false) FOR c IN p.card_choices])) AS skips
FROM pfloors WHERE len(p.card_choices) > 0
) TO '/lake/shadow_reward.json' (FORMAT json, ARRAY true);

-- Records: standard modifier-free eligible runs only.
COPY (
WITH rec_runs AS (
  SELECT * FROM eligible
  WHERE game_mode = 'standard' AND NOT has_modifiers
)
SELECT
  (SELECT min(run_time) FROM rec_runs WHERE win AND run_time > 0) AS fastest_win,
  (SELECT arg_min(run_hash, run_time) FROM rec_runs WHERE win AND run_time > 0) AS fastest_win_hash,
  (SELECT max(run_time) FROM rec_runs WHERE run_time > 0) AS longest_run,
  (SELECT arg_max(run_hash, run_time) FROM rec_runs WHERE run_time > 0) AS longest_run_hash,
  (SELECT max(p.deck_size) FROM read_parquet('/lake/players.parquet') p JOIN rec_runs r ON p.run_hash = r.run_hash) AS biggest_deck
) TO '/lake/shadow_records.json' (FORMAT json, ARRAY true);

SELECT 'char_asc rows' AS t, count(*) AS n FROM read_json('/lake/shadow_char_asc.json')
UNION ALL SELECT 'floors hist rows', count(*) FROM read_json('/lake/shadow_floors_hist.json')
UNION ALL SELECT 'map danger rows', count(*) FROM read_json('/lake/shadow_map_danger.json')
UNION ALL SELECT 'event option rows', count(*) FROM read_json('/lake/shadow_events.json')
UNION ALL SELECT 'rest rows', count(*) FROM read_json('/lake/shadow_rest.json')
UNION ALL SELECT 'ancient rows', count(*) FROM read_json('/lake/shadow_ancient.json')
UNION ALL SELECT 'removed rows', count(*) FROM read_json('/lake/shadow_removed.json');
