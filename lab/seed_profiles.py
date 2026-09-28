"""Nightly seed profiles: everything the community's runs have shown for a
seed, so the Seed Finder can answer "which seeds offered X on floor N"
without walking run documents.

Two artifacts land next to the other serve files:

  seed_facts.parquet     one row per (seed_key, evidence, kind, id, act,
                         floor, seat) with an occurrence count, sorted by
                         kind then id so a predicate is a cheap row-group
                         scan; evidence is one solo run or one co-op lobby,
                         so a full match always comes from one real run
  seed_profiles.parquet  one row per seed_key with the summary, the display
                         lists, the inspect-page facts, and the best run's
                         path, shops and act 1 map

A seed_key is seed | build_id | player_count | party (characters in seat
order), since the same seed rolls differently per character and lobby, and
main and beta hash seeds differently.

    docker compose -f docker-compose.prod.yml run --rm --entrypoint python lake-ingest /lab/seed_profiles.py
"""

import json
import os
import pathlib
import shutil
import sys
import time

sys.path.insert(0, "/app")

LAKE = pathlib.Path(os.environ.get("LAKE_DIR", "/lake"))
FACTS_NAME = "seed_facts.parquet"
PROFILES_NAME = "seed_profiles.parquet"
META_NAME = "seed_profiles_meta.json"
MAX_ASCENSION = 20
MAX_DETAIL_FACTS = 600
MAX_RUN_HASHES = 50


def _q(path) -> str:
    return str(path).replace("'", "''")


def _replay_glob(name: str) -> str | None:
    root = LAKE / "replays"
    if not root.exists() or not any(root.glob(f"*/{name}.parquet")):
        return None
    return f"{root}/*/{name}.parquet"


ELIGIBLE_SQL = """
CREATE OR REPLACE TEMP TABLE eligible AS
SELECT r.run_hash, r.seed, coalesce(r.build_id, '') AS build_id,
  coalesce(r.player_count, 1) AS player_count, r.character, r.win,
  coalesce(r.was_abandoned, false) AS was_abandoned, r.ascension, r.run_time,
  r.start_time, r.played_at, r.username, s.floors_reached
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

# The party comes from the blob's own seat list (deck.parquet carries every
# seat with its character), so two Ironclads stay two seats in order. Co-op
# siblings share one blob and therefore one seed, build, start time and
# party; that tuple is the lobby, and the lobby is the evidence unit.
KEYS_SQL = """
CREATE OR REPLACE TEMP TABLE run_keys AS
WITH seats AS (
  SELECT run_hash, list(character ORDER BY player_idx) AS party
  FROM (SELECT DISTINCT run_hash, player_idx, character
        FROM read_parquet('{lake}/deck.parquet') WHERE character IS NOT NULL)
  GROUP BY run_hash
),
keyed AS (
  SELECT e.*, coalesce(s.party, [e.character]) AS party
  FROM eligible e LEFT JOIN seats s USING (run_hash)
),
lobbies AS (
  SELECT seed, build_id, player_count, party,
    coalesce(cast(start_time AS VARCHAR), 'run:' || run_hash) AS start_key,
    md5(seed || '|' || build_id || '|' || player_count || '|' || array_to_string(party, '+') || '|'
        || coalesce(cast(start_time AS VARCHAR), 'run:' || run_hash)) AS evidence,
    min(run_hash) AS lead_run,
    bool_or(win) AS lobby_win
  FROM keyed GROUP BY 1,2,3,4,5
)
SELECT k.run_hash, k.seed, k.build_id, k.player_count, k.party,
  k.seed || '|' || k.build_id || '|' || k.player_count || '|' || array_to_string(k.party, '+') AS seed_key,
  l.evidence, k.run_hash = l.lead_run AS is_lead, l.lobby_win,
  k.character, k.win, k.was_abandoned, k.ascension, k.run_time, k.played_at,
  k.floors_reached, k.username
FROM keyed k
JOIN lobbies l ON l.seed = k.seed AND l.build_id = k.build_id AND l.player_count = k.player_count
  AND l.party = k.party AND l.start_key = coalesce(cast(k.start_time AS VARCHAR), 'run:' || k.run_hash)
"""

# Facts are keyed by evidence (a lobby), not by run document, so co-op
# siblings that share a blob contribute one copy. Each family is written to
# its own fragment and sorted once at the end.
FACT_FAMILIES = {
    "ancient_offer": """
SELECT k.seed_key, k.evidence, k.lobby_win, 'ancient_offer' AS kind, upper(o.u.TextKey) AS id,
  f.act + 1 AS act, f.floor_idx AS floor, ps.i AS seat, count(*) AS n
FROM run_keys k
JOIN read_parquet('{lake}/floors.parquet') f USING (run_hash),
  LATERAL (SELECT unnest(f.players) AS u, generate_subscripts(f.players,1) AS i) ps,
  LATERAL (SELECT unnest(ps.u.ancient_choice) AS u) o
WHERE k.is_lead AND f.map_point_type = 'ancient' AND o.u.TextKey IS NOT NULL
GROUP BY 1,2,3,4,5,6,7,8
""",
    "ancient": """
SELECT k.seed_key, k.evidence, k.lobby_win, 'ancient', upper(split_part(f.room_model, '.', -1)), f.act + 1, f.floor_idx, 0, count(*)
FROM run_keys k JOIN read_parquet('{lake}/floors.parquet') f USING (run_hash)
WHERE k.is_lead AND f.map_point_type = 'ancient' AND f.room_model IS NOT NULL
GROUP BY 1,2,3,4,5,6,7,8
""",
    "event": """
SELECT k.seed_key, k.evidence, k.lobby_win, 'event', upper(split_part(f.room_model, '.', -1)), f.act + 1, f.floor_idx, 0, count(*)
FROM run_keys k JOIN read_parquet('{lake}/floors.parquet') f USING (run_hash)
WHERE k.is_lead AND f.room_type = 'event' AND f.map_point_type <> 'ancient' AND f.room_model IS NOT NULL
GROUP BY 1,2,3,4,5,6,7,8
""",
    "boss_elite": """
SELECT k.seed_key, k.evidence, k.lobby_win, CASE WHEN fe.room_type = 'boss' THEN 'boss' ELSE 'elite' END, fe.encounter, fe.act, fe.floor_idx, 0, count(*)
FROM run_keys k JOIN read_parquet('{lake}/floor_events.parquet') fe USING (run_hash)
WHERE k.is_lead AND fe.room_type IN ('boss', 'elite') AND fe.encounter IS NOT NULL
GROUP BY 1,2,3,4,5,6,7,8
""",
    "card_offer": """
SELECT k.seed_key, k.evidence, k.lobby_win, 'card_offer', upper(split_part(c.u.card.id, '.', -1)), f.act + 1, f.floor_idx, ps.i, count(*)
FROM run_keys k
JOIN read_parquet('{lake}/floors.parquet') f USING (run_hash),
  LATERAL (SELECT unnest(f.players) AS u, generate_subscripts(f.players,1) AS i) ps,
  LATERAL (SELECT unnest(ps.u.card_choices) AS u) c
WHERE k.is_lead AND c.u.card.id IS NOT NULL
GROUP BY 1,2,3,4,5,6,7,8
""",
    "relic": """
SELECT k.seed_key, k.evidence, k.lobby_win, 'relic', r.relic, NULL, r.floor_added, r.player_idx, count(*)
FROM run_keys k JOIN read_parquet('{lake}/relics.parquet') r USING (run_hash)
WHERE k.is_lead AND r.relic IS NOT NULL
GROUP BY 1,2,3,4,5,6,7,8
""",
    "deck": """
SELECT k.seed_key, k.evidence, k.lobby_win, 'deck', d.card, NULL, d.floor_added, d.player_idx, count(*)
FROM run_keys k JOIN read_parquet('{lake}/deck.parquet') d USING (run_hash)
WHERE k.is_lead AND d.card IS NOT NULL
GROUP BY 1,2,3,4,5,6,7,8
""",
}

SHOP_FACTS_SQL = """
SELECT k.seed_key, k.evidence, k.lobby_win, 'shop_' || it.u.kind, upper(it.u.id), s.act, s.floor, 0, count(*)
FROM run_keys k
JOIN read_parquet('{shops}', union_by_name=true) s USING (run_hash),
  LATERAL (SELECT unnest(s.items) AS u) it
WHERE k.is_lead AND it.u.id IS NOT NULL AND it.u.kind IS NOT NULL
GROUP BY 1,2,3,4,5,6,7,8
"""

# One row per lobby, then per seed_key: outcomes count each lobby once.
LOBBIES_SQL = """
CREATE OR REPLACE TEMP TABLE lobbies AS
SELECT seed_key, evidence, any_value(seed) AS seed, any_value(build_id) AS build_id,
  any_value(player_count) AS player_count, any_value(party) AS party,
  bool_or(win) AS win, bool_and(was_abandoned) AS was_abandoned,
  min(ascension) AS ascension, max(played_at) AS played_at,
  arg_min(run_time, run_hash) AS run_time, arg_min(floors_reached, run_hash) AS floors_reached,
  min(run_hash) AS lead_run, arg_min(username, run_hash) AS username
FROM run_keys GROUP BY seed_key, evidence
"""

BEST_SQL = """
CREATE OR REPLACE TEMP TABLE best AS
SELECT seed_key, evidence AS best_evidence, lead_run AS best_run_hash, win AS best_win,
  run_time AS best_run_time, floors_reached AS best_floors, username AS best_username
FROM (
  SELECT *, row_number() OVER (PARTITION BY seed_key
    ORDER BY win DESC, was_abandoned ASC, CASE WHEN win THEN run_time END ASC NULLS LAST,
      floors_reached DESC NULLS LAST, played_at DESC NULLS LAST, lead_run) AS rn
  FROM lobbies
) WHERE rn = 1
"""

DISPLAY_SQL = """
CREATE OR REPLACE TEMP TABLE display AS
WITH distinct_facts AS (
  SELECT DISTINCT seed_key, kind, id, act, floor FROM read_parquet('{facts}')
  WHERE kind IN ('ancient_offer', 'ancient', 'event', 'boss')
)
SELECT seed_key,
  list(DISTINCT id ORDER BY id) FILTER (WHERE kind = 'ancient_offer' AND act = 1) AS neow_offers,
  list(struct_pack(act := act, id := id) ORDER BY act, id) FILTER (WHERE kind = 'boss') AS bosses,
  list(struct_pack(act := act, id := id) ORDER BY act, id) FILTER (WHERE kind = 'ancient') AS ancients,
  list(struct_pack(act := act, floor := floor, id := id) ORDER BY act, floor, id) FILTER (WHERE kind = 'event') AS events
FROM distinct_facts GROUP BY seed_key
"""

DETAIL_SQL = """
CREATE OR REPLACE TEMP TABLE detail AS
SELECT seed_key,
  list(struct_pack(kind := kind, id := id, act := act, floor := floor, seat := seat, n := n)
       ORDER BY kind, act NULLS LAST, floor NULLS LAST, seat, id)[1:{cap}] AS facts
FROM (
  SELECT seed_key, kind, id, act, floor, seat, max(n) AS n
  FROM read_parquet('{facts}')
  WHERE kind IN ('card_offer', 'relic', 'deck', 'elite', 'shop_card', 'shop_relic', 'shop_potion')
  GROUP BY 1,2,3,4,5,6
) GROUP BY seed_key
"""

PATH_SQL = """
CREATE OR REPLACE TEMP TABLE best_path AS
SELECT b.seed_key,
  list(struct_pack(act := a.act + 1, path := a.path) ORDER BY a.act) AS path
FROM best b
JOIN (
  SELECT f.run_hash, f.act, string_agg(f.map_point_type, ',' ORDER BY f.floor_idx) AS path
  FROM read_parquet('{lake}/floors.parquet') f
  WHERE f.run_hash IN (SELECT best_run_hash FROM best)
  GROUP BY f.run_hash, f.act
) a ON a.run_hash = b.best_run_hash
GROUP BY b.seed_key
"""

REPLAY_SQL = """
CREATE OR REPLACE TEMP TABLE replay_by_seed AS
SELECT seed_key, arg_max(run_hash, floors_reached) AS replay_run_hash
FROM (
  SELECT k.seed_key, k.run_hash, coalesce(k.floors_reached, 0) AS floors_reached
  FROM run_keys k
  JOIN (SELECT DISTINCT run_hash FROM read_parquet('{index}', union_by_name=true)) ri USING (run_hash)
) GROUP BY seed_key
"""

SHOPS_SQL = """
CREATE OR REPLACE TEMP TABLE shops_by_seed AS
SELECT rb.seed_key,
  list(struct_pack(act := s.act, floor := s.floor, gold := s.gold, removal_cost := s.removal_cost,
    items := s.items) ORDER BY s.floor, s.s) AS shops
FROM replay_by_seed rb
JOIN read_parquet('{shops}', union_by_name=true) s ON s.run_hash = rb.replay_run_hash
GROUP BY rb.seed_key
"""

MAPS_SQL = """
CREATE OR REPLACE TEMP TABLE maps_by_seed AS
SELECT rb.seed_key, arg_min(m.nodes, m.s) AS map_act1
FROM replay_by_seed rb
JOIN read_parquet('{maps}', union_by_name=true) m ON m.run_hash = rb.replay_run_hash
WHERE m.act = 1
GROUP BY rb.seed_key
"""

PROFILES_SQL = """
SELECT l.seed_key, any_value(l.seed) AS seed, any_value(l.build_id) AS build_id,
  any_value(l.player_count) AS player_count, any_value(l.party) AS party,
  count(*) AS runs, sum(CASE WHEN l.win THEN 1 ELSE 0 END) AS wins,
  sum(CASE WHEN l.was_abandoned THEN 1 ELSE 0 END) AS abandoned,
  min(l.ascension) AS ascension_min, max(l.ascension) AS ascension_max,
  max(l.played_at) AS last_played,
  any_value(b.best_run_hash) AS best_run_hash, any_value(b.best_win) AS best_win,
  any_value(b.best_run_time) AS best_run_time, any_value(b.best_floors) AS best_floors,
  any_value(b.best_username) AS best_username,
  list(l.lead_run ORDER BY l.win DESC, l.played_at DESC NULLS LAST, l.lead_run)[1:{max_runs}] AS run_hashes,
  any_value(d.neow_offers) AS neow_offers, any_value(d.bosses) AS bosses,
  any_value(d.ancients) AS ancients, any_value(d.events) AS events,
  any_value(bp.path) AS path, any_value(dt.facts) AS facts
  {extra_cols}
FROM lobbies l
JOIN best b USING (seed_key)
LEFT JOIN display d USING (seed_key)
LEFT JOIN best_path bp USING (seed_key)
LEFT JOIN detail dt USING (seed_key)
{joins}
GROUP BY l.seed_key
ORDER BY l.seed_key
"""


def build() -> dict:
    from app.services import lake_stats

    started = time.time()
    con = lake_stats._connect(build=True)
    lake = _q(LAKE)
    work = LAKE / f"seed_profiles.work.{os.getpid()}"
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)
    try:
        con.execute(ELIGIBLE_SQL.format(lake=lake, max_asc=MAX_ASCENSION))
        con.execute(KEYS_SQL.format(lake=lake))
        shops = _replay_glob("shops")
        index = _replay_glob("replay_index")
        maps = _replay_glob("maps")
        families = dict(FACT_FAMILIES)
        if shops:
            families["shop"] = SHOP_FACTS_SQL
        for name, sql in families.items():
            fragment = work / f"facts_{name}.parquet"
            body = sql.format(lake=lake, shops=_q(shops) if shops else "")
            con.execute(
                f"COPY (SELECT seed_key, evidence, win, kind, id, act::INTEGER AS act, floor::INTEGER AS floor, "
                f"seat::INTEGER AS seat, n::INTEGER AS n FROM ({body}) "
                f"t(seed_key, evidence, win, kind, id, act, floor, seat, n)) "
                f"TO '{_q(fragment)}' (FORMAT parquet, COMPRESSION zstd)"
            )
        facts_tmp = LAKE / f"{FACTS_NAME}.{os.getpid()}.tmp"
        con.execute(
            f"COPY (SELECT * FROM read_parquet('{_q(work)}/facts_*.parquet') ORDER BY kind, id, seed_key, evidence) "
            f"TO '{_q(facts_tmp)}' (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 100000)"
        )
        facts = _q(facts_tmp)
        con.execute(LOBBIES_SQL)
        con.execute(BEST_SQL)
        con.execute(DISPLAY_SQL.format(facts=facts))
        con.execute(DETAIL_SQL.format(facts=facts, cap=MAX_DETAIL_FACTS))
        con.execute(PATH_SQL.format(lake=lake))
        extra_cols: list[str] = []
        joins: list[str] = []
        if index:
            con.execute(REPLAY_SQL.format(index=_q(index)))
            extra_cols.append("any_value(rb.replay_run_hash) AS replay_run_hash")
            joins.append("LEFT JOIN replay_by_seed rb USING (seed_key)")
            if shops:
                con.execute(SHOPS_SQL.format(shops=_q(shops)))
                extra_cols.append("any_value(sb.shops) AS shops")
                joins.append("LEFT JOIN shops_by_seed sb USING (seed_key)")
            else:
                extra_cols.append("NULL AS shops")
            if maps:
                con.execute(MAPS_SQL.format(maps=_q(maps)))
                extra_cols.append("any_value(mb.map_act1) AS map_act1")
                joins.append("LEFT JOIN maps_by_seed mb USING (seed_key)")
            else:
                extra_cols.append("NULL AS map_act1")
        else:
            extra_cols.extend(
                [
                    "NULL::VARCHAR AS replay_run_hash",
                    "NULL AS shops",
                    "NULL AS map_act1",
                ]
            )
        profiles_tmp = LAKE / f"{PROFILES_NAME}.{os.getpid()}.tmp"
        con.execute(
            f"COPY ({PROFILES_SQL.format(max_runs=MAX_RUN_HASHES, extra_cols=', ' + ', '.join(extra_cols), joins=' '.join(joins))}) "
            f"TO '{_q(profiles_tmp)}' (FORMAT parquet, COMPRESSION zstd)"
        )
        facts_rows = con.execute(
            f"SELECT count(*) FROM read_parquet('{facts}')"
        ).fetchone()[0]
        seeds = con.execute(
            f"SELECT count(*) FROM read_parquet('{_q(profiles_tmp)}')"
        ).fetchone()[0]
        builds = [
            r[0]
            for r in con.execute(
                f"SELECT build_id FROM read_parquet('{_q(profiles_tmp)}') GROUP BY 1 ORDER BY count(*) DESC"
            ).fetchall()
        ]
    finally:
        con.close()
        shutil.rmtree(work, ignore_errors=True)
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
