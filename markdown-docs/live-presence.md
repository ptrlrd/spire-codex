# Live presence ("who is in a run right now")

The in-game SpireCodex mod heartbeats each player's in-progress run to the backend every
~30 seconds. The backend keeps one Mongo doc per live player with a 90 second TTL, so
quits and crashes fall off the list on their own. This doc is the contract for building
the frontend view; the backend half is done (`app/routers/presence.py`,
`app/services/presence_db.py`).

## Endpoints

### GET /api/presence/active

Public. The roster for a "Live now" rail or /live page. Deepest run first.

```json
{
  "count": 2,
  "players": [
    {
      "steam_id": "7656119...",
      "username": "ptrlrd",
      "character": "NECROBINDER",
      "ascension": 3,
      "act": 2, "act_floor": 7, "total_floor": 23,
      "hp": 23, "max_hp": 75, "gold": 142,
      "screen": "combat",
      "seed": "ABC123",
      "player_count": 1,
      "sts2_version": "v0.103.3+460a0ece",
      "started_at": "2026-06-11T19:02:11+00:00",
      "updated_at": "2026-06-11T19:14:41+00:00"
    }
  ]
}
```

`?limit=` caps the list (default 50, max 100). Numeric fields can be absent on a sparse
heartbeat; render defensively. `started_at` is the first heartbeat of the session, good
for "climbing for 41 min".

### GET /api/presence/{steam_id}

Public. The full live doc for one player: everything above plus `deck` (card ids, `+`
suffix = upgraded, e.g. `"STRIKE+"`), `relics`, and `potions` (bare ids). 404 when the
player is not live. This is the data for a per-player live run view (spectator-lite,
refresh every 10-15s).

Combat context (v2, absent between fights):

- `turn`: the combat round number
- `fighting`: bare ids of the living enemies, e.g. `["GREMLIN_NOB"]` (kept for the
  lightweight roster chip)
- `block`, `energy`, `max_energy`: the local player's current block and energy
  (`block`/`max_energy` are sent the whole run; `energy` is combat-only)
- `draw_count`, `discard_count`, `exhaust_count`: pile sizes (combat-only)
- `draw_pile`, `discard_pile`, `exhaust_pile`: the card ids in each pile (combat-only),
  for a hover-to-see-contents on the pile counts
- `hand`: card ids in the current hand, e.g. `["STRIKE", "DEFEND+"]` (combat-only)
- `damage_dealt`, `damage_dealt_this_turn`, `damage_taken`, `biggest_hit`: live DPS
- `player_powers`: the local player's combat buffs/debuffs as `[{id, amount}]`
  (combat-only; `[]` means "in combat, no powers")
- `orbs`, `orb_slots`: the player's channeled orbs (orb characters). `orbs` is
  `[{id, passive, evoke}]` in slot order (`passive` = per-turn value, `evoke` =
  on-evoke value); `orb_slots` is the current slot capacity, so empty slots can be
  drawn (e.g. 2/3 filled). Combat-only; `[]`/absent for non-orb characters.
- `turn_side`: whose turn it is in combat -- `"player"` or `"enemy"`; the frontend
  highlights (glows) the active side's token. Combat-only.
- `run_time`: elapsed run seconds (freezes at win); present the whole run, distinct
  from the wall-clock `started_at`
- `modifiers`: bare ids of the run's daily/custom mutators (whole run)

Co-op only (sent when `player_count > 1`): `players` is the per-seat vitals,
`[{character, hp, max_hp, block, gold, alive, deck_size, relic_count, potion_count,
is_me}]`; `is_me` marks the local seat.

`loot` (v6, present on the combat/reward screen, transient): the rewards on offer —
`{gold, cards: [ids], relics: [ids], potions: [ids], card_removal}` (`card_removal`
is a bool/count for the removal option). On a **scroll-box bundle** screen
(ScrollBoxes relic, v8) `loot` also carries `packs: [[ids], [ids]]` — each pack a
list of card ids the player picks one whole pack from; `cards` is empty then, so
the frontend renders the packs as labelled groups instead of the flat card row.

`route` (v6, the act's structure, persists per act like the map): `{boss, ancient,
elites: [], monsters: [], events: []}`. Each node is `{id, name?, room_type?}` plus
`col`/`row`/`floor` when the mod sends a position, so a node can be matched to the map.

Rich combat enemies (v5, absent between fights): `enemies` is the per-player combat
panel data, each enemy carrying hp/block and its upcoming intent(s):

```json
"enemies": [
  {"id": "GREMLIN_NOB", "name": "Gremlin Nob", "hp": 52, "max_hp": 85,
   "intents": [{"type": "attack", "dmg": 16, "hits": 2}]},
  {"id": "SPIKER", "name": "Spiker", "hp": 42, "max_hp": 42, "block": 5,
   "intents": [{"type": "defend"}, {"type": "buff"}]}
]
```

`intents` is a list because one move can do several things (attack + buff). Each intent's
`type` is the codex intent category (`attack`, `defend`, `buff`, `debuff`, `heal`,
`escape`, `summon`, `carddebuff`, `deathblow`, `hidden`, `unknown`); render the game's
intent icon from it. For attacks, `dmg` is the base per-hit damage and `hits` the strike
count, so `dmg:16, hits:2` is "16 x2" = 32 incoming (`dmg` is the base value; in-combat
modifiers like strength/vulnerable aren't folded in). Non-attacks omit `dmg`/`hits` but may
carry `amount` — the magnitude of the move, e.g. the block a `defend` will gain — rendered
next to the intent icon.
`name` is the resolved enemy name (fall back to the id lookup if absent), `block` the
enemy's current block. Each enemy may also carry `powers` (`[{id, amount}]`, same shape as
`player_powers`) for its own buffs/debuffs (vulnerable, weak, strength, ...), rendered as
icons on the token. All fields except the intent `type` are optional. Excluded from
`/active` (per-player only) and cleared when combat ends (same null-to-clear rule as
`turn`/`fighting`).

Play-by-play ticker (v2): `events` is a rolling window (last 50) of moments, oldest
first, appended by each heartbeat:

```json
"events": [
  {"k": "combat", "turn": 1, "t": 1781650000},
  {"k": "card", "v": "WHIRLWIND", "turn": 2, "t": 1781650031},
  {"k": "potion", "v": "FIRE_POTION", "turn": 3, "t": 1781650055},
  {"k": "victory", "t": 1781650070},
  {"k": "buy", "v": "FROZEN_EYE", "t": 1781650120}
]
```

Kinds: `card` (played), `potion` (used), `combat` (fight started; `v` = the encounter
id, resolve to its first monster for a portrait), `victory`, `buy` (shop purchase; `v`
is the relic/card/potion id, absent for card-removal service), `loot` (reward taken; `v`
= a potion/card/relic id, or a gold amount as a numeric string), `relic`/`ancient` (a
relic obtained; `v` = relic id), `remove` (a card left the deck; `v` = the removed card),
`upgrade` (a card upgraded; `v` = card id), `rest` (rested at a campfire), `event`
(entered an event room; `v` = the event id), `choice` (an event option picked; `v` = the
resolved option label, already localized in the player's language), `death` (the player
died), `act` (entered a new act). `v` is a bare entity id for the usual name/image
lookups (except `choice`, which is a display label). Render as a feed: "Turn 2 - played
Whirlwind", "Event: Abyssal Baths", "Removed Strike".

Heartbeats are event-driven with a 2s debounce: a card play reaches the server in
~2-3s, with a 5s cadence floor during combat (enemy HP, turn) and 15s between rooms.
Poll this endpoint at 3-5s for a live-feeling ticker; poll `/active` at 10-15s (the
roster doesn't carry events, so it doesn't need to be hot).

### The act map (v3, for a spectator mini-map)

The per-player doc carries the current act's map graph and the route taken so far:

```json
"map": {
  "act": 2,
  "nodes": [[0, 0, "monster"], [1, 0, "monster"], [0, 1, "elite"], [2, 6, "boss"]],
  "edges": [[0, 0, 0, 1], [0, 0, 1, 1], [1, 0, 1, 1]]
},
"path": [[3, 0], [3, 1], [2, 2]],
"pos": [2, 2]
```

- `map.nodes`: `[col, row, type]` per node. Types: `monster`, `elite`, `boss`, `shop`,
  `treasure`, `restsite`, `event`/`unknown`, `ancient`. Lowercase; render defensively
  (a type you don't recognize is just a generic node).
- `map.edges`: `[col, row, childCol, childRow]`, a directed link from a node to a node
  one row deeper. Build the DAG from these.
- `path`: visited coords in travel order; `pos`: the player's current coord (absent
  while moving between nodes). Highlight `path` and mark `pos` on the mini-map.
- `(col, row)` is the game's own grid: `row` is act depth (0 = act start, increasing
  toward the boss), `col` is the horizontal lane.
- The bulky `map` graph is sent once per act (it's static) and omitted from `/active`;
  `path`/`pos` ride every beat and DO appear on `/active` for a roster progress hint.

`reveals` (per-node, progressive) rides every beat next to `path`/`pos`: one
`[col, row, room_type, encounter_id]` per VISITED node — the ACTUAL resolved room type
(so a `?` node shows what it became) and the encounter/event id (`null` for
shop/rest/treasure). Same `col`/`row` space as `nodes[]`, so it overlays the map directly,
and it grows as the player walks. Resolve `encounter_id` via `/api/encounters` to the
encounter's first monster, then that monster's portrait, for the node art. The game binds an
encounter to a node only on entry, so an unvisited node's enemy is genuinely unknowable
except the boss and ancient (single fixed nodes: join the boss/ancient node coord in
`nodes[]` with `route.boss` / `route.ancient`). Omitted from `/active`.

### Live event (v4, present only in an event room)

When `screen == "event"`, the per-player doc carries the event the player is reading and
the options on offer. The mod ships the ALREADY-LOCALIZED text the player sees, so render
it directly (no need to resolve from the codex event data; the `id` is there if you want
to link to the event page).

```json
"event": {
  "id": "ABYSSAL_BATHS",
  "title": "Abyssal Baths",
  "prompt": "You come upon a hot spring rumored to wash away the past...",
  "options": [
    {"key": "BATHE", "text": "[Bathe] Lose all but 1 Max HP. Become Cleansed.", "locked": false, "proceed": false, "chosen": false},
    {"key": "LEAVE", "text": "Leave", "locked": false, "proceed": true, "chosen": false}
  ]
}
```

- `title`/`prompt` are resolved localized strings (may be absent on a sparse beat).
- each option: `key` (stable loc key), `text` (the localized button label), `locked` (greyed
  out / requirement unmet), `proceed` (the leave/continue option), `chosen` (already picked).
- `desc`, `card`, `relic` (all optional): `desc` is the resolved consequence text with numbers
  filled in ("Lose 3 HP"); `card` is a card the option previews — the specific card a
  "lose a card" option will take, knowable because the game pre-rolls and hovers it; `relic`
  is a relic the option grants. Render the card/relic as images beside the option.
- Cleared when the player leaves the event (the mod sends `event: null` -> server `$unset`).
  Omitted from `/active`.

### Live shop (v4, present only in a merchant room)

When `screen == "merchant"`, the doc carries the full inventory. Item ids are bare
(`"FROZEN_EYE"`) -> resolve name/image via the usual card/relic/potion lookups, same as
the deck. Costs are the live gold price.

```json
"shop": {
  "cards":   [{"id": "WHIRLWIND", "cost": 75, "stocked": true, "on_sale": false, "slot": "character"}],
  "relics":  [{"id": "FROZEN_EYE", "cost": 143, "stocked": true}],
  "potions": [{"id": "FIRE_POTION", "cost": 50, "stocked": true}],
  "removal": {"cost": 75, "stocked": true}
}
```

- `stocked: false` means the slot was already bought (its `id` is then absent). Show it as
  sold/empty so viewers see purchases happen live.
- `on_sale` (cards only) is the 50%-off discount; relics/potions never have it.
- `slot` tags a card `"character"` (one of the 5 typed slots) or `"colorless"`.
- `removal` is the card-removal service (null if this shop has none). Cleared on leaving
  the shop; omitted from `/active`.

### Live rest (v7, present only at a rest site)

When `screen == "rest"`, the doc carries the campfire's options.

```json
"rest": {
  "options": [
    {"id": "HEAL", "title": "Rest", "enabled": true},
    {"id": "SMITH", "title": "Smith", "enabled": true}
  ]
}
```

- each option: `id` (stable, e.g. `HEAL`/`SMITH`/`DIG`/...), `title` (the localized button
  label), `enabled` (false = greyed / unavailable). This is the button state the player is
  choosing between; the actual rest/smith outcome still arrives via the `rest`/`upgrade`
  ticker kinds.
- Cleared when the player leaves the campfire (mod sends `rest: null` -> server `$unset`).
  Omitted from `/active`.

Note the singular `event`/`shop`/`rest` objects are distinct from the plural `events`
ticker array above.

### Death (v7, present once the run ends in a death)

```json
"death": { "line": "Not quite the top", "by": "THE_CHAMP" }
```

- `line` is the killer's **already-localized** death quote (free text, the line the game
  shows on the death screen); `by` is the killer's id (for the portrait/name lookup).
- The frontend renders a red death screen with the quote. Send it on the death beat;
  it rides until the doc expires. Omitted from `/active`.

### Floor history (v8, the map's previous-node hover)

The live mirror of what the game shows when you hover a visited node on the map: one
entry per cleared floor, for the whole run. `floor_history` accumulates (a full run is
< 60 floors) and **excludes the floor being stood on**. Run-level, so it rides every beat
and is never `$unset` (the doc is dropped when the run ends).

```json
"floor_history": [
  {
    "floor": 4, "act": 1, "type": "monster", "encounter_id": "SHRINKER_BEETLE",
    "hp": 45, "max_hp": 70, "gold": 54, "turns": 4, "damage_taken": 4,
    "rewards": [{"kind": "card", "id": "HAZE"}],
    "skipped": [{"kind": "card", "id": "SPEEDSTER"}, {"kind": "card", "id": "ANTICIPATE"}]
  }
]
```

- `floor` is the global run floor (1-based, cumulative across acts); `act` is 1-indexed;
  `type` is `monster|elite|boss|shop|treasure|restsite|event|ancient|unknown`.
- `encounter_id` (bare id, resolve to a title) is present on combat/event floors, omitted
  for shop/rest/treasure. `turns`/`damage_taken`/`healed`/`gold_spent`/`gold_gained` are
  omitted when 0.
- `rewards` were taken this floor, `skipped` were offered and left behind; each is
  `{kind: card|relic|potion, id}` with bare ids (per-floor list capped at 24).
- The frontend matches entries to map nodes by visit order within the act (the player
  clears one node per depth), and shows the card on hover of a **visited** node only.
  Omitted from `/active` (detail endpoint only).

### Co-op turn state + pets (v8)

Two combat additions for co-op and summoner runs.

`players[]` (co-op only, run-level) now also carries per-seat combat turn state:

```json
"players": [
  {"character": "NECROBINDER", "hp": 60, "max_hp": 70, "block": 0, "gold": 120,
   "energy": 3, "alive": true, "ended_turn": false, "deck_size": 22,
   "relic_count": 5, "potion_count": 1, "is_me": true}
]
```

- `energy` and `ended_turn` are 0/false outside combat. Combine `ended_turn` with the
  global `turn_side` (`player`/`enemy`): during the player side, a seat with
  `ended_turn: false` is still taking its turn, `true` means locked in and waiting.

`pets[]` (present only while a pet is out in combat, transient) is the friendly summons:

```json
"pets": [
  {"id": "OSTY", "name": "Osty", "hp": 18, "max_hp": 30, "block": 0, "alive": true, "owner": 0}
]
```

- `owner` indexes into `players[]` (0 in single-player), so a co-op pet attaches to the
  right seat. ids are bare (`OSTY`). Combat-only: cleared (`$unset`) when a fight ends.
  Omitted from `/active` (detail endpoint only). It is generic, so it picks up any future
  pet, not just Osty.

### POST /api/presence

Mod-only; requires the Steam JWT (`Authorization: Bearer`). The frontend never calls it.
503 until MONGO_URL is set, 401 without a valid token.

## Notes for the frontend

- Poll `/active` at 10-15s for the roster; poll a player's `/{steam_id}` at 3-5s for a
  live-feeling ticker (the mod beats event-driven, ~2-3s after a play, see above). No
  websockets.
- Entries are at most 90s stale by construction; no client-side freshness math needed.
- `screen` is the mod's coarse location: combat, map, merchant, event, rest, etc.
- Privacy is handled upstream: only players who opted into uploads (consent gate), kept
  Share live status on, and are Steam-signed-in ever appear here.
- Card/relic/potion ids are bare game ids (same convention as run docs) — the usual
  image/name lookups apply.
