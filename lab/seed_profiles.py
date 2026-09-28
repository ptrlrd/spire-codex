"""Nightly seed profiles: everything the community's runs have shown for a
seed, so the Seed Finder can answer "which seeds offered X on floor N"
without walking run documents.

Two artifacts land next to the other serve files:

  seed_facts.parquet     one row per (seed_key, kind, id, act, floor, seat),
                         sorted by kind then id so a predicate is a cheap
                         row-group scan
  seed_profiles.parquet  one row per seed_key with the summary and the
                         display lists (Neow offers, bosses, ancients, path,
                         shops, best run, replay)

A seed_key is seed | build_id | player_count | party, since the same seed
rolls differently per character and lobby, and main and beta hash seeds
differently.

    docker compose -f docker-compose.prod.yml run --rm --entrypoint python lake-ingest /lab/seed_profiles.py
"""

import json
import os
import pathlib
import sys
import time

sys.path.insert(0, "/app")

LAKE = pathlib.Path(os.environ.get("LAKE_DIR", "/lake"))
FACTS_NAME = "seed_facts.parquet"
PROFILES_NAME = "seed_profiles.parquet"
META_NAME = "seed_profiles_meta.json"
MAX_ASCENSION = 20


def _replay_glob(name: str) -> str | None:
    root = LAKE / "replays"
    if not root.exists() or not any(root.glob(f"*/{name}.parquet")):
        return None
    return f"{root}/*/{name}.parquet"


ELIGIBLE_SQL = """
CREATE OR REPLACE TEMP TABLE eligible AS
SELECT r.run_hash, r.seed, coalesce(r.build_id, '') AS build_id,
  coalesce(r.player_count, 1) AS player_count, r.character, r.win,
  r.was_abandoned, r.ascension, r.run_time, r.start_time, r.played_at,
  r.username, s.floors_reached
FROM read_parquet('{lake}/runs.parquet') r
LEFT JOIN read_parquet('{lake}/run_scalars.parquet') s USING (run_hash)
ANTI JOIN read_parquet('{lake}/excluded.parquet') x ON r.run_hash = x.run_hash
WHERE r.seed IS NOT NULL AND r.seed <> ''
  AND coalesce(r.hidden, false) = false AND coalesce(r.deleted, false) = false
  AND NOT r.has_modifiers
  AND lower(coalesce(r.game_mode, 'standard')) = 'standard'
  AND r.ascension BETWEEN 0 AND {max_asc}
  AND r.character IN ('IRONCLAD','SILENT','DEFECT','NECROBINDER','REGENT')
"""

# Party = the characters of every doc that shares a seed, build, lobby size
# and start time (co-op siblings), so a 2p Ironclad+Silent lobby is one key.
KEYS_SQL = """
CREATE OR REPLACE TEMP TABLE run_keys AS
WITH party AS (
  SELECT seed, build_id, player_count, start_time,
    list_sort(list(DISTINCT character)) AS party
  FROM eligible GROUP BY 1,2,3,4
)
SELECT e.run_hash, e.seed, e.build_id, e.player_count, p.party,
  e.seed || '|' || e.build_id || '|' || e.player_count || '|' || array_to_string(p.party, '+') AS seed_key,
  e.character, e.win, e.was_abandoned, e.ascension, e.run_time, e.played_at,
  e.floors_reached, e.username
FROM eligible e
JOIN party p USING (seed, build_id, player_count, start_time)
"""

FACTS_SQL = """
CREATE OR REPLACE TEMP TABLE facts AS
-- Neow and other ancient offers: every relic on the offer screen, per seat.
SELECT k.seed_key, 'ancient_offer' AS kind, upper(o.u.TextKey) AS id,
  f.act + 1 AS act, f.floor_idx AS floor, ps.i AS seat
FROM run_keys k
JOIN read_parquet('{lake}/floors.parquet') f USING (run_hash),
  LATERAL (SELECT unnest(f.players) AS u, generate_subscripts(f.players,1) AS i) ps,
  LATERAL (SELECT unnest(ps.u.ancient_choice) AS u) o
WHERE f.map_point_type = 'ancient' AND o.u.TextKey IS NOT NULL
UNION ALL
-- The ancient itself, by act.
SELECT k.seed_key, 'ancient', upper(split_part(f.room_model, '.', -1)), f.act + 1, f.floor_idx, 0
FROM run_keys k JOIN read_parquet('{lake}/floors.parquet') f USING (run_hash)
WHERE f.map_point_type = 'ancient' AND f.room_model IS NOT NULL
UNION ALL
-- Events visited (non-ancient event rooms).
SELECT k.seed_key, 'event', upper(split_part(f.room_model, '.', -1)), f.act + 1, f.floor_idx, 0
FROM run_keys k JOIN read_parquet('{lake}/floors.parquet') f USING (run_hash)
WHERE f.room_type = 'event' AND f.map_point_type <> 'ancient' AND f.room_model IS NOT NULL
UNION ALL
-- Bosses and elites.
SELECT k.seed_key, CASE WHEN fe.room_type = 'boss' THEN 'boss' ELSE 'elite' END, fe.encounter, fe.act, fe.floor_idx, 0
FROM run_keys k JOIN read_parquet('{lake}/floor_events.parquet') fe USING (run_hash)
WHERE fe.room_type IN ('boss', 'elite') AND fe.encounter IS NOT NULL
UNION ALL
-- Card rewards offered, per seat.
SELECT k.seed_key, 'card_offer', upper(split_part(c.u.card.id, '.', -1)), f.act + 1, f.floor_idx, ps.i
FROM run_keys k
JOIN read_parquet('{lake}/floors.parquet') f USING (run_hash),
  LATERAL (SELECT unnest(f.players) AS u, generate_subscripts(f.players,1) AS i) ps,
  LATERAL (SELECT unnest(ps.u.card_choices) AS u) c
WHERE c.u.card.id IS NOT NULL
UNION ALL
-- Relics obtained, with the floor.
SELECT k.seed_key, 'relic', r.relic, NULL, r.floor_added, r.player_idx
FROM run_keys k JOIN read_parquet('{lake}/relics.parquet') r USING (run_hash)
WHERE r.relic IS NOT NULL
UNION ALL
-- Cards in the final deck.
SELECT k.seed_key, 'deck', d.card, NULL, d.floor_added, d.player_idx
FROM run_keys k JOIN read_parquet('{lake}/deck.parquet') d USING (run_hash)
WHERE d.card IS NOT NULL
"""

SHOP_FACTS_SQL = """
INSERT INTO facts
SELECT k.seed_key, 'shop_' || it.u.kind, upper(it.u.id), s.act, s.floor, 0
FROM run_keys k
JOIN read_parquet('{shops}', union_by_name=true) s USING (run_hash),
  LATERAL (SELECT unnest(s.items) AS u) it
WHERE it.u.id IS NOT NULL
"""

PROFILES_SQL = """
CREATE OR REPLACE TEMP TABLE profiles AS
WITH per_run AS (
  SELECT k.*,
    (SELECT list(DISTINCT upper(o.u.TextKey))
       FROM read_parquet('{lake}/floors.parquet') f,
         LATERAL (SELECT unnest(f.players) AS u) ps,
         LATERAL (SELECT unnest(ps.u.ancient_choice) AS u) o
      WHERE f.run_hash = k.run_hash AND f.act = 0 AND f.map_point_type = 'ancient') AS neow_offers,
    (SELECT list(struct_pack(act := fe.act, id := fe.encounter) ORDER BY fe.act)
       FROM read_parquet('{lake}/floor_events.parquet') fe
      WHERE fe.run_hash = k.run_hash AND fe.room_type = 'boss') AS bosses,
    (SELECT list(struct_pack(act := f.act + 1, id := upper(split_part(f.room_model, '.', -1))) ORDER BY f.act)
       FROM read_parquet('{lake}/floors.parquet') f
      WHERE f.run_hash = k.run_hash AND f.map_point_type = 'ancient' AND f.room_model IS NOT NULL) AS ancients,
    (SELECT list(struct_pack(act := f.act + 1, floor := f.floor_idx, id := upper(split_part(f.room_model, '.', -1))) ORDER BY f.act, f.floor_idx)
       FROM read_parquet('{lake}/floors.parquet') f
      WHERE f.run_hash = k.run_hash AND f.room_type = 'event' AND f.map_point_type <> 'ancient' AND f.room_model IS NOT NULL) AS events,
    (SELECT list(struct_pack(act := a.act + 1, path := a.path) ORDER BY a.act)
       FROM (SELECT f.act, string_agg(f.map_point_type, ',' ORDER BY f.floor_idx) AS path
               FROM read_parquet('{lake}/floors.parquet') f
              WHERE f.run_hash = k.run_hash GROUP BY f.act) a) AS path
  FROM run_keys k
),
best AS (
  SELECT seed_key, run_hash AS best_run_hash, win AS best_win, run_time AS best_run_time,
    floors_reached AS best_floors, character AS best_character, username AS best_username
  FROM (
    SELECT *, row_number() OVER (PARTITION BY seed_key
      ORDER BY win DESC, was_abandoned ASC, CASE WHEN win THEN run_time END ASC, floors_reached DESC, played_at DESC) AS rn
    FROM run_keys
  ) WHERE rn = 1
)
SELECT p.seed_key, any_value(p.seed) AS seed, any_value(p.build_id) AS build_id,
  any_value(p.player_count) AS player_count, any_value(p.party) AS party,
  count(*) AS runs, sum(CASE WHEN p.win THEN 1 ELSE 0 END) AS wins,
  sum(CASE WHEN p.was_abandoned THEN 1 ELSE 0 END) AS abandoned,
  min(p.ascension) AS ascension_min, max(p.ascension) AS ascension_max,
  max(p.played_at) AS last_played,
  list_distinct(flatten(list(coalesce(p.neow_offers, [])))) AS neow_offers,
  list_distinct(flatten(list(coalesce(p.bosses, [])))) AS bosses,
  list_distinct(flatten(list(coalesce(p.ancients, [])))) AS ancients,
  list_distinct(flatten(list(coalesce(p.events, [])))) AS events,
  arg_max(p.path, p.floors_reached) AS path,
  any_value(b.best_run_hash) AS best_run_hash, any_value(b.best_win) AS best_win,
  any_value(b.best_run_time) AS best_run_time, any_value(b.best_floors) AS best_floors,
  any_value(b.best_character) AS best_character, any_value(b.best_username) AS best_username,
  list(p.run_hash) AS run_hashes
FROM per_run p JOIN best b USING (seed_key)
GROUP BY p.seed_key
"""

REPLAY_SQL = """
CREATE OR REPLACE TEMP TABLE replay_by_seed AS
SELECT k.seed_key, arg_max(k.run_hash, k.floors_reached) AS replay_run_hash
FROM run_keys k JOIN (SELECT DISTINCT run_hash FROM read_parquet('{index}', union_by_name=true)) ri USING (run_hash)
GROUP BY k.seed_key
"""

SHOPS_SQL = """
CREATE OR REPLACE TEMP TABLE shops_by_seed AS
SELECT k.seed_key,
  list(struct_pack(act := s.act, floor := s.floor, gold := s.gold, removal_cost := s.removal_cost,
    items := s.items) ORDER BY s.floor) AS shops
FROM run_keys k
JOIN read_parquet('{shops}', union_by_name=true) s USING (run_hash)
JOIN (SELECT seed_key, arg_max(run_hash, floors_reached) AS run_hash
      FROM run_keys k2 WHERE run_hash IN (SELECT DISTINCT run_hash FROM read_parquet('{shops}', union_by_name=true))
      GROUP BY seed_key) pick ON pick.run_hash = s.run_hash AND pick.seed_key = k.seed_key
GROUP BY k.seed_key
"""

MAPS_SQL = """
CREATE OR REPLACE TEMP TABLE maps_by_seed AS
SELECT k.seed_key, arg_min(m.nodes, m.s) AS map_act1
FROM run_keys k
JOIN read_parquet('{maps}', union_by_name=true) m USING (run_hash)
WHERE m.act = 1
GROUP BY k.seed_key
"""


def build() -> dict:
    from app.services import lake_stats

    started = time.time()
    con = lake_stats._connect(build=True)
    lake = str(LAKE)
    con.execute(ELIGIBLE_SQL.format(lake=lake, max_asc=MAX_ASCENSION))
    con.execute(KEYS_SQL)
    con.execute(FACTS_SQL.format(lake=lake))
    shops = _replay_glob("shops")
    index = _replay_glob("replay_index")
    maps = _replay_glob("maps")
    if shops:
        con.execute(SHOP_FACTS_SQL.format(shops=shops))
    con.execute(PROFILES_SQL.format(lake=lake))
    extra_cols = []
    joins = []
    if index:
        con.execute(REPLAY_SQL.format(index=index))
        extra_cols.append("rb.replay_run_hash")
        joins.append("LEFT JOIN replay_by_seed rb USING (seed_key)")
    else:
        extra_cols.append("NULL::VARCHAR AS replay_run_hash")
    if shops:
        con.execute(SHOPS_SQL.format(shops=shops))
        extra_cols.append("sb.shops")
        joins.append("LEFT JOIN shops_by_seed sb USING (seed_key)")
    else:
        extra_cols.append("NULL AS shops")
    if maps:
        con.execute(MAPS_SQL.format(maps=maps))
        extra_cols.append("mb.map_act1")
        joins.append("LEFT JOIN maps_by_seed mb USING (seed_key)")
    else:
        extra_cols.append("NULL AS map_act1")

    facts_tmp = LAKE / f"{FACTS_NAME}.{os.getpid()}.tmp"
    profiles_tmp = LAKE / f"{PROFILES_NAME}.{os.getpid()}.tmp"
    con.execute(
        f"COPY (SELECT DISTINCT seed_key, kind, id, act, floor, seat FROM facts ORDER BY kind, id, seed_key) "
        f"TO '{facts_tmp}' (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 100000)"
    )
    con.execute(
        f"COPY (SELECT p.*, {', '.join(extra_cols)} FROM profiles p {' '.join(joins)} ORDER BY p.seed_key) "
        f"TO '{profiles_tmp}' (FORMAT parquet, COMPRESSION zstd)"
    )
    facts_rows = con.execute(
        f"SELECT count(*) FROM read_parquet('{facts_tmp}')"
    ).fetchone()[0]
    seeds = con.execute(
        f"SELECT count(*) FROM read_parquet('{profiles_tmp}')"
    ).fetchone()[0]
    builds = [
        r[0]
        for r in con.execute(
            f"SELECT build_id FROM read_parquet('{profiles_tmp}') GROUP BY 1 ORDER BY count(*) DESC"
        ).fetchall()
    ]
    con.close()
    facts_tmp.replace(LAKE / FACTS_NAME)
    profiles_tmp.replace(LAKE / PROFILES_NAME)
    meta = {
        "seeds": int(seeds),
        "facts": int(facts_rows),
        "builds": builds,
        "with_shops": bool(shops),
        "with_maps": bool(maps),
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "build_seconds": round(time.time() - started, 1),
    }
    tmp = LAKE / f"{META_NAME}.{os.getpid()}.tmp"
    tmp.write_text(json.dumps(meta), encoding="utf-8")
    tmp.replace(LAKE / META_NAME)
    return meta


if __name__ == "__main__":
    print(json.dumps(build(), indent=2))
