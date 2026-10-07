-- One staging page -> its per-run lake tables under __OUT__. build_lake.py
-- runs this once per new or changed page and keeps the output, so a cycle
-- parses only what arrived since the last one; build.sql then reassembles
-- the single-file tables from every page's output.
-- Fully streaming with explicit per-pass schemas: no sniffing pass, and the
-- reader only parses the declared fields, so memory stays low and bounded
-- (auto-inference held ~30k sample lines and blew both a 2g and 3g cap).
-- Missing fields in old runs become NULL; a line that can't convert is
-- dropped (ignore_errors) -- the final counts surface any aggregate loss.
-- Connection settings (memory_limit, threads, temp_directory) come from the
-- caller: the ingest sets LAKE_BUILD_MEMORY-sized limits before executing
-- this script. The old hard-coded 1800MB/2-thread block predated the box
-- upgrade and starved the parse into ~300GB of disk spill per cycle.

-- Parse the page ONCE into a scratch table carrying the superset of every
-- field any output table needs; the extractions below read that instead of
-- re-parsing the JSON per table.
CREATE OR REPLACE TABLE raw AS
SELECT * FROM read_ndjson('__SRC__',
  maximum_object_size=33554432, ignore_errors=true,
  columns={run_hash: 'VARCHAR',
    win: 'BOOLEAN', was_abandoned: 'BOOLEAN', ascension: 'BIGINT',
    game_mode: 'VARCHAR', build_id: 'VARCHAR', seed: 'VARCHAR',
    start_time: 'BIGINT', run_time: 'BIGINT',
    killed_by_encounter: 'VARCHAR', killed_by_event: 'VARCHAR',
    modifiers: 'VARCHAR[]',
    players: 'STRUCT(id BIGINT, "character" VARCHAR, deck STRUCT(floor_added_to_deck BIGINT, id VARCHAR, current_upgrade_level BIGINT, enchantment STRUCT(id VARCHAR))[], relics STRUCT(id VARCHAR, floor_added_to_deck BIGINT, props STRUCT(bools STRUCT(name VARCHAR, value BOOLEAN)[]))[], potions STRUCT(id VARCHAR, was_used BOOLEAN)[])[]',
    map_point_history: 'STRUCT(map_point_type VARCHAR, player_stats STRUCT(player_id BIGINT, current_gold BIGINT, current_hp BIGINT, damage_taken BIGINT, max_hp BIGINT, event_choices STRUCT(title STRUCT("key" VARCHAR, "table" VARCHAR))[], rest_site_choices VARCHAR[], upgraded_cards VARCHAR[], ancient_choice STRUCT(TextKey VARCHAR, title STRUCT("key" VARCHAR, "table" VARCHAR), was_chosen BOOLEAN)[], cards_removed JSON[], card_choices STRUCT(was_picked BOOLEAN, card STRUCT(id VARCHAR))[], potion_choices STRUCT(was_picked BOOLEAN, choice VARCHAR)[], relic_choices STRUCT(choice VARCHAR, was_picked BOOLEAN)[], potion_used VARCHAR[], potion_discarded VARCHAR[], relics_removed VARCHAR[])[], rooms STRUCT(model_id VARCHAR, room_type VARCHAR, turns_taken BIGINT)[])[][]',    _meta: 'STRUCT(username VARCHAR, user_id VARCHAR, hidden BOOLEAN, deleted BOOLEAN, submitted_at TIMESTAMP, played_at TIMESTAMP, player_count BIGINT, "character" VARCHAR)'});


COPY (
-- _meta.character is THIS document's player (party siblings share one blob
-- where players[1] is only right for player 1); the blob fallback covers
-- pages extracted before the field existed — re-extract to fix history.
SELECT run_hash,
  coalesce(upper(_meta."character"), upper(split_part(players[1].character,'.',-1))) AS character,
  win, coalesce(was_abandoned, false) AS was_abandoned,
  ascension, lower(coalesce(game_mode,'standard')) AS game_mode,
  _meta.player_count AS player_count, build_id, seed, start_time, run_time,
  upper(split_part(killed_by_encounter,'.',-1)) AS killed_by_encounter,
  upper(split_part(killed_by_event,'.',-1)) AS killed_by_event,
  _meta.username AS username, _meta.user_id AS user_id,
  _meta.hidden AS hidden, _meta.deleted AS deleted,
  coalesce(len(modifiers), 0) > 0 AS has_modifiers,
  _meta.submitted_at AS submitted_at, _meta.played_at AS played_at
FROM raw
) TO '__OUT__/runs.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (
SELECT r.run_hash, act.i AS act, loc.i AS floor_idx,
  lower(loc.u.map_point_type) AS map_point_type,
  lower(room.u.room_type) AS room_type,
  upper(split_part(room.u.model_id,'.',-1)) AS encounter,
  room.u.turns_taken AS turns,
  (SELECT sum(ps.u.damage_taken) FROM (SELECT unnest(loc.u.player_stats) AS u) ps) AS damage_taken,
  loc.u.player_stats[1].current_hp AS p1_hp,
  loc.u.player_stats[1].max_hp AS p1_max_hp,
  loc.u.player_stats[1].current_gold AS p1_gold
FROM raw r,
  LATERAL (SELECT unnest(map_point_history) AS u, generate_subscripts(map_point_history,1) AS i) act,
  LATERAL (SELECT unnest(act.u) AS u, generate_subscripts(act.u,1) AS i) loc,
  LATERAL (SELECT unnest(loc.u.rooms) AS u) room
) TO '__OUT__/floor_events.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (
SELECT r.run_hash, p.i AS player_idx,
  upper(split_part(p.u.character,'.',-1)) AS character,
  upper(split_part(c.u.id,'.',-1)) AS card,
  c.u.floor_added_to_deck AS floor_added,
  c.u.current_upgrade_level AS upgrade_level,
  upper(split_part(c.u.enchantment.id, '.', -1)) AS enchantment
FROM raw r,
  LATERAL (SELECT unnest(players) AS u, generate_subscripts(players,1) AS i) p,
  LATERAL (SELECT unnest(p.u.deck) AS u) c
) TO '__OUT__/deck.parquet' (FORMAT parquet, COMPRESSION zstd);

-- Location-level table (one row per visited map point, players kept as a
-- nested list): floor_events drops roomless locations via its rooms
-- unnest, so survival and map-danger need this shape.
COPY (
SELECT r.run_hash, act.i - 1 AS act, loc.i AS floor_idx,
  lower(loc.u.map_point_type) AS map_point_type,
  loc.u.player_stats AS players,
  [x.model_id FOR x IN loc.u.rooms] AS room_models,
  [lower(x.room_type) FOR x IN loc.u.rooms] AS room_types,
  lower(loc.u.rooms[1].room_type) AS room_type,
  loc.u.rooms[1].model_id AS room_model,
  loc.u.rooms[1].turns_taken AS room_turns
FROM raw r,
  LATERAL (SELECT unnest(map_point_history) AS u, generate_subscripts(map_point_history,1) AS i) act,
  LATERAL (SELECT unnest(act.u) AS u, generate_subscripts(act.u,1) AS i) loc
) TO '__OUT__/floors.parquet' (FORMAT parquet, COMPRESSION zstd);

CREATE OR REPLACE TEMP TABLE act_off AS
SELECT run_hash, act,
  coalesce(sum(n) OVER (PARTITION BY run_hash ORDER BY act
    ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS floor_offset
FROM (SELECT run_hash, act, count(*) AS n FROM read_parquet('__OUT__/floors.parquet') GROUP BY 1, 2);

-- Per-player identity + deck size: keys player_id to a character for the
-- co-op attributions, and carries deck size for the records section.
COPY (
SELECT r.run_hash, p.i AS player_idx, p.u.id AS player_id,
  upper(split_part(p.u.character,'.',-1)) AS character,
  coalesce(len(p.u.deck), 0) AS deck_size
FROM raw r,
  LATERAL (SELECT unnest(players) AS u, generate_subscripts(players,1) AS i) p
) TO '__OUT__/players.parquet' (FORMAT parquet, COMPRESSION zstd);

-- Every relic screen a seat saw: free offers (ancient, boss, events with
-- two options) and shop shelves alike, one row per option. is_shop,
-- n_options and n_picked let readers separate a real choice (fewer taken
-- than offered) from a priced shelf or a list of relics simply gained.
COPY (
SELECT r.run_hash, act.i - 1 AS act, loc.i AS floor_idx, ps.i AS player_idx,
  upper(split_part(rc.u.choice, '.', -1)) AS relic,
  coalesce(rc.u.was_picked, false) AS picked,
  list_contains([lower(x.room_type) FOR x IN loc.u.rooms], 'shop') AS is_shop,
  len(ps.u.relic_choices) AS n_options,
  len(list_filter(ps.u.relic_choices, c -> coalesce(c.was_picked, false))) AS n_picked
FROM raw r,
  LATERAL (SELECT unnest(map_point_history) AS u, generate_subscripts(map_point_history,1) AS i) act,
  LATERAL (SELECT unnest(act.u) AS u, generate_subscripts(act.u,1) AS i) loc,
  LATERAL (SELECT unnest(loc.u.player_stats) AS u,
    generate_subscripts(loc.u.player_stats,1) AS i) ps,
  LATERAL (SELECT unnest(ps.u.relic_choices) AS u) rc
WHERE rc.u.choice IS NOT NULL AND rc.u.choice <> ''
) TO '__OUT__/relic_choices.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (
SELECT r.run_hash, p.i AS player_idx,
  upper(split_part(pot.u.id, '.', -1)) AS potion,
  upper(split_part(p.u.character,'.',-1)) AS character,
  coalesce(pot.u.was_used, false) AS was_used
FROM raw r,
  LATERAL (SELECT unnest(players) AS u, generate_subscripts(players,1) AS i) p,
  LATERAL (SELECT unnest(p.u.potions) AS u) pot
) TO '__OUT__/potions.parquet' (FORMAT parquet, COMPRESSION zstd);

-- Shop-shelf potion offers only (a combat-drop "pick rate" measures slot
-- availability, not potion quality; a purchase is a real decision). One row
-- per potion seen on a shelf. Counted once per run, not once per party
-- sibling like the legacy per-player docs did.
COPY (
SELECT r.run_hash, ps.i AS player_idx,
  upper(split_part(pc.u.choice, '.', -1)) AS potion,
  coalesce(pc.u.was_picked, false) AS was_picked
FROM raw r,
  LATERAL (SELECT unnest(map_point_history) AS u) act,
  LATERAL (SELECT unnest(act.u) AS u) loc,
  LATERAL (SELECT unnest(loc.u.player_stats) AS u,
    generate_subscripts(loc.u.player_stats,1) AS i) ps,
  LATERAL (SELECT unnest(ps.u.potion_choices) AS u) pc
WHERE list_contains([lower(x.room_type) FOR x IN loc.u.rooms], 'shop')
) TO '__OUT__/shop_potions.parquet' (FORMAT parquet, COMPRESSION zstd);

-- Relic removals per seat and floor: Relic Trader trades, Sword of Stone
-- transforms, starter relics replaced by their upgrades, event removals.
-- The end-of-run belt only shows what was never taken, so these rows are
-- the only record a seat ever held them. One row per removal event; `floor`
-- is absolute via act_off, like the other per-floor extractions.
COPY (
SELECT fl.run_hash, ps.i AS player_idx,
  upper(split_part(rr.u, '.', -1)) AS relic,
  fl.act, fl.floor_idx, fl.floor
FROM (
    SELECT f.run_hash, f.act, f.floor_idx, f.players, f.room_types,
      ao.floor_offset + f.floor_idx AS floor
    FROM read_parquet('__OUT__/floors.parquet') f
    JOIN act_off ao ON f.run_hash = ao.run_hash AND f.act = ao.act
  ) fl,
  LATERAL (SELECT unnest(fl.players) AS u,
    generate_subscripts(fl.players, 1) AS i) ps,
  LATERAL (SELECT unnest(ps.u.relics_removed) AS u) rr
WHERE rr.u IS NOT NULL AND rr.u <> ''
) TO '__OUT__/relics_removed.parquet' (FORMAT parquet, COMPRESSION zstd);

-- Every relic a seat EVER held: the end-of-run belt (removed=false) plus
-- removals that were never re-acquired (removed=true, floor_removed = the
-- floor it left on; floor_added = the pickup floor when a picked
-- relic_choices row records one, else NULL). One row per (run, seat,
-- relic): a relic both removed and re-acquired keeps only its end-of-run
-- row. Column names and types before `removed` are unchanged.
CREATE OR REPLACE TEMP TABLE relic_held AS
SELECT r.run_hash, p.i AS player_idx,
  upper(split_part(rel.u.id, '.', -1)) AS relic,
  rel.u.floor_added_to_deck AS floor_added,
  upper(split_part(p.u.character,'.',-1)) AS character,
  coalesce(len(list_filter(rel.u.props.bools, b -> b.name = 'IsWax' AND b.value)) > 0, false) AS is_wax
FROM raw r,
  LATERAL (SELECT unnest(players) AS u, generate_subscripts(players,1) AS i) p,
  LATERAL (SELECT unnest(p.u.relics) AS u) rel;

COPY (
SELECT run_hash, player_idx, relic, floor_added, character, is_wax,
  false AS removed, NULL::BIGINT AS floor_removed
FROM relic_held
UNION ALL
SELECT rr.run_hash, rr.player_idx, rr.relic,
  any_value(picks.floor)::BIGINT AS floor_added,
  any_value(p.character) AS character,
  false AS is_wax,
  true AS removed,
  max(rr.floor)::BIGINT AS floor_removed
FROM read_parquet('__OUT__/relics_removed.parquet') rr
LEFT JOIN (
  SELECT rc.run_hash, rc.player_idx, rc.relic,
    min(ao.floor_offset + rc.floor_idx) AS floor
  FROM read_parquet('__OUT__/relic_choices.parquet') rc
  JOIN act_off ao ON rc.run_hash = ao.run_hash AND rc.act = ao.act
  WHERE coalesce(rc.picked, false)
  GROUP BY 1, 2, 3
) picks ON rr.run_hash = picks.run_hash
  AND rr.player_idx = picks.player_idx AND rr.relic = picks.relic
LEFT JOIN read_parquet('__OUT__/players.parquet') p
  ON rr.run_hash = p.run_hash AND rr.player_idx = p.player_idx
WHERE NOT EXISTS (
  SELECT 1 FROM relic_held h
  WHERE h.run_hash = rr.run_hash AND h.player_idx = rr.player_idx
    AND h.relic = rr.relic
)
GROUP BY 1, 2, 3
) TO '__OUT__/relics.parquet' (FORMAT parquet, COMPRESSION zstd);

DROP TABLE relic_held;

-- Shop shelves: every card, relic and potion a seat saw on a shop floor and
-- whether it was bought, with the shop's absolute floor (the same numbering
-- as floor_added_to_deck: floors of earlier acts plus the index in its act).
COPY (
SELECT run_hash, player_idx, entity_type, id, bought, floor FROM (
  SELECT fl.run_hash, ps.i AS player_idx, 'cards' AS entity_type,
    upper(split_part(cc.u.card.id, '.', -1)) AS id,
    coalesce(cc.u.was_picked, false) AS bought, fl.floor
  FROM (
    SELECT f.run_hash, f.act, f.floor_idx, f.players, f.room_types,
      ao.floor_offset + f.floor_idx AS floor
    FROM read_parquet('__OUT__/floors.parquet') f
    JOIN act_off ao ON f.run_hash = ao.run_hash AND f.act = ao.act
  ) fl,
  LATERAL (SELECT unnest(fl.players) AS u,
    generate_subscripts(fl.players, 1) AS i) ps,
    LATERAL (SELECT unnest(ps.u.card_choices) AS u) cc
  WHERE list_contains(fl.room_types, 'shop')
    AND cc.u.card.id IS NOT NULL AND cc.u.card.id <> ''
  UNION ALL
  SELECT fl.run_hash, ps.i, 'relics',
    upper(split_part(rc.u.choice, '.', -1)), coalesce(rc.u.was_picked, false), fl.floor
  FROM (
    SELECT f.run_hash, f.act, f.floor_idx, f.players, f.room_types,
      ao.floor_offset + f.floor_idx AS floor
    FROM read_parquet('__OUT__/floors.parquet') f
    JOIN act_off ao ON f.run_hash = ao.run_hash AND f.act = ao.act
  ) fl,
  LATERAL (SELECT unnest(fl.players) AS u,
    generate_subscripts(fl.players, 1) AS i) ps,
    LATERAL (SELECT unnest(ps.u.relic_choices) AS u) rc
  WHERE list_contains(fl.room_types, 'shop')
    AND rc.u.choice IS NOT NULL AND rc.u.choice <> ''
  UNION ALL
  SELECT fl.run_hash, ps.i, 'potions',
    upper(split_part(pc.u.choice, '.', -1)), coalesce(pc.u.was_picked, false), fl.floor
  FROM (
    SELECT f.run_hash, f.act, f.floor_idx, f.players, f.room_types,
      ao.floor_offset + f.floor_idx AS floor
    FROM read_parquet('__OUT__/floors.parquet') f
    JOIN act_off ao ON f.run_hash = ao.run_hash AND f.act = ao.act
  ) fl,
  LATERAL (SELECT unnest(fl.players) AS u,
    generate_subscripts(fl.players, 1) AS i) ps,
    LATERAL (SELECT unnest(ps.u.potion_choices) AS u) pc
  WHERE list_contains(fl.room_types, 'shop')
    AND pc.u.choice IS NOT NULL AND pc.u.choice <> ''
)
) TO '__OUT__/shop_items.parquet' (FORMAT parquet, COMPRESSION zstd);

-- Potion use and discard events per seat, with the absolute floor. The
-- end-of-run belt only holds what was never used, so these rows are the
-- only record of a potion that was obtained and drunk.
COPY (
SELECT fl.run_hash, fl.act, fl.floor_idx, ps.i AS player_idx,
  upper(split_part(ev.u.potion, '.', -1)) AS potion, ev.u.kind AS kind, fl.floor
FROM (
    SELECT f.run_hash, f.act, f.floor_idx, f.players,
      ao.floor_offset + f.floor_idx AS floor
    FROM read_parquet('__OUT__/floors.parquet') f
    JOIN act_off ao ON f.run_hash = ao.run_hash AND f.act = ao.act
  ) fl,
  LATERAL (SELECT unnest(fl.players) AS u,
    generate_subscripts(fl.players, 1) AS i) ps,
  LATERAL (SELECT unnest(
    list_transform(coalesce(ps.u.potion_used, []), x -> {'potion': x, 'kind': 'used'})
    || list_transform(coalesce(ps.u.potion_discarded, []), x -> {'potion': x, 'kind': 'discarded'})
  ) AS u) ev
WHERE ev.u.potion IS NOT NULL AND ev.u.potion <> ''
) TO '__OUT__/potion_events.parquet' (FORMAT parquet, COMPRESSION zstd);

DROP TABLE act_off;
DROP TABLE raw;
