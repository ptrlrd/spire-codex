-- Flat per-seat tables cut from one page's floors.parquet. The store stages
-- read these instead of unnesting the nested players column, and the rest
-- site HP lookback runs here once per page instead of as a window over
-- every floor of the lake. Absolute floors use the same numbering as
-- floor_added_to_deck: floors of earlier acts plus the index in its act.
-- Seats unnest in the select list, in lockstep with their index: a LATERAL
-- unnest plans a delim join that hashes every nested players list.
CREATE OR REPLACE TEMP TABLE ft_off AS
SELECT run_hash, act,
  coalesce(sum(n) OVER (PARTITION BY run_hash ORDER BY act
    ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)::BIGINT AS floor_offset
FROM (SELECT run_hash, act, count(*) AS n
      FROM read_parquet('__OUT__/floors.parquet') GROUP BY 1, 2);

-- Every card a seat was shown, reward screens and shop shelves alike.
-- is_card marks ids in the CARD namespace, the set the pick Elo rates.
COPY (
WITH seats AS (
  SELECT run_hash, act, floor_idx,
    unnest(range(1, len(players) + 1)) AS player_idx,
    unnest([p.card_choices FOR p IN players]) AS cc
  FROM read_parquet('__OUT__/floors.parquet')
),
shown AS (
  SELECT run_hash, act, floor_idx, player_idx, unnest(cc) AS x FROM seats
)
SELECT s.run_hash, s.act, s.floor_idx, s.player_idx,
  upper(split_part(s.x.card.id, '.', -1)) AS card,
  coalesce(s.x.was_picked, false) AS picked,
  upper(split_part(s.x.card.id, '.', 1)) = 'CARD' AS is_card,
  pl.character
FROM shown s
LEFT JOIN (
  SELECT run_hash, player_idx, min(character) AS character
  FROM read_parquet('__OUT__/players.parquet') GROUP BY 1, 2
) pl ON pl.run_hash = s.run_hash AND pl.player_idx = s.player_idx
WHERE s.x.card.id IS NOT NULL AND s.x.card.id <> ''
) TO '__OUT__/card_choices.parquet' (FORMAT parquet, COMPRESSION zstd);

-- Rest site choices with the HP the seat walked in with: the last earlier
-- floor with a known HP, else the floor's own.
COPY (
WITH seats AS (
  SELECT run_hash, act, floor_idx,
    unnest(range(1, len(players) + 1)) AS player_idx,
    unnest([struct_pack(player_id := p.player_id, hp := p.current_hp,
      mx := p.max_hp, rest := p.rest_site_choices) FOR p IN players]) AS s
  FROM read_parquet('__OUT__/floors.parquet')
),
prev AS (
  SELECT run_hash, act, floor_idx, player_idx, s,
    last_value(CASE WHEN s.hp IS NOT NULL AND coalesce(s.mx, 0) > 0
      THEN struct_pack(hp := s.hp, mx := s.mx) END IGNORE NULLS)
    OVER (PARTITION BY run_hash, s.player_id ORDER BY act, floor_idx
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS ref
  FROM seats
),
choices AS (
  SELECT run_hash, act, floor_idx, player_idx, s, ref,
    unnest(s.rest) AS choice
  FROM prev
)
SELECT c.run_hash, o.floor_offset + c.floor_idx AS floor, c.player_idx,
  c.s.player_id AS player_id, c.choice,
  CASE WHEN c.ref IS NULL THEN c.s.hp ELSE c.ref.hp END AS ref_hp,
  CASE WHEN c.ref IS NULL THEN coalesce(c.s.mx, 0) ELSE c.ref.mx END AS ref_mx
FROM choices c
JOIN ft_off o ON c.run_hash = o.run_hash AND c.act = o.act
WHERE c.choice IS NOT NULL AND c.choice <> ''
) TO '__OUT__/rest_choices.parquet' (FORMAT parquet, COMPRESSION zstd);

-- Cards a seat upgraded at a smith.
COPY (
WITH seats AS (
  SELECT run_hash, act, floor_idx,
    unnest([struct_pack(player_id := p.player_id, rest := p.rest_site_choices,
      up := p.upgraded_cards) FOR p IN players]) AS s
  FROM read_parquet('__OUT__/floors.parquet')
),
ups AS (
  SELECT run_hash, act, floor_idx, s.player_id AS player_id,
    unnest(s.up) AS card_id
  FROM seats
  WHERE list_contains(s.rest, 'SMITH')
)
SELECT u.run_hash, o.floor_offset + u.floor_idx AS floor, u.player_id,
  upper(split_part(u.card_id, '.', -1)) AS card
FROM ups u
JOIN ft_off o ON u.run_hash = o.run_hash AND u.act = o.act
WHERE upper(split_part(u.card_id, '.', 1)) = 'CARD'
) TO '__OUT__/upgrades.parquet' (FORMAT parquet, COMPRESSION zstd);

-- Event options a seat chose.
COPY (
WITH seats AS (
  SELECT run_hash, act, floor_idx,
    unnest(range(1, len(players) + 1)) AS player_idx,
    unnest([p.event_choices FOR p IN players]) AS ec
  FROM read_parquet('__OUT__/floors.parquet')
),
chosen AS (
  SELECT run_hash, act, floor_idx, player_idx, unnest(ec) AS x FROM seats
)
SELECT c.run_hash, o.floor_offset + c.floor_idx AS floor, c.player_idx,
  split_part(c.x.title."key", '.', 1) AS event,
  split_part(split_part(c.x.title."key", '.options.', 2), '.', 1) AS option
FROM chosen c
JOIN ft_off o ON c.run_hash = o.run_hash AND c.act = o.act
WHERE c.x.title."table" = 'events'
  AND c.x.title."key" LIKE '%.options.%'
) TO '__OUT__/event_choices.parquet' (FORMAT parquet, COMPRESSION zstd);

DROP TABLE ft_off;
