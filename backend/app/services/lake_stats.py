"""Read-only DuckDB access to the analytics lake.

Every analytics surface serves from here: the community payload and cube,
the entity store and cube, encounter stats, deep item tables, charts, the
leaderboard boards, and the frame. Requires the lake mounted at LAKE_DIR
(default /lake) — built by the ingest box's cycle and delivered by the
artifact bus. Serving reads stored artifacts; only builders touch parquet.
"""

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

LAKE_DIR = Path(os.environ.get("LAKE_DIR", "/lake"))
# "serve": /api/runs/community-stats builds its payload from the lake (the
# snapshot stays as automatic fallback for unsupported brackets and errors).

_OFFICIAL = "('IRONCLAD','SILENT','DEFECT','NECROBINDER','REGENT')"


_SERVE_FILES = (
    "runs.parquet",
    "excluded.parquet",
    "floors.parquet",
    "players.parquet",
)


def available(*extra: str) -> bool:
    for name in ("runs.parquet",) + extra:
        if not (LAKE_DIR / name).exists():
            return False
    try:
        import duckdb  # noqa: F401
    except ImportError:
        return False
    return True


_SCRATCH_DB = "build.duckdb"


def _connect(build: bool = False):
    """Serving reads get a small in-memory connection. Ingest-time builds
    attach to the shared scratch database file, so anything materialized
    once per ingest (the pfloors unnest) is visible to every builder's
    connection, with a bigger cap plus a spill directory."""
    import duckdb

    con = duckdb.connect(str(LAKE_DIR / _SCRATCH_DB)) if build else duckdb.connect()
    if build:
        # Tunable so quiet-box runs can burst (LAKE_BUILD_MEMORY=4500MB with
        # the 5g container leaves the observed ~300-500MB native overhead).
        mem = os.environ.get("LAKE_BUILD_MEMORY", "") or "3500MB"
        con.execute(f"SET memory_limit='{mem}'")
        # The shared on-disk scratch keeps one temp dir per process: once any
        # connection has spilled (build.sql does), DuckDB refuses to set it
        # again — even to the same path. First connection wins; later ones
        # inherit it, so a refusal here is fine. The mkdir is load-bearing:
        # the cycle start rmtree's the spill dir, and a standalone stage run
        # that can't spill turns every over-cap sort into an OOM.
        try:
            (LAKE_DIR / "tmp").mkdir(parents=True, exist_ok=True)
            con.execute(f"SET temp_directory='{LAKE_DIR}/tmp'")
        except Exception:
            pass
        con.execute("SET preserve_insertion_order=false")
    else:
        con.execute("SET memory_limit='500MB'")
    # Builds use the container's full 5-core allowance — the cgroup CPU
    # weight already makes the ingest yield to serving, so a lower thread
    # count here was a second, redundant brake. Serving reads stay at 2.
    con.execute("SET threads=5" if build else "SET threads=2")
    return con


# ── Serve mode: the full community-stats payload from the lake ────────────────

_PAYLOAD_TTL_SECONDS = 60.0
_payload_cache: dict[str, tuple[float, dict]] = {}

_ELIGIBLE_SQL = """
CREATE OR REPLACE TEMP VIEW eligible AS
SELECT r.*
FROM read_parquet('{lake}/runs.parquet') r
ANTI JOIN read_parquet('{lake}/excluded.parquet') x ON r.run_hash = x.run_hash
WHERE r.ascension BETWEEN 0 AND 10
  AND r.character IN ('IRONCLAD','SILENT','DEFECT','NECROBINDER','REGENT')
"""

_PFLOORS_SQL = """
CREATE OR REPLACE TEMP VIEW pfloors AS
-- p keeps ONLY the struct fields the payload queries read: carrying the
-- whole player struct (card ids, upgraded_cards, ...) made every scan and
-- the hp window sort pay for bytes nobody consumed. card_choices collapses
-- to its was_picked bools (picks_list) -- the one field anything reads.
SELECT f.run_hash, f.act, f.floor_idx,
  struct_pack(
    player_id := ps.u.player_id,
    current_hp := ps.u.current_hp,
    max_hp := ps.u.max_hp,
    event_choices := ps.u.event_choices,
    rest_site_choices := ps.u.rest_site_choices,
    ancient_choice := ps.u.ancient_choice,
    cards_removed := ps.u.cards_removed
  ) AS p,
  [coalesce(c.was_picked, false) FOR c IN ps.u.card_choices] AS picks_list,
  e.win, lower(e.character) AS run_char, e.cell,
  len(list_filter(f.room_models, m -> m LIKE '%THIEVING_HOPPER%')) > 0 AS hopper_floor
FROM read_parquet('{lake}/floors.parquet') f
JOIN cells e ON f.run_hash = e.run_hash,
LATERAL (SELECT unnest(f.players) AS u) ps
"""

_PID_CHAR_SQL = """
CREATE OR REPLACE TEMP VIEW pid_char AS
SELECT run_hash, player_id, lower(character) AS character
FROM read_parquet('{lake}/players.parquet')
WHERE player_id IS NOT NULL AND character <> ''
"""


def _cells_table_exists(con) -> bool:
    return bool(
        con.execute(
            "SELECT count(*) FROM duckdb_tables() WHERE table_name = 'cells'"
        ).fetchone()[0]
    )


def _ensure_cells(con, lake: str) -> None:
    """The cells view, unless the build session already materialized it as
    a real table -- every builder re-expanded the view (runs scan + the
    user_wr aggregation) per query before this."""
    if not _cells_table_exists(con):
        con.execute(_CELLS_SQL.format(lake=lake))


def _pfloors_table_exists(con) -> bool:
    return bool(
        con.execute(
            "SELECT count(*) FROM duckdb_tables() WHERE table_name = 'pfloors'"
        ).fetchone()[0]
    )


def _prepare_sources(con, lake: str) -> None:
    """Views every builder needs. pfloors is only created as a per-session
    view when no materialized table exists in the scratch database -- the
    session prepared by the ingest materializes it once and every later
    connection reuses it instead of re-unnesting 45M player-floor rows."""
    con.execute(_ELIGIBLE_SQL.format(lake=lake))
    _ensure_cells(con, lake)
    con.execute(_PID_CHAR_SQL.format(lake=lake))
    if not _pfloors_table_exists(con):
        con.execute(_PFLOORS_SQL.format(lake=lake))


def prepare_build_session():
    """Ingest-time: materialize the shared pfloors unnest once. Returns the
    connection; pair it with cleanup_build_session() when the stores are
    done."""
    con = _connect(build=True)
    lake = str(LAKE_DIR)
    con.execute(_ELIGIBLE_SQL.format(lake=lake))
    con.execute("DROP TABLE IF EXISTS cells")
    con.execute(_CELLS_SQL.format(lake=lake))
    con.execute("CREATE TABLE cells_mat AS SELECT * FROM cells")
    con.execute("DROP VIEW cells")
    con.execute("ALTER TABLE cells_mat RENAME TO cells")
    con.execute("DROP TABLE IF EXISTS run_exp")
    con.execute(_RUN_EXP_SQL)
    con.execute("DROP TABLE IF EXISTS pfloors")
    body = _PFLOORS_SQL.format(lake=lake).replace(
        "CREATE OR REPLACE TEMP VIEW pfloors AS", "CREATE TABLE pfloors AS", 1
    )
    con.execute(body)
    n = con.execute("SELECT count(*) FROM pfloors").fetchone()[0]
    logger.info("build session prepared: pfloors materialized (%d rows)", n)
    return con


def cleanup_build_session(con=None) -> None:
    own = con is None
    if own:
        con = _connect(build=True)
    try:
        con.execute("DROP TABLE IF EXISTS pfloors")
        con.execute("DROP TABLE IF EXISTS cells")
        con.execute("DROP TABLE IF EXISTS run_exp")
        con.execute("DROP TABLE IF EXISTS relic_choice_rows")
    finally:
        if own:
            con.close()


_PAYLOAD_PATH_NAME = "community_payload.json"
_CUBE_PATH_NAME = "community_cube.json.gz"

# Finest-grain bracket cells: game mode x player count x A10 x winrate band.
# Every eligible run lands in exactly one cell, so any bracket combination
# folds from cell sums -- the lattice the snapshot could never materialize.
_CELLS_SQL = """
CREATE OR REPLACE TEMP VIEW user_wr AS
SELECT lower(username) AS uname, count(*) FILTER (win) * 1.0 / count(*) AS wr
FROM read_parquet('{lake}/runs.parquet') r
ANTI JOIN read_parquet('{lake}/excluded.parquet') x ON r.run_hash = x.run_hash
WHERE username IS NOT NULL AND username <> ''
GROUP BY 1 HAVING count(*) >= 5;
CREATE OR REPLACE TEMP VIEW cells AS
SELECT e.*,
  lower(coalesce(e.game_mode, 'standard')) || '|' ||
  least(coalesce(e.player_count, 1), 4)::VARCHAR || '|' ||
  (coalesce(e.ascension, 0) = 10)::INT::VARCHAR || '|' ||
  (CASE WHEN coalesce(e.ascension, 0) = 10 AND u.wr > 0.75 THEN 3
        WHEN coalesce(e.ascension, 0) = 10 AND u.wr > 0.50 THEN 2
        WHEN coalesce(e.ascension, 0) = 10 AND u.wr > 0.30 THEN 1
        ELSE 0 END)::VARCHAR || '|' ||
  coalesce(trim(e.build_id), '') AS cell
FROM eligible e
LEFT JOIN user_wr u ON lower(e.username) = u.uname
"""

# Entity membership is SEAT-set, not per-copy: DISTINCT (run, seat, entity)
# — a deck with 5 Strikes is ONE pick for that seat, so win rate stays "win
# rate when X is in your deck", and a 4P run is four seats so co-op
# inclusion rates divide by seats, not runs. The character is the seat's own.
_MEMBERSHIP_SQL = """
SELECT m.{col}, coalesce(upper(m.character), e.character, ''),
  count(*), count(*) FILTER (e.win),
  max(e.submitted_at), arg_max(m.run_hash, e.submitted_at)
FROM (
  SELECT DISTINCT run_hash, player_idx, {col}, character
  FROM read_parquet('{lake}/{table}.parquet')
  WHERE {col} IS NOT NULL AND {col} <> ''{where}
) m
JOIN eligible e ON m.run_hash = e.run_hash
GROUP BY 1, 2
"""

# Per seat: the player's leave-one-out win rate over their other eligible
# runs with the same A10 flag (five or more of them), the expectation the
# lift metric subtracts. Keyed by the submitter's username like user_wr.
_RUN_EXP_SQL = """
CREATE TABLE IF NOT EXISTS run_exp AS
WITH u AS (
  SELECT lower(username) AS uname, coalesce(ascension, 0) = 10 AS a10,
    count(*) AS n, count(*) FILTER (win) AS w
  FROM eligible
  WHERE username IS NOT NULL AND username <> ''
  GROUP BY 1, 2
)
SELECT e.run_hash, (u.w - e.win::INT) * 1.0 / (u.n - 1) AS exp
FROM eligible e
JOIN u ON lower(e.username) = u.uname
  AND (coalesce(e.ascension, 0) = 10) = u.a10
WHERE u.n >= 6
"""

# Five counters per (cell, entity): seats, wins, seats with an expectation,
# wins among those, and the summed expectation -- lift's inputs ride along.
_CUBE_MEMBERSHIP_SQL = """
SELECT c.cell, m.{col}, coalesce(upper(m.character), c.character, ''),
  count(*), count(*) FILTER (c.win),
  count(x.exp), count(*) FILTER (c.win AND x.exp IS NOT NULL),
  round(coalesce(sum(x.exp), 0), 3)
FROM (
  SELECT DISTINCT run_hash, player_idx, {col}, character
  FROM read_parquet('{lake}/{table}.parquet')
  WHERE {col} IS NOT NULL AND {col} <> ''{where}
) m
JOIN cells c ON m.run_hash = c.run_hash
LEFT JOIN run_exp x ON m.run_hash = x.run_hash
GROUP BY 1, 2, 3
"""

_CUBE_RUNS_SQL = """
SELECT c.cell, count(*), count(*) FILTER (c.win),
  sum(coalesce(n.np, c.player_count, 1))
FROM cells c
LEFT JOIN (
  SELECT run_hash, count(*) AS np
  FROM read_parquet('{lake}/players.parquet') GROUP BY 1
) n ON c.run_hash = n.run_hash
GROUP BY 1
"""

_CUBE_SHOPS_SQL = """
SELECT c.cell, s.entity_type, s.id,
  count(*), count(*) FILTER (s.bought),
  count(*) FILTER (s.bought AND c.win),
  count(x.exp) FILTER (s.bought),
  count(*) FILTER (s.bought AND c.win AND x.exp IS NOT NULL),
  round(coalesce(sum(x.exp) FILTER (s.bought), 0), 3)
FROM read_parquet('{lake}/shop_items.parquet') s
JOIN cells c ON s.run_hash = c.run_hash
LEFT JOIN run_exp x ON s.run_hash = x.run_hash
WHERE s.id IS NOT NULL AND s.id <> ''
GROUP BY 1, 2, 3
"""

_CUBE_EVENTS_SQL = """
SELECT h.cell, split_part((ec.u).title."key", '.', 1),
  split_part(split_part((ec.u).title."key", '.options.', 2), '.', 1),
  count(*), count(*) FILTER (h.win),
  count(x.exp), count(*) FILTER (h.win AND x.exp IS NOT NULL),
  round(coalesce(sum(x.exp), 0), 3)
FROM pfloors h
LEFT JOIN run_exp x ON h.run_hash = x.run_hash,
LATERAL (SELECT unnest((h.p).event_choices) AS u) ec
WHERE (ec.u).title."table" = 'events'
  AND (ec.u).title."key" LIKE '%.options.%'
GROUP BY 1, 2, 3
"""

_POTION_USED_SQL = """
SELECT u.potion, count(*)
FROM (
  SELECT run_hash, player_idx, potion
  FROM read_parquet('{lake}/potions.parquet')
  WHERE potion IS NOT NULL AND potion <> '' AND coalesce(was_used, false)
  GROUP BY 1, 2, 3
) u
JOIN eligible e ON u.run_hash = e.run_hash
GROUP BY 1
"""

_CUBE_POTION_USED_SQL = """
SELECT c.cell, u.potion, count(*)
FROM (
  SELECT run_hash, player_idx, potion
  FROM read_parquet('{lake}/potions.parquet')
  WHERE potion IS NOT NULL AND potion <> '' AND coalesce(was_used, false)
  GROUP BY 1, 2, 3
) u
JOIN cells c ON u.run_hash = c.run_hash
GROUP BY 1, 2
"""

_CUBE_REST_SQL = """
WITH hp AS (
  SELECT run_hash, cell, act, floor_idx, p, win,
    last_value(CASE WHEN (p).current_hp IS NOT NULL
      AND coalesce((p).max_hp, 0) > 0 THEN
      struct_pack(hp := (p).current_hp, mx := (p).max_hp) END IGNORE NULLS)
    OVER (PARTITION BY run_hash, (p).player_id ORDER BY act, floor_idx
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS hp_prev
  FROM pfloors
),
choices AS (
  SELECT h.run_hash, h.cell, rc.u AS choice, h.win,
    coalesce(h.hp_prev, struct_pack(hp := (h.p).current_hp,
      mx := coalesce((h.p).max_hp, 0))) AS ref
  FROM hp h, LATERAL (SELECT unnest((h.p).rest_site_choices) AS u) rc
  WHERE rc.u IS NOT NULL AND rc.u <> ''
)
SELECT c.cell, c.choice, count(*), count(*) FILTER (c.win),
  count(*) FILTER (ref.mx > 0 AND ref.hp IS NOT NULL AND ref.hp * 2 < ref.mx),
  count(x.exp), count(*) FILTER (c.win AND x.exp IS NOT NULL),
  round(coalesce(sum(x.exp), 0), 3)
FROM choices c LEFT JOIN run_exp x ON c.run_hash = x.run_hash
GROUP BY 1, 2
"""

_WAX_ONLY = " AND coalesce(is_wax, false)"
_NO_WAX = " AND NOT coalesce(is_wax, false)"


def _relics_have_wax(con) -> bool:
    try:
        cols = [
            d[0]
            for d in con.execute(
                f"SELECT * FROM read_parquet('{LAKE_DIR}/relics.parquet') LIMIT 0"
            ).description
        ]
    except Exception:
        return False
    return "is_wax" in cols


def _membership_where(table: str, con, wax: bool = False) -> str:
    """The wax guard for the relics table: base rows drop wax copies and the
    wax section keeps only them. Empty for other tables or a lake built
    before the flag existed."""
    if table != "relics" or not _relics_have_wax(con):
        return "" if not wax else " AND false"
    return _WAX_ONLY if wax else _NO_WAX


def _ensure_run_exp(con) -> None:
    con.execute(_RUN_EXP_SQL)


_MODE_KEYS = frozenset(("standard", "daily", "custom"))
_PLAYER_KEYS = {"solo": "1", "2p": "2", "3p": "3", "4p": "4"}
_SKILL_KEYS = {"a10": 0, "wr30": 1, "wr50": 2, "wr75": 3}

_cube_cache: tuple[float, dict, dict] | None = None


_VERSION_RE = None


def _parse_lake_bracket(bracket: str | None):
    """(mode, player, skill, version) slots, all-None for the plain payload,
    or None when any part is outside the cube's axes -- those fall back to
    the snapshot path."""
    global _VERSION_RE
    if _VERSION_RE is None:
        import re

        _VERSION_RE = re.compile(r"v\d+(\.\d+)*")
    if bracket in (None, "", "all"):
        return (None, None, None, None)
    mode = player = skill = version = None
    for part in bracket.split(":"):
        if part == "all" or part == "":
            continue
        if part in _MODE_KEYS and mode is None:
            mode = part
        elif part in _PLAYER_KEYS and player is None:
            player = _PLAYER_KEYS[part]
        elif part in _SKILL_KEYS and skill is None:
            skill = _SKILL_KEYS[part]
        elif _VERSION_RE.fullmatch(part) and version is None:
            version = part
        else:
            return None
    return (mode, player, skill, version)


_CHARACTER_KEYS = frozenset(("ironclad", "silent", "defect", "necrobinder", "regent"))


def _split_character(bracket: str | None) -> tuple[str | None, str | None]:
    """Peel a character token ("solo:a10:ironclad") off a bracket: the
    community cube carries the run's character as a sixth cell part."""
    if not bracket:
        return bracket, None
    parts = bracket.split(":")
    chars = [p for p in parts if p in _CHARACTER_KEYS]
    if len(chars) > 1:
        return None, None
    if not chars:
        return bracket, None
    rest = ":".join(p for p in parts if p not in _CHARACTER_KEYS)
    return rest or "all", chars[0]


def community_payload(bracket: str | None = None) -> dict | None:
    """Community-stats payload from the ingest-built store: the plain
    payload file for the all bracket, or any mode x players x skill x
    version combination folded from the cube. None (snapshot fallback)
    for unknown keys, missing stores, or any error. Serving never builds
    from parquet inline."""
    try:
        bracket, character = _split_character(bracket)
        parsed = _parse_lake_bracket(bracket)
        if parsed is None:
            return None
        import json

        mode, player, skill, version = parsed
        if parsed == (None, None, None, None) and character is None:
            path = LAKE_DIR / _PAYLOAD_PATH_NAME
            if not path.exists():
                return None
            mtime = path.stat().st_mtime
            hit = _payload_cache.get("all")
            if hit and hit[0] == mtime:
                return hit[1]
            payload = json.loads(path.read_text())
            _payload_cache["all"] = (mtime, payload)
            return payload

        import gzip

        global _cube_cache
        path = LAKE_DIR / _CUBE_PATH_NAME
        if not path.exists():
            return None
        mtime = path.stat().st_mtime
        if not _cube_cache or _cube_cache[0] != mtime:
            with gzip.open(path, "rt", encoding="utf-8") as f:
                _cube_cache = (mtime, json.load(f), {})
        _, raw, folded = _cube_cache
        ckey = f"{mode}|{player}|{skill}|{version}|{character}"
        hit = folded.get(ckey)
        if hit is not None:
            return hit
        accs = []
        for cell_id, acc_raw in (raw.get("cells") or {}).items():
            parts = cell_id.split("|")
            if len(parts) == 4 and version is not None:
                return None
            if character is not None and (len(parts) < 6 or parts[5] != character):
                if len(parts) < 6:
                    return None
                continue
            m, pc, a10, band = parts[:4]
            ver = parts[4] if len(parts) > 4 else ""
            if mode is not None and m != mode:
                continue
            if player is not None and pc != player:
                continue
            if skill is not None:
                if a10 != "1":
                    continue
                if skill > 0 and int(band) < skill:
                    continue
            if version is not None and ver != version:
                continue
            accs.append(_acc_from_json(acc_raw))
        from . import community_stats as cs

        payload = cs._finalize_one(_merge_accs(accs), version=version)
        payload["data_through"] = raw.get("data_through")
        folded[ckey] = payload
        return payload
    except Exception:
        logger.warning(
            "lake community payload failed; snapshot fallback", exc_info=True
        )
        return None


def build_and_store_payload() -> dict | None:
    """Build the community cube from the lake, store it gzipped beside the
    parquet, and store the folded all-bracket payload as plain JSON for the
    fast path. Ingest-time only."""
    if not available(*_SERVE_FILES[1:]):
        logger.info("lake payload build skipped: lake incomplete")
        return None
    import gzip
    import json

    from . import community_stats as cs

    cube = _build_community_cube()
    con = _connect()
    try:
        data_through = str(
            con.execute(
                f"SELECT max(submitted_at) FROM read_parquet('{LAKE_DIR}/runs.parquet')"
            ).fetchone()[0]
        )
    finally:
        con.close()

    payload = cs._finalize_one(_merge_accs(list(cube.values())))
    payload["data_through"] = data_through
    tmp = LAKE_DIR / (_PAYLOAD_PATH_NAME + ".tmp")
    tmp.write_text(json.dumps(payload, separators=(",", ":")))
    tmp.replace(LAKE_DIR / _PAYLOAD_PATH_NAME)

    cube_doc = {
        "data_through": data_through,
        "cells": {k: _acc_to_json(a) for k, a in cube.items()},
    }
    tmp = LAKE_DIR / (_CUBE_PATH_NAME + ".tmp")
    with gzip.open(tmp, "wt", encoding="utf-8", compresslevel=6) as f:
        json.dump(cube_doc, f, separators=(",", ":"))
    tmp.replace(LAKE_DIR / _CUBE_PATH_NAME)
    logger.info(
        "lake community stores written: payload %d bytes, cube %d cells / %d bytes",
        (LAKE_DIR / _PAYLOAD_PATH_NAME).stat().st_size,
        len(cube),
        (LAKE_DIR / _CUBE_PATH_NAME).stat().st_size,
    )
    return payload


def _acc_to_json(acc: dict) -> dict:
    out = dict(acc)
    out["map_danger"] = {
        f"{a}|{t}": v for (a, t), v in (acc.get("map_danger") or {}).items()
    }
    return out


def _acc_from_json(raw: dict) -> dict:
    acc = dict(raw)
    acc["map_danger"] = {
        (int(k.split("|", 1)[0]), k.split("|", 1)[1]): v
        for k, v in (raw.get("map_danger") or {}).items()
    }
    acc["by_ascension"] = {
        int(k): v for k, v in (raw.get("by_ascension") or {}).items()
    }
    acc["floors"] = {int(k): v for k, v in (raw.get("floors") or {}).items()}
    acc["char_asc"] = {
        c: {int(a): v for a, v in per.items()}
        for c, per in (raw.get("char_asc") or {}).items()
    }
    return acc


def _merge_accs(cells: list[dict]) -> dict:
    """Fold cell accumulators into one, mirroring how the walk would have
    accumulated the union of their runs."""
    from . import community_stats as cs

    out = cs._new_acc_one()
    for acc in cells:
        out["total_runs"] += acc["total_runs"]
        out["total_wins"] += acc["total_wins"]
        out["total_abandoned"] += acc.get("total_abandoned") or 0
        out["reward_screens"] += acc.get("reward_screens") or 0
        out["reward_skips"] += acc.get("reward_skips") or 0
        for field in (
            "by_ascension",
            "by_character",
            "rest",
            "ancient",
            "map_danger",
            "floors",
        ):
            for k, v in (acc.get(field) or {}).items():
                rec = out[field].setdefault(k, [0] * len(v))
                if len(rec) < len(v):
                    rec.extend([0] * (len(v) - len(rec)))
                for i, x in enumerate(v):
                    rec[i] += x
        for field in (
            "deaths_encounter",
            "deaths_event",
            "removed",
            "stolen",
            "char_removes",
        ):
            for k, n in (acc.get(field) or {}).items():
                out[field][k] = out[field].get(k, 0) + n
        for eid, opts in (acc.get("events") or {}).items():
            slot = out["events"].setdefault(eid, {})
            for oid, n in opts.items():
                slot[oid] = slot.get(oid, 0) + n
        for c, per in (acc.get("char_asc") or {}).items():
            slot = out["char_asc"].setdefault(c, {})
            for a, v in per.items():
                rec = slot.setdefault(a, [0, 0])
                rec[0] += v[0]
                rec[1] += v[1]
        for c, per in (acc.get("char_rest") or {}).items():
            slot = out["char_rest"].setdefault(c, {})
            for ch, n in per.items():
                slot[ch] = slot.get(ch, 0) + n
        for key, better in (
            ("fastest_win", min),
            ("longest_run", max),
            ("biggest_deck", max),
        ):
            rec = acc.get(key)
            if rec:
                cur = out[key]
                if cur is None or better(cur[0], rec[0]) == rec[0]:
                    out[key] = tuple(rec)
    return out


def _build_community_cube() -> dict[str, dict]:
    """One pass over the lake producing a community accumulator per bracket
    cell (mode x players x A10 x winrate band)."""
    from . import community_stats as cs

    lake = str(LAKE_DIR)
    con = _connect(build=True)
    accs: dict[str, dict] = {}

    def acc_for(cell: str, char: str | None) -> dict:
        key = f"{cell}|{(char or '').lower()}"
        a = accs.get(key)
        if a is None:
            a = accs[key] = cs._new_acc_one()
        return a

    try:
        _prepare_sources(con, lake)

        for cell, char, asc, runs, wins, abandoned in con.execute(
            "SELECT cell, lower(character), coalesce(ascension, 0)::INT, count(*),"
            " count(*) FILTER (win), count(*) FILTER (coalesce(was_abandoned, false))"
            " FROM cells GROUP BY 1, 2, 3"
        ).fetchall():
            acc = acc_for(cell, char)
            acc["total_runs"] += runs
            acc["total_wins"] += wins
            acc["total_abandoned"] += abandoned
            for rec in (
                acc["by_ascension"].setdefault(asc, [0, 0, 0]),
                acc["by_character"].setdefault(char, [0, 0, 0]),
            ):
                rec[0] += runs
                rec[1] += wins
                rec[2] += abandoned
            ca = acc["char_asc"].setdefault(char, {}).setdefault(asc, [0, 0])
            ca[0] += runs
            ca[1] += wins

        for col, key in (("encounter", "deaths_encounter"), ("event", "deaths_event")):
            for cell, char, eid, n in con.execute(
                f"SELECT cell, lower(character), killed_by_{col}, count(*) FROM cells"
                f" WHERE NOT win AND killed_by_{col} IS NOT NULL"
                f" AND killed_by_{col} NOT LIKE 'NONE%' GROUP BY 1, 2, 3"
            ).fetchall():
                acc_for(cell, char)[key][eid] = n

        for cell, char, floors, runs, wins in con.execute(
            "WITH per_run AS (SELECT f.run_hash, count(*) AS n"
            f" FROM read_parquet('{lake}/floors.parquet') f"
            " JOIN cells e ON f.run_hash = e.run_hash GROUP BY 1)"
            " SELECT e.cell, lower(e.character), p.n, count(*),"
            " count(*) FILTER (e.win) FROM per_run p"
            " JOIN cells e ON p.run_hash = e.run_hash GROUP BY 1, 2, 3"
        ).fetchall():
            acc_for(cell, char)["floors"][int(floors)] = [runs, wins]

        for cell, char, act, ptype, visits, dmg, deaths in con.execute(
            "WITH typed AS (SELECT f.*, e.cell AS cell, lower(e.character) AS ch,"
            " coalesce(e.killed_by_encounter, '') <> ''"
            "  OR coalesce(e.killed_by_event, '') <> '' AS died"
            f" FROM read_parquet('{lake}/floors.parquet') f"
            " JOIN cells e ON f.run_hash = e.run_hash"
            " WHERE f.map_point_type IS NOT NULL AND f.map_point_type <> '')"
            ", visits AS (SELECT cell, ch, act, map_point_type, count(*) AS v,"
            " sum(least(100.0, greatest(0, coalesce(ps.u.damage_taken, 0)) * 100.0"
            " / ps.u.max_hp)) AS dmg FROM typed,"
            " LATERAL (SELECT unnest(players) AS u) ps"
            " WHERE coalesce(ps.u.max_hp, 0) > 0 GROUP BY 1, 2, 3, 4)"
            ", lastf AS (SELECT cell, ch, run_hash, arg_max(act, act * 10000 + floor_idx)"
            " AS act, arg_max(map_point_type, act * 10000 + floor_idx) AS mpt"
            " FROM typed WHERE died GROUP BY 1, 2, 3)"
            ", deaths AS (SELECT cell, ch, act, mpt, count(*) AS d FROM lastf"
            " GROUP BY 1, 2, 3, 4)"
            " SELECT v.cell, v.ch, v.act, v.map_point_type, v.v, v.dmg, coalesce(d.d, 0)"
            " FROM visits v LEFT JOIN deaths d"
            " ON v.cell = d.cell AND v.ch = d.ch AND v.act = d.act"
            " AND v.map_point_type = d.mpt"
        ).fetchall():
            acc_for(cell, char)["map_danger"][(int(act), ptype)] = [
                visits,
                float(dmg or 0.0),
                deaths,
            ]

        for cell, char, eid, oid, n in con.execute(
            "SELECT cell, run_char, split_part((ec.u).title.\"key\", '.', 1),"
            " split_part(split_part((ec.u).title.\"key\", '.options.', 2), '.', 1),"
            " count(*) FROM pfloors, LATERAL (SELECT unnest((p).event_choices) AS u) ec"
            " WHERE (ec.u).title.\"table\" = 'events'"
            " AND (ec.u).title.\"key\" LIKE '%.options.%' GROUP BY 1, 2, 3, 4"
        ).fetchall():
            if eid and oid:
                acc_for(cell, char)["events"].setdefault(eid, {})[oid] = n

        for cell, char, choice, ps_char, n, wins, low in con.execute(
            "WITH hp AS (SELECT run_hash, cell, act, floor_idx, p, win, run_char,"
            " last_value(CASE WHEN (p).current_hp IS NOT NULL"
            " AND coalesce((p).max_hp, 0) > 0 THEN"
            " struct_pack(hp := (p).current_hp, mx := (p).max_hp) END IGNORE NULLS)"
            " OVER (PARTITION BY run_hash, (p).player_id ORDER BY act, floor_idx"
            " ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS hp_prev"
            " FROM pfloors)"
            ", choices AS (SELECT h.cell, h.run_char, rc.u AS choice, h.win,"
            " coalesce(h.hp_prev, struct_pack(hp := (h.p).current_hp,"
            " mx := coalesce((h.p).max_hp, 0))) AS ref,"
            " coalesce(pc.character, h.run_char) AS ps_char FROM hp h"
            " LEFT JOIN pid_char pc ON h.run_hash = pc.run_hash"
            " AND (h.p).player_id = pc.player_id,"
            " LATERAL (SELECT unnest((h.p).rest_site_choices) AS u) rc"
            " WHERE rc.u IS NOT NULL AND rc.u <> '')"
            " SELECT cell, run_char, choice, ps_char, count(*), count(*) FILTER (win),"
            " count(*) FILTER (ref.mx > 0 AND ref.hp IS NOT NULL"
            " AND ref.hp * 2 < ref.mx) FROM choices GROUP BY 1, 2, 3, 4"
        ).fetchall():
            acc = acc_for(cell, char)
            rec = acc["rest"].setdefault(choice, [0, 0, 0])
            rec[0] += n
            rec[1] += wins
            rec[2] += low
            crest = acc["char_rest"].setdefault(ps_char, {})
            crest[choice] = crest.get(choice, 0) + n

        for cell, char, rid, chosen, offered in con.execute(
            "WITH offers AS (SELECT cell, run_char, coalesce((ac.u).TextKey,"
            " CASE WHEN (ac.u).title.\"key\" LIKE '%.%' THEN"
            ' substr((ac.u).title."key", strpos((ac.u).title."key", \'.\') + 1)'
            ' ELSE (ac.u).title."key" END) AS rid, (ac.u).was_chosen AS wc'
            " FROM pfloors, LATERAL (SELECT unnest((p).ancient_choice) AS u) ac)"
            " SELECT cell, run_char, rid, count(*) FILTER (coalesce(wc, false)), count(*)"
            " FROM offers WHERE rid IS NOT NULL AND rid <> ''"
            " AND upper(rid) NOT LIKE 'NONE%' GROUP BY 1, 2, 3"
        ).fetchall():
            acc_for(cell, char)["ancient"][rid] = [chosen, offered]

        for cell, char, cid, hopper, ps_char, n in con.execute(
            "WITH rem AS (SELECT cell, run_char, hopper_floor,"
            " coalesce(pc.character, f.run_char) AS ps_char,"
            " coalesce(json_extract_string(cr.u, '$.card.id'),"
            " json_extract_string(cr.u, '$.id'),"
            " CASE WHEN json_type(cr.u) = 'VARCHAR' THEN cr.u::VARCHAR END) AS raw"
            " FROM pfloors f LEFT JOIN pid_char pc ON f.run_hash = pc.run_hash"
            " AND (f.p).player_id = pc.player_id,"
            " LATERAL (SELECT unnest((f.p).cards_removed) AS u) cr)"
            " SELECT cell, run_char, CASE WHEN upper(split_part(raw, '.', -1)) LIKE 'STRIKE_%'"
            " THEN 'STRIKE' WHEN upper(split_part(raw, '.', -1)) LIKE 'DEFEND_%'"
            " THEN 'DEFEND' ELSE upper(split_part(raw, '.', -1)) END,"
            " hopper_floor, ps_char, count(*) FROM rem"
            " WHERE raw IS NOT NULL AND raw <> ''"
            " AND upper(split_part(raw, '.', -1)) NOT LIKE 'NONE%' GROUP BY 1, 2, 3, 4, 5"
        ).fetchall():
            acc = acc_for(cell, char)
            if hopper:
                acc["stolen"][cid] = acc["stolen"].get(cid, 0) + n
            else:
                acc["removed"][cid] = acc["removed"].get(cid, 0) + n
                acc["char_removes"][ps_char] = acc["char_removes"].get(ps_char, 0) + n

        for cell, char, screens, skips in con.execute(
            "SELECT cell, run_char, count(*),"
            " count(*) FILTER (NOT list_bool_or(picks_list))"
            " FROM pfloors WHERE len(picks_list) > 0 GROUP BY 1, 2"
        ).fetchall():
            acc = acc_for(cell, char)
            acc["reward_screens"] = screens
            acc["reward_skips"] = skips

        for cell, char, fw, fwh, lr, lrh, bd, bdh in con.execute(
            "WITH rr AS (SELECT * FROM cells WHERE game_mode = 'standard'"
            " AND NOT has_modifiers)"
            " SELECT cell, lower(rr.character),"
            " min(run_time) FILTER (win AND run_time > 0),"
            " arg_min(rr.run_hash, run_time) FILTER (win AND run_time > 0),"
            " max(run_time) FILTER (run_time > 0),"
            " arg_max(rr.run_hash, run_time) FILTER (run_time > 0),"
            " max(p.deck_size), arg_max(p.run_hash, p.deck_size)"
            f" FROM rr LEFT JOIN read_parquet('{lake}/players.parquet') p"
            " ON rr.run_hash = p.run_hash GROUP BY 1, 2"
        ).fetchall():
            acc = acc_for(cell, char)
            if fw is not None:
                acc["fastest_win"] = (int(fw), fwh)
            if lr is not None:
                acc["longest_run"] = (int(lr), lrh)
            if bd:
                acc["biggest_deck"] = (int(bd), bdh)

        return accs
    finally:
        con.close()


# ── Codex Elo from the lake ──────────────────────────────────────────────────
# Both Elos are Bradley-Terry fits over aggregated pair counts, so they are
# order-independent: extract the same pairs the walk extracts and feed the
# same solver, and the ratings match by construction.


def _ids_temp_table(con, name: str, ids) -> None:
    con.execute(f"CREATE OR REPLACE TEMP TABLE {name} (cid VARCHAR)")
    rows = [(i,) for i in ids]
    if rows:
        con.executemany(f"INSERT INTO {name} VALUES (?)", rows)


# The reserved competitor id for "took nothing" on a card-reward screen. Not
# a real card id (verified against the catalog), so it can never collide.
SKIP_ID = "SKIP"

# One row per (screen, offered card): who was on the screen and whether they
# were taken. Requires the `eligible` view and the `excluded_cards` temp table.
_CHOICES_CTE = """
            choices AS (
              SELECT f.run_hash, f.act, f.floor_idx, ps.i AS pidx,
                upper(split_part(cc.u.card.id, '.', -1)) AS cid,
                coalesce(cc.u.was_picked, false) AS picked
              FROM read_parquet('{lake}/floors.parquet') f
              JOIN eligible e ON f.run_hash = e.run_hash,
              LATERAL (SELECT unnest(f.players) AS u,
                       generate_subscripts(f.players, 1) AS i) ps,
              LATERAL (SELECT unnest(ps.u.card_choices) AS u) cc
              WHERE cc.u.card.id IS NOT NULL
                AND upper(split_part(cc.u.card.id, '.', 1)) = 'CARD'
                AND upper(split_part(cc.u.card.id, '.', -1))
                    NOT IN (SELECT cid FROM excluded_cards)
            )"""


def _ensure_choice_rows(con) -> None:
    """Materialize the card-choice rows once. The pair query references the
    extraction five times and the skip counts once more; each reference
    re-unnests floors.parquet unless the rows are a real table.

    A REAL table in the scratch db, not TEMP: temp tables sit inside
    DuckDB's memory budget, and the ~50M-row materialization plus the pair
    self-join on top OOM'd the 4.5GB cap mid-cycle (2026-08-28). On-disk it
    pages through the buffer pool like pfloors, and the next cycle's
    scratch reset cleans it up."""
    from . import run_entity_stats as res

    con.execute(_ELIGIBLE_SQL.format(lake=LAKE_DIR))
    _ids_temp_table(con, "excluded_cards", res._non_reward_card_ids())
    con.execute(
        f"CREATE TABLE IF NOT EXISTS choice_rows AS "
        f"WITH {_CHOICES_CTE.format(lake=LAKE_DIR)} SELECT * FROM choices"
    )


_RELIC_CHOICES_SQL = """
CREATE TABLE IF NOT EXISTS relic_choice_rows AS
SELECT c.run_hash, c.act, c.floor_idx, c.player_idx AS pidx,
  c.relic AS cid, c.picked
FROM read_parquet('{lake}/relic_choices.parquet') c
JOIN eligible e ON c.run_hash = e.run_hash
WHERE NOT c.is_shop AND c.n_options >= 2
"""


def relic_choices_available() -> bool:
    return (LAKE_DIR / "relic_choices.parquet").exists()


def _ensure_relic_choice_rows(con) -> None:
    """The relic analogue of choice_rows: one row per option on a free
    relic screen (ancient offers, boss relics, two-option events). Shop
    shelves are left out -- a price is not a preference."""
    con.execute(_ELIGIBLE_SQL.format(lake=LAKE_DIR))
    con.execute(_RELIC_CHOICES_SQL.format(lake=LAKE_DIR))


def _ensure_run_tiers(con) -> None:
    """Skill-ladder tier (A10 flag + winrate band) per eligible run, from
    the same user-winrate cells the community cube uses — so per-bracket
    Elo agrees with the cube's pick/win slices on who belongs to a
    bracket. Real table in the scratch db, like choice_rows."""
    _ensure_cells(con, str(LAKE_DIR))
    con.execute(
        "CREATE TABLE IF NOT EXISTS run_tiers AS "
        "SELECT run_hash, split_part(cell, '|', 3)::INT AS a10, "
        "split_part(cell, '|', 4)::INT AS band, "
        "split_part(cell, '|', 5) AS ver FROM cells"
    )


_PAIR_BUCKETS = 8


def reward_pair_counts_by_tier(
    con=None, table: str = "choice_rows"
) -> dict[tuple[int, int], dict[tuple[str, str], int]]:
    """(a10, band) -> {(picked, skipped) -> count} over card-reward
    screens, mirroring the walk: eligible runs only, CARD-namespaced ids,
    curses/status excluded. Ladder brackets fold cumulatively from the
    cells (a10 = every a10 cell, wr50 = a10 cells with band >= 2), and the
    all-runs pairs are the sum over everything — one grouped extraction
    serves every fit.

    SKIP is a rated competitor: every screen implicitly offers "take
    nothing". A picked card beats SKIP; on a screen where nothing was
    taken, SKIP beats each offered card. A skipped card vs SKIP on a taken
    screen is unobserved — the player rejected it in favor of the pick,
    not in favor of skipping."""
    own = con is None
    if own:
        con = _connect(build=True)
    try:
        if table == "relic_choice_rows":
            _ensure_relic_choice_rows(con)
        else:
            _ensure_choice_rows(con)
        _ensure_run_tiers(con)
        # Relational form: a pick beats each pass on its own screen, so a
        # 1-to-K join on the screen key streams straight into a compact
        # count() hash. The previous per-screen list build (pair_screens)
        # pinned list-aggregate state for every screen at once and OOM'd
        # the 4.5GB cap on the first full-corpus run (2026-09-01); plain
        # count aggregates and hash joins spill, lists don't.
        tiers: dict[tuple[int, int], dict[tuple[str, str], int]] = {}

        def cell(a10, band, ver):
            return tiers.setdefault((int(a10), int(band), ver or ""), {})

        # The pick x pass join is run in hash-bucketed passes on two
        # threads: its grouped result (pairs x tier cells) is tens of
        # millions of groups, and the per-thread aggregate state for the
        # whole corpus at once needed ~4GB (OOM'd the 3500MB cap,
        # 2026-09-02). Buckets partition by screen, so each pass's counts
        # are disjoint and simply add up.
        con.execute("SET threads=2")
        try:
            for b in range(_PAIR_BUCKETS):
                for a10, band, ver, w, lo, n in con.execute(
                    f"""
                    SELECT t.a10, t.band, t.ver, p.cid, q.cid, count(*)
                    FROM {table} p
                    JOIN {table} q
                      ON q.run_hash = p.run_hash AND q.act = p.act
                     AND q.floor_idx = p.floor_idx AND q.pidx = p.pidx
                    JOIN run_tiers t ON t.run_hash = p.run_hash
                    WHERE p.picked AND NOT q.picked AND p.cid <> q.cid
                      AND hash(p.run_hash) % {_PAIR_BUCKETS} = {b}
                    GROUP BY 1, 2, 3, 4, 5
                    """
                ).fetchall():
                    d = cell(a10, band, ver)
                    d[(w, lo)] = d.get((w, lo), 0) + n
        finally:
            con.execute("SET threads=5")
        for a10, band, ver, cid, n in con.execute(
            f"""
            SELECT t.a10, t.band, t.ver, c.cid, count(*)
            FROM {table} c JOIN run_tiers t ON t.run_hash = c.run_hash
            WHERE c.picked
            GROUP BY 1, 2, 3, 4
            """
        ).fetchall():
            cell(a10, band, ver)[(cid, SKIP_ID)] = n
        for a10, band, ver, cid, n in con.execute(
            f"""
            SELECT t.a10, t.band, t.ver, c.cid, count(*)
            FROM {table} c
            JOIN run_tiers t ON t.run_hash = c.run_hash
            ANTI JOIN (
              SELECT DISTINCT run_hash, act, floor_idx, pidx
              FROM {table} WHERE picked
            ) ps ON c.run_hash = ps.run_hash AND c.act = ps.act
                AND c.floor_idx = ps.floor_idx AND c.pidx = ps.pidx
            WHERE NOT c.picked
            GROUP BY 1, 2, 3, 4
            """
        ).fetchall():
            cell(a10, band, ver)[(SKIP_ID, cid)] = n
        return tiers
    finally:
        if own:
            con.close()


def fold_tier_pairs(
    tiers: dict[tuple[int, int, str], dict[tuple[str, str], int]],
    a10_only: bool = False,
    min_band: int = 0,
    version: str | None = None,
) -> dict[tuple[str, str], int]:
    """Cumulative fold of tiered pair counts: the all-runs pairs with the
    defaults, a skill-ladder bracket's subset, or one game version's."""
    out: dict[tuple[str, str], int] = {}
    for (a10, band, ver), d in tiers.items():
        if a10_only and a10 != 1:
            continue
        if band < min_band:
            continue
        if version is not None and ver != version:
            continue
        for k, n in d.items():
            out[k] = out.get(k, 0) + n
    return out


def reward_pair_counts(con=None) -> dict[tuple[str, str], int]:
    """All-runs (picked, skipped) pair counts — the tiered extraction
    summed over every cell."""
    return fold_tier_pairs(reward_pair_counts_by_tier(con))


def skip_screen_counts(con=None, table: str = "choice_rows") -> dict:
    """Card-reward screen totals for the SKIP pseudo-entry: offered = every
    screen shown, picked = screens where nothing was taken, with the same
    3-bucket act split the card pick entries use."""
    own = con is None
    if own:
        con = _connect(build=True)
    try:
        if table == "relic_choice_rows":
            _ensure_relic_choice_rows(con)
        else:
            _ensure_choice_rows(con)
        rows = con.execute(
            f"""
            WITH screens AS (
              SELECT run_hash, act, floor_idx, pidx,
                bool_or(picked) AS any_pick
              FROM {table} GROUP BY 1, 2, 3, 4
            )
            SELECT least(act, 2), count(*), count(*) FILTER (NOT any_pick)
            FROM screens GROUP BY 1
            """
        ).fetchall()
        off_act = [0, 0, 0]
        pick_act = [0, 0, 0]
        for bucket, total, skipped in rows:
            b = min(max(int(bucket or 0), 0), 2)
            off_act[b] += int(total)
            pick_act[b] += int(skipped)
        return {
            "offered": sum(off_act),
            "picked": sum(pick_act),
            "off_act": off_act,
            "pick_act": pick_act,
        }
    finally:
        if own:
            con.close()


def upgrade_pair_counts(con=None) -> dict[tuple[str, str], int]:
    """(upgraded, eligible-but-skipped) -> count over rest-site Smith
    decisions, replaying _walk_rest_upgrade_choices set-by-set: the eligible
    pool is the player's upgradeable final-deck cards present by that floor,
    minus cards already smithed at an earlier decision this run."""
    from . import run_entity_stats as res

    upgradeable = res._upgradeable_card_ids()
    own = con is None
    if own:
        con = _connect(build=True)
    try:
        con.execute(_ELIGIBLE_SQL.format(lake=LAKE_DIR))
        _ids_temp_table(con, "upg_ids", upgradeable)
        upg_filter = "IN (SELECT cid FROM upg_ids)" if upgradeable else "IS NOT NULL"
        rows = con.execute(
            f"""
            WITH floors_g AS (
              SELECT f.run_hash, f.players,
                row_number() OVER (PARTITION BY f.run_hash
                  ORDER BY f.act, f.floor_idx) AS gfloor
              FROM read_parquet('{LAKE_DIR}/floors.parquet') f
              JOIN eligible e ON f.run_hash = e.run_hash
            ),
            pmap AS (
              SELECT run_hash, player_id, player_idx
              FROM read_parquet('{LAKE_DIR}/players.parquet')
              WHERE player_id IS NOT NULL
            ),
            nplayers AS (
              -- Solo is the BLOB's player count, not the runs doc's scalar:
              -- they disagree on some co-op runs, and the walk trusts the blob.
              SELECT run_hash, count(*) AS np
              FROM read_parquet('{LAKE_DIR}/players.parquet') GROUP BY 1
            ),
            smith_raw AS (
              SELECT f.run_hash, f.gfloor, ps.u.player_id AS pid,
                [upper(split_part(u, '.', -1)) FOR u IN ps.u.upgraded_cards
                 IF upper(split_part(u, '.', 1)) = 'CARD'] AS winners_raw
              FROM floors_g f,
              LATERAL (SELECT unnest(f.players) AS u) ps
              WHERE list_contains(ps.u.rest_site_choices, 'SMITH')
                AND len(ps.u.upgraded_cards) > 0
            ),
            smith AS (
              SELECT sr.run_hash,
                CASE WHEN n.np = 1 THEN 1 ELSE pm.player_idx END AS pidx,
                sr.gfloor, sr.winners_raw
              FROM smith_raw sr
              JOIN nplayers n ON sr.run_hash = n.run_hash
              LEFT JOIN pmap pm ON sr.run_hash = pm.run_hash
                AND sr.pid = pm.player_id
              WHERE n.np = 1 OR pm.player_idx IS NOT NULL
            ),
            winners AS (
              SELECT run_hash, pidx, gfloor, wu.u AS card
              FROM smith, LATERAL (SELECT unnest(winners_raw) AS u) wu
              WHERE pidx IS NOT NULL AND wu.u {upg_filter}
            ),
            events AS (
              SELECT DISTINCT run_hash, pidx, gfloor FROM winners
            ),
            first_up AS (
              SELECT run_hash, pidx, card, min(gfloor) AS fu
              FROM winners GROUP BY 1, 2, 3
            ),
            deck_min AS (
              SELECT d.run_hash, d.player_idx AS pidx, d.card,
                min(coalesce(d.floor_added, 0)) AS fa
              FROM read_parquet('{LAKE_DIR}/deck.parquet') d
              JOIN eligible e ON d.run_hash = e.run_hash
              WHERE d.card {upg_filter}
                AND d.run_hash IN (SELECT run_hash FROM events)
              GROUP BY 1, 2, 3
            ),
            losers AS (
              SELECT ev.run_hash, ev.pidx, ev.gfloor, dm.card
              FROM events ev
              JOIN deck_min dm ON ev.run_hash = dm.run_hash AND ev.pidx = dm.pidx
              LEFT JOIN first_up f2 ON f2.run_hash = ev.run_hash
                AND f2.pidx = ev.pidx AND f2.card = dm.card
              LEFT JOIN winners w2 ON w2.run_hash = ev.run_hash
                AND w2.pidx = ev.pidx AND w2.gfloor = ev.gfloor
                AND w2.card = dm.card
              WHERE dm.fa <= ev.gfloor
                AND (f2.fu IS NULL OR f2.fu >= ev.gfloor)
                AND w2.card IS NULL
            )
            SELECT w.card, l.card, count(*)
            FROM winners w
            JOIN losers l ON w.run_hash = l.run_hash AND w.pidx = l.pidx
              AND w.gfloor = l.gfloor
            WHERE w.card <> l.card
            GROUP BY 1, 2
            """
        ).fetchall()
        return {(w, lo): n for w, lo, n in rows}
    finally:
        if own:
            con.close()


def compute_lake_elo() -> dict:
    """Card-reward Elo and upgrade Elo fitted from the lake with the same
    Bradley-Terry solver the walk uses."""
    from . import run_entity_stats as res

    reward = reward_pair_counts()
    upgrade = upgrade_pair_counts()
    card_elo, _ = res._compute_codex_elo(reward)
    upgrade_elo, _ = res._compute_codex_elo(upgrade)
    return {
        "card_elo": card_elo,
        "upgrade_elo": upgrade_elo,
        "reward_pairs": len(reward),
        "upgrade_pairs": len(upgrade),
    }


# ── Entity store: the snapshot cache's per-entity aggregates, from the lake ──

_ENTITY_STORE_NAME = "entity_store.json"


def build_entity_store() -> dict | None:
    """Compute the all-bracket per-entity aggregates (picks, wins,
    by-character, reward metrics, Elos, base/upgraded, relic act buckets)
    and store them beside the parquet. Ingest-time only; the serving swap
    reads this instead of the walked snapshot."""
    if not available(*_SERVE_FILES[1:]):
        logger.info("entity store skipped: lake incomplete")
        return None

    from . import run_entity_stats as res

    con = _connect(build=True)
    try:
        con.execute(_ELIGIBLE_SQL.format(lake=LAKE_DIR))
        entities: dict[str, dict[str, dict]] = {
            "cards": {},
            "relics": {},
            "potions": {},
        }

        def entry(etype: str, eid: str) -> dict:
            return entities[etype].setdefault(
                eid,
                {
                    "picks": 0,
                    "wins": 0,
                    "by_character": {},
                    "last_submitted_at": None,
                    "last_run_hash": None,
                },
            )

        # Seat-set membership + per-character splits + last-seen, one query
        # per membership table; wax relic copies land in their own block.
        for etype, table, col in (
            ("cards", "deck", "card"),
            ("relics", "relics", "relic"),
            ("potions", "potions", "potion"),
        ):
            for eid, char, picks, wins, last_ts, last_hash in con.execute(
                _MEMBERSHIP_SQL.format(
                    col=col,
                    table=table,
                    lake=LAKE_DIR,
                    where=_membership_where(table, con),
                )
            ).fetchall():
                a = entry(etype, eid)
                a["picks"] += picks
                a["wins"] += wins
                ch = char or ""
                sub = a["by_character"].setdefault(ch, {"picks": 0, "wins": 0})
                sub["picks"] += picks
                sub["wins"] += wins
                ts = str(last_ts) if last_ts is not None else None
                if ts and (a["last_submitted_at"] or "") < ts:
                    a["last_submitted_at"] = ts
                    a["last_run_hash"] = last_hash
        if _relics_have_wax(con):
            for eid, _char, picks, wins, _ts, _hash in con.execute(
                _MEMBERSHIP_SQL.format(
                    col="relic",
                    table="relics",
                    lake=LAKE_DIR,
                    where=_membership_where("relics", con, wax=True),
                )
            ).fetchall():
                wax = entry("relics", eid).setdefault("wax", {"picks": 0, "wins": 0})
                wax["picks"] += picks
                wax["wins"] += wins
        for eid, used in con.execute(_POTION_USED_SQL.format(lake=LAKE_DIR)).fetchall():
            entry("potions", eid)["used"] = used

        # Card-reward offer/pick counts with 3 act buckets (A1/A2/A3+),
        # read off the shared choice_rows materialization -- the pair fits
        # reuse the same scratch table later on their own connection, so
        # the floors unnest happens once per cycle instead of twice.
        _ensure_choice_rows(con)
        offer_tables = [("cards", "choice_rows")]
        if relic_choices_available():
            _ensure_relic_choice_rows(con)
            offer_tables.append(("relics", "relic_choice_rows"))
        for etype, table in offer_tables:
            for eid, bucket, offered, picked in con.execute(
                f"""
                SELECT cid, least(act, 2), count(*), count(*) FILTER (picked)
                FROM {table} GROUP BY 1, 2
                """
            ).fetchall():
                a = entry(etype, eid)
                if "offered" not in a:
                    a.update(
                        {
                            "offered": 0,
                            "picked": 0,
                            "off_act": [0, 0, 0],
                            "pick_act": [0, 0, 0],
                        }
                    )
                a["offered"] += offered
                a["picked"] += picked
                a["off_act"][bucket] += offered
                a["pick_act"][bucket] += picked

        # Base vs upgraded deck membership: run-set semantics.
        for eid, upgraded, picks, wins in con.execute(
            f"""
            WITH sets AS (
              SELECT DISTINCT d.run_hash, d.card,
                coalesce(d.upgrade_level, 0) > 0 AS upgraded
              FROM read_parquet('{LAKE_DIR}/deck.parquet') d
              JOIN eligible e ON d.run_hash = e.run_hash
            )
            SELECT s.card, s.upgraded, count(*), count(*) FILTER (e.win)
            FROM sets s JOIN eligible e ON s.run_hash = e.run_hash
            GROUP BY 1, 2
            """
        ).fetchall():
            a = entry("cards", eid)
            a["upg" if upgraded else "base"] = {"picks": picks, "wins": wins}

        # Relic acquisition acts: per-run dedupe, act bounds from the floors
        # table, modded-relic runs skipped entirely (their pickup floors lie).
        official_relics = res._official_relic_ids()
        _ids_temp_table(con, "official_relics", official_relics)
        modded_guard = (
            "AND r.run_hash NOT IN (SELECT DISTINCT run_hash"
            f" FROM read_parquet('{LAKE_DIR}/relics.parquet')"
            " WHERE relic NOT IN (SELECT cid FROM official_relics))"
            if official_relics
            else ""
        )
        for eid, bucket, picks, wins in con.execute(
            f"""
            WITH bounds AS (
              -- The proven form: a row-level window over floors.parquet that
              -- spills under the cap. A cheaper GROUP BY variant OOM'd this
              -- stage twice on 2026-08-28 (passes in isolation, dies on the
              -- build connection's real buffer-pool state) — don't retry it
              -- without reproducing that state.
              SELECT f.run_hash, f.act, max(cum) AS bound FROM (
                SELECT run_hash, act,
                  count(*) OVER (PARTITION BY run_hash
                    ORDER BY act, floor_idx) AS cum
                FROM read_parquet('{LAKE_DIR}/floors.parquet')
              ) f GROUP BY 1, 2
            ),
            picks AS (
              SELECT DISTINCT r.run_hash, r.relic,
                coalesce(least((SELECT min(b.act) FROM bounds b
                  WHERE b.run_hash = r.run_hash AND r.floor_added <= b.bound),
                  2), 2) AS bucket
              FROM read_parquet('{LAKE_DIR}/relics.parquet') r
              JOIN eligible e ON r.run_hash = e.run_hash
              WHERE r.floor_added IS NOT NULL AND r.floor_added >= 1
                {modded_guard}
            )
            SELECT p.relic, p.bucket, count(*), count(*) FILTER (e.win)
            FROM picks p JOIN eligible e ON p.run_hash = e.run_hash
            GROUP BY 1, 2
            """
        ).fetchall():
            a = entry("relics", eid)
            if "act_picks" not in a:
                a["act_picks"] = [0, 0, 0]
                a["act_wins"] = [0, 0, 0]
            a["act_picks"][int(bucket)] += picks
            a["act_wins"][int(bucket)] += wins

        totals = dict(
            zip(
                ("total_runs", "total_wins", "total_seats"),
                con.execute(
                    f"""
                    SELECT count(*), count(*) FILTER (e.win),
                      sum(coalesce(n.np, e.player_count, 1))::BIGINT
                    FROM eligible e
                    LEFT JOIN (
                      SELECT run_hash, count(*) AS np
                      FROM read_parquet('{LAKE_DIR}/players.parquet') GROUP BY 1
                    ) n ON e.run_hash = n.run_hash
                    """
                ).fetchone(),
            )
        )
        data_through = str(
            con.execute(
                f"SELECT max(submitted_at) FROM read_parquet('{LAKE_DIR}/runs.parquet')"
            ).fetchone()[0]
        )
    finally:
        con.close()

    def _prior_store_elo() -> dict:
        """The store currently on disk -- the previous generation's, since
        this build hasn't published yet: base/upgrade/relic Elo maps, the
        skip block, the raw Bradley-Terry strengths (next cycle's warm
        start) and the per-bracket maps."""
        import json as _json

        out = {
            "base": {},
            "upg": {},
            "relic": {},
            "skip": None,
            "strengths": {},
            "bracket": {},
        }
        try:
            prior = _json.loads((LAKE_DIR / _ENTITY_STORE_NAME).read_text())
            cards = prior["entities"]["cards"]
            relics = prior["entities"].get("relics") or {}
        except Exception:
            return out
        out["base"] = {
            k: v["elo"] for k, v in cards.items() if v.get("elo") is not None
        }
        out["upg"] = {
            k: v["upg"]["elo"]
            for k, v in cards.items()
            if v.get("upg") and v["upg"].get("elo") is not None
        }
        out["relic"] = {
            k: v["elo"] for k, v in relics.items() if v.get("elo") is not None
        }
        out["skip"] = prior.get("skip")
        out["strengths"] = prior.get("elo_strengths") or {}
        out["bracket"] = prior.get("bracket_elo") or {}
        return out

    # Each Elo pair extraction gets its own fresh connection: two hours of
    # session state must not sit under the heaviest joins in the build. A
    # failed fit carries the prior store's ratings forward (slightly stale
    # Elo beats a published store with holes) instead of destroying
    # everything computed above.
    # SKIP rides the reward fit: the pair counts already contain it, and the
    # entities loop below ignores it (not a card id), so its rating and the
    # screen totals live in a dedicated store block instead of a ghost row.
    # The skip counts and the pair extraction share one connection so the
    # choice_rows materialization happens once, not per builder; the prior
    # store's strengths warm-start both fits (a near-identical ladder
    # converges in a few MM iterations instead of hundreds).
    prior = _prior_store_elo()
    prior_strengths = prior["strengths"]
    strengths_out: dict[str, dict] = {}
    bracket_elo: dict[str, dict] = {}

    def _fit_family(
        ccon,
        etype: str,
        table: str,
        strength_key: str,
        prefix: str,
        skip_block: dict | None,
    ) -> None:
        tiers = reward_pair_counts_by_tier(ccon, table=table)
        elo, strengths = res._compute_codex_elo(
            fold_tier_pairs(tiers), warm=prior_strengths.get(strength_key)
        )
        strengths_out[strength_key] = {k: round(v, 5) for k, v in strengths.items()}
        for eid, rating in elo.items():
            if eid in entities[etype]:
                entities[etype][eid]["elo"] = rating
        # Skill-ladder refits from the same extraction, warm-started
        # from the fresh all-runs strengths so each converges in a few
        # iterations. Thin entries drop out per bracket (the min-games
        # floor), which serving reads as "no Elo in that slice".
        skip_by_bracket: dict[str, float | None] = {}
        for name, min_band in (
            ("a10", 0),
            ("wr30", 1),
            ("wr50", 2),
            ("wr75", 3),
        ):
            be, _p = res._compute_codex_elo(
                fold_tier_pairs(tiers, a10_only=True, min_band=min_band),
                warm=strengths,
            )
            skip_by_bracket[name] = be.pop(SKIP_ID, None)
            bracket_elo[f"{prefix}{name}"] = be
        for ver in cube_versions():
            bev, _pv = res._compute_codex_elo(
                fold_tier_pairs(tiers, version=ver), warm=strengths
            )
            bev.pop(SKIP_ID, None)
            if bev:
                bracket_elo[f"{prefix}ver:{ver}"] = bev
        if skip_block is not None:
            skip_block["elo"] = elo.get(SKIP_ID)
            skip_block["elo_by_bracket"] = skip_by_bracket
            skip_block["elo_source"] = "fit"

    def _carry_family(etype: str, prior_map: dict, strength_key: str, prefix: str):
        if prior_strengths.get(strength_key):
            strengths_out[strength_key] = prior_strengths[strength_key]
        for eid, rating in prior_map.items():
            if eid in entities[etype]:
                entities[etype][eid]["elo"] = rating
        for key, val in prior["bracket"].items():
            family = key.split(":", 1)[0] if ":" in key else ""
            if (prefix and key.startswith(prefix)) or (
                not prefix and family in ("", "ver")
            ):
                bracket_elo[key] = val

    ccon = _connect(build=True)
    try:
        try:
            skip_block: dict | None = dict(skip_screen_counts(ccon), elo=None)
        except Exception:
            skip_block = prior["skip"]
            logger.warning(
                "skip screen counts failed; carried the prior store's skip block",
                exc_info=True,
            )
        try:
            _fit_family(ccon, "cards", "choice_rows", "reward", "", skip_block)
        except Exception:
            _carry_family("cards", prior["base"], "reward", "")
            if skip_block is not None and prior["skip"]:
                skip_block["elo"] = prior["skip"].get("elo")
                skip_block["elo_by_bracket"] = prior["skip"].get("elo_by_bracket")
                skip_block["elo_source"] = "carried"
            logger.warning(
                "reward Elo fit failed; carried %d ratings forward from the prior store",
                len(prior["base"]),
                exc_info=True,
            )
        if relic_choices_available():
            try:
                _fit_family(
                    ccon, "relics", "relic_choice_rows", "relic_reward", "relics:", None
                )
            except Exception:
                _carry_family("relics", prior["relic"], "relic_reward", "relics:")
                logger.warning(
                    "relic Elo fit failed; carried %d ratings forward from the prior store",
                    len(prior["relic"]),
                    exc_info=True,
                )
    finally:
        # The materialized rows are ~1-2GB of scratch disk; nothing after
        # this point reads them and the upgrade fit wants the headroom.
        try:
            ccon.execute("DROP TABLE IF EXISTS choice_rows")
            ccon.execute("DROP TABLE IF EXISTS relic_choice_rows")
        except Exception:
            pass
        ccon.close()
    try:
        upgrade_elo, upg_p = res._compute_codex_elo(
            upgrade_pair_counts(), warm=prior_strengths.get("upgrade")
        )
        strengths_out["upgrade"] = {k: round(v, 5) for k, v in upg_p.items()}
        for eid, elo in upgrade_elo.items():
            upg = entities["cards"].get(eid, {}).get("upg")
            if upg is not None:
                upg["elo"] = elo
    except Exception:
        if prior_strengths.get("upgrade"):
            strengths_out["upgrade"] = prior_strengths["upgrade"]
        for eid, elo in prior["upg"].items():
            upg = entities["cards"].get(eid, {}).get("upg")
            if upg is not None:
                upg["elo"] = elo
        logger.warning(
            "upgrade Elo fit failed; carried %d ratings forward from the prior store",
            len(prior["upg"]),
            exc_info=True,
        )

    baselines = {}
    for etype, entries_ in entities.items():
        picks = sum(a["picks"] for a in entries_.values())
        wins = sum(a["wins"] for a in entries_.values())
        baselines[etype] = (wins / picks) if picks else 0.0

    store = {
        "entities": entities,
        "totals": totals,
        "baselines": baselines,
        "skip": skip_block,
        "elo_strengths": strengths_out,
        "bracket_elo": bracket_elo,
        "data_through": data_through,
    }
    import json as _json

    tmp = LAKE_DIR / (_ENTITY_STORE_NAME + ".tmp")
    tmp.write_text(_json.dumps(store, separators=(",", ":")))
    tmp.replace(LAKE_DIR / _ENTITY_STORE_NAME)
    logger.info(
        "lake entity store: %d cards / %d relics / %d potions (%d bytes)",
        len(entities["cards"]),
        len(entities["relics"]),
        len(entities["potions"]),
        (LAKE_DIR / _ENTITY_STORE_NAME).stat().st_size,
    )
    return store


_entity_store_cache: tuple[float, dict] | None = None


_ENTITY_CUBE_NAME = "entity_cube.json.gz"


def _cell_matches(
    cell: str,
    mode: str | None,
    player: str | None,
    skill: int | None,
    version: str | None,
) -> bool:
    """Whether one cube cell (mode|pc|a10|band|build_id) belongs to a parsed
    bracket — the community cube's fold conditions, shared so the entity
    cube folds identically."""
    parts = (cell or "").split("|")
    if len(parts) != 5:
        return False
    cmode, pc, a10, band, ver = parts
    if mode is not None and cmode != mode:
        return False
    if player is not None and pc != player:
        return False
    if skill is not None:
        if a10 != "1":
            return False
        try:
            if skill > 0 and int(band) < skill:
                return False
        except ValueError:
            return False
    if version is not None and ver != version:
        return False
    return True


def build_entity_cube(con=None) -> dict:
    """Per-cell entity pick/win counts for every type, plus per-cell run
    totals — the tier-list analogue of the community cube. Any mode x
    players x skill x version bracket folds from these cells at request
    time, which is what lets the tier pages compose mode with the other
    axes instead of one replacing the rest."""
    own = con is None
    if own:
        con = _connect(build=True)
    try:
        _prepare_sources(con, str(LAKE_DIR))
        _ensure_run_exp(con)
        runs_cells = {
            cell: [t, w, int(seats or t)]
            for cell, t, w, seats in con.execute(
                _CUBE_RUNS_SQL.format(lake=LAKE_DIR)
            ).fetchall()
        }
        types: dict[str, dict] = {}
        by_char: dict[str, dict] = {}
        for etype, table, col in (
            ("cards", "deck", "card"),
            ("relics", "relics", "relic"),
            ("potions", "potions", "potion"),
        ):
            per: dict[str, dict] = {}
            per_char: dict[str, dict] = {}
            # One scan yields both sections: the entity cells (summed over
            # characters) and the character axis that gives bracketed
            # by-character views a live source. Seat-set rows: the
            # character is the seat's own, and a 4P run is four seats.
            for cell, eid, ch, p_, w, n_exp, w_exp, exp_sum in con.execute(
                _CUBE_MEMBERSHIP_SQL.format(
                    col=col,
                    table=table,
                    lake=LAKE_DIR,
                    where=_membership_where(table, con),
                )
            ).fetchall():
                cur = per.setdefault(cell, {}).setdefault(eid, [0, 0, 0, 0, 0.0])
                cur[0] += p_
                cur[1] += w
                cur[2] += n_exp
                cur[3] += w_exp
                cur[4] = round(cur[4] + float(exp_sum or 0.0), 3)
                if ch:
                    per_char.setdefault(cell, {}).setdefault(eid, {})[ch] = [p_, w]
            types[etype] = per
            by_char[etype] = per_char
        wax: dict[str, dict] = {}
        if _relics_have_wax(con):
            for cell, eid, _ch, p_, w, _ne, _we, _es in con.execute(
                _CUBE_MEMBERSHIP_SQL.format(
                    col="relic",
                    table="relics",
                    lake=LAKE_DIR,
                    where=_membership_where("relics", con, wax=True),
                )
            ).fetchall():
                cur = wax.setdefault(cell, {}).setdefault(eid, [0, 0])
                cur[0] += p_
                cur[1] += w
        potion_used: dict[str, dict] = {}
        for cell, eid, used in con.execute(
            _CUBE_POTION_USED_SQL.format(lake=LAKE_DIR)
        ).fetchall():
            potion_used.setdefault(cell, {})[eid] = used
        # Offer/pick counts per cell with the store's 3 act buckets
        # (floors.parquet acts are 0-based; least(act,2) = A1/A2/A3+), so
        # the metrics table's Pick% and per-act splits fold per bracket.
        # Cards from reward screens, relics from free relic screens.
        offers: dict[str, dict] = {"cards": {}, "relics": {}}
        for cell, eid, bucket, offered, picked in con.execute(
            f"""
            SELECT e.cell, upper(split_part(cc.u.card.id, '.', -1)),
              least(f.act, 2), count(*),
              count(*) FILTER (coalesce(cc.u.was_picked, false))
            FROM read_parquet('{LAKE_DIR}/floors.parquet') f
            JOIN cells e ON f.run_hash = e.run_hash,
            LATERAL (SELECT unnest(f.players) AS u) ps,
            LATERAL (SELECT unnest(ps.u.card_choices) AS u) cc
            WHERE cc.u.card.id IS NOT NULL AND cc.u.card.id <> ''
            GROUP BY 1, 2, 3
            """
        ).fetchall():
            offers["cards"].setdefault(cell, {}).setdefault(eid, {})[str(bucket)] = [
                offered,
                picked,
            ]
        if relic_choices_available():
            for cell, eid, bucket, offered, picked in con.execute(
                f"""
                SELECT e.cell, r.relic, least(r.act, 2), count(*),
                  count(*) FILTER (r.picked)
                FROM read_parquet('{LAKE_DIR}/relic_choices.parquet') r
                JOIN cells e ON r.run_hash = e.run_hash
                WHERE NOT r.is_shop AND r.n_options >= 2
                GROUP BY 1, 2, 3
                """
            ).fetchall():
                offers["relics"].setdefault(cell, {}).setdefault(eid, {})[
                    str(bucket)
                ] = [offered, picked]
        shops: dict[str, dict] = {}
        if (LAKE_DIR / "shop_items.parquet").exists():
            for cell, etype, eid, *counts in con.execute(
                _CUBE_SHOPS_SQL.format(lake=LAKE_DIR)
            ).fetchall():
                shops.setdefault(cell, {}).setdefault(etype, {})[eid] = [
                    int(counts[0]),
                    int(counts[1]),
                    int(counts[2]),
                    int(counts[3]),
                    int(counts[4]),
                    float(counts[5] or 0.0),
                ]
        events: dict[str, dict] = {}
        for cell, eid, oid, *counts in con.execute(_CUBE_EVENTS_SQL).fetchall():
            if eid and oid:
                events.setdefault(cell, {}).setdefault(eid, {})[oid] = [
                    int(counts[0]),
                    int(counts[1]),
                    int(counts[2]),
                    int(counts[3]),
                    float(counts[4] or 0.0),
                ]
        rest: dict[str, dict] = {}
        for cell, choice, *counts in con.execute(_CUBE_REST_SQL).fetchall():
            rest.setdefault(cell, {})[choice] = [
                int(counts[0]),
                int(counts[1]),
                int(counts[2]),
                int(counts[3]),
                int(counts[4]),
                float(counts[5] or 0.0),
            ]
        data_through = str(
            con.execute(
                f"SELECT max(submitted_at) FROM read_parquet('{LAKE_DIR}/runs.parquet')"
            ).fetchone()[0]
        )
    finally:
        if own:
            con.close()
    cube = {
        "runs": runs_cells,
        "entities": types,
        "by_character": by_char,
        "offers": offers,
        "wax": wax,
        "potion_used": potion_used,
        "shops": shops,
        "events": events,
        "rest": rest,
        "data_through": data_through,
    }
    import gzip as _gzip
    import json as _json

    tmp = LAKE_DIR / (_ENTITY_CUBE_NAME + ".tmp")
    with _gzip.open(tmp, "wt", encoding="utf-8") as f:
        f.write(_json.dumps(cube, separators=(",", ":")))
    tmp.replace(LAKE_DIR / _ENTITY_CUBE_NAME)
    logger.info(
        "lake entity cube: %d run cells, %d bytes gz",
        len(runs_cells),
        (LAKE_DIR / _ENTITY_CUBE_NAME).stat().st_size,
    )
    return cube


_entity_cube_cache: tuple[float, dict] | None = None


def _entity_cube_with_mtime() -> tuple[float, dict] | None:
    global _entity_cube_cache
    try:
        path = LAKE_DIR / _ENTITY_CUBE_NAME
        if not path.exists():
            return None
        mtime = path.stat().st_mtime
        if _entity_cube_cache and _entity_cube_cache[0] == mtime:
            return _entity_cube_cache
        import gzip as _gzip
        import json as _json

        with _gzip.open(path, "rt", encoding="utf-8") as f:
            cube = _json.loads(f.read())
        _entity_cube_cache = (mtime, cube)
        return _entity_cube_cache
    except Exception:
        logger.warning("entity cube load failed", exc_info=True)
        return None


_fold_cache: dict[tuple[str, str], tuple[float, dict | None]] = {}


def _fold_cache_put(key, val) -> None:
    # Evict oldest entries instead of wiping the dict: a wholesale clear
    # past the cap stampeded every hot bracket back through a full cube
    # fold at once (2026-09-01 perf survey).
    while len(_fold_cache) >= 512:
        _fold_cache.pop(next(iter(_fold_cache)))
    _fold_cache[key] = val


def entity_bracket_fold(entity_type: str, bracket: str) -> dict | None:
    """Cached fold: the entity detail page reads ~20 brackets per request
    and every entity shares the same folds, so cache per (type, bracket)
    keyed on the cube file's mtime."""
    hit = _entity_cube_with_mtime()
    if hit is None:
        return None
    key = (entity_type, bracket)
    cached = _fold_cache.get(key)
    if cached is not None and cached[0] == hit[0]:
        return cached[1]
    fold = _entity_bracket_fold_uncached(entity_type, bracket)
    _fold_cache_put(key, (hit[0], fold))
    return fold


def entity_character_fold(entity_type: str, bracket: str) -> dict | None:
    """{eid: {CHARACTER: [picks, wins]}} folded from the cube's character
    axis for one bracket, fold-cached like entity_bracket_fold. None until
    a cube with the axis is published or for unfoldable brackets."""
    hit = _entity_cube_with_mtime()
    if hit is None:
        return None
    key = (f"char:{entity_type}", bracket)
    cached = _fold_cache.get(key)
    if cached is not None and cached[0] == hit[0]:
        return cached[1]
    parsed = _parse_lake_bracket(bracket)
    per = ((hit[1].get("by_character") or {}).get(entity_type)) or None
    fold: dict | None = None
    if parsed is not None and per is not None:
        mode, player, skill, version = parsed
        fold = {}
        for cell, ids in per.items():
            if not _cell_matches(cell, mode, player, skill, version):
                continue
            for eid, chars in ids.items():
                slot = fold.setdefault(eid, {})
                for ch, pw in chars.items():
                    cur = slot.get(ch)
                    if cur is None:
                        slot[ch] = [pw[0], pw[1]]
                    else:
                        cur[0] += pw[0]
                        cur[1] += pw[1]
        if not fold:
            fold = None
    _fold_cache_put(key, (hit[0], fold))
    return fold


def cube_versions(min_runs: int = 500, limit: int = 8) -> list[str]:
    """Game versions present in the entity cube with at least min_runs
    eligible runs, newest first. The detail page's version picker reads
    this now that the snapshot's version list is frozen."""
    hit = _entity_cube_with_mtime()
    if hit is None:
        return []
    counts: dict[str, int] = {}
    for cell, tw in (hit[1].get("runs") or {}).items():
        parts = cell.split("|")
        ver = parts[4] if len(parts) > 4 else ""
        if ver.startswith("v"):
            counts[ver] = counts.get(ver, 0) + tw[0]
    import re as _re

    def _natural(v: str) -> list[int]:
        return [int(x) for x in _re.findall(r"\d+", v)]

    vs = [v for v, n in counts.items() if n >= min_runs]
    return sorted(vs, key=_natural, reverse=True)[:limit]


_ENTITY_TYPES = ("cards", "relics", "potions")


def _matching_cells(cube: dict, parsed) -> tuple[int, int, int]:
    """(runs, wins, seats) over the cube cells one parsed bracket covers.
    Cubes built before seats were counted carry two numbers per cell; a
    run then counts as one seat."""
    mode, player, skill, version = parsed
    total = wins = seats = 0
    for cell, tw in (cube.get("runs") or {}).items():
        if _cell_matches(cell, mode, player, skill, version):
            total += tw[0]
            wins += tw[1]
            seats += tw[2] if len(tw) > 2 else tw[0]
    return total, wins, seats


def _fold_counts(section: dict | None, parsed, width: int) -> dict:
    """Sum a {cell: {id: [counts...]}} section over the bracket's cells
    into {id: [counts...]}, padding short rows (older cubes) with zeros."""
    mode, player, skill, version = parsed
    out: dict[str, list] = {}
    for cell, ids in (section or {}).items():
        if not _cell_matches(cell, mode, player, skill, version):
            continue
        for eid, counts in ids.items():
            cur = out.get(eid)
            if cur is None:
                cur = [0] * width
                out[eid] = cur
            for i, v in enumerate(counts[:width]):
                cur[i] += v
    for cur in out.values():
        if width > 4:
            cur[4] = round(cur[4], 3)
    return out


def _cube_offers(cube: dict, entity_type: str) -> dict:
    """The offers section for one entity type: nested per type in cubes
    built with relic offers, the bare card map in older ones."""
    offers = cube.get("offers") or {}
    if offers and set(offers) <= set(_ENTITY_TYPES):
        return offers.get(entity_type) or {}
    return offers if entity_type == "cards" else {}


def _entity_bracket_fold_uncached(entity_type: str, bracket: str) -> dict | None:
    """Fold the entity cube for one bracket (any mode x players x skill x
    version combination): {"entries": {id: [picks, wins, n_exp, wins_exp,
    exp_sum]}, "offers", "wax", "used", "total_runs", "total_wins",
    "total_seats", "data_through"}. None for unknown brackets or a missing
    cube (callers fall back to the snapshot's fixed buckets)."""
    parsed = _parse_lake_bracket(bracket)
    if parsed is None:
        return None
    hit = _entity_cube_with_mtime()
    if hit is None:
        return None
    cube = hit[1]
    per = (cube.get("entities") or {}).get(entity_type)
    if per is None:
        return None
    total, wins, seats = _matching_cells(cube, parsed)
    if total == 0:
        return None
    entries = _fold_counts(per, parsed, 5)
    # Offer/pick totals plus the 3-bucket per-act splits, folded from the
    # same matching cells.
    mode, player, skill, version = parsed
    offers: dict[str, dict] = {}
    for cell, ids in _cube_offers(cube, entity_type).items():
        if not _cell_matches(cell, mode, player, skill, version):
            continue
        for eid, buckets in ids.items():
            agg = offers.setdefault(
                eid,
                {
                    "offered": 0,
                    "picked": 0,
                    "off_act": [0, 0, 0],
                    "pick_act": [0, 0, 0],
                },
            )
            for b, op in buckets.items():
                i = int(b)
                if 0 <= i <= 2:
                    agg["offered"] += op[0]
                    agg["picked"] += op[1]
                    agg["off_act"][i] += op[0]
                    agg["pick_act"][i] += op[1]
    wax = _fold_counts(cube.get("wax"), parsed, 2) if entity_type == "relics" else {}
    used: dict[str, int] = {}
    if entity_type == "potions":
        for cell, ids in (cube.get("potion_used") or {}).items():
            if not _cell_matches(cell, mode, player, skill, version):
                continue
            for eid, n in ids.items():
                used[eid] = used.get(eid, 0) + n
    return {
        "entries": entries,
        "offers": offers,
        "wax": wax,
        "used": used,
        "total_runs": total,
        "total_wins": wins,
        "total_seats": seats,
        "parsed": parsed,
        "data_through": cube.get("data_through"),
    }


def _section_fold(name: str, bracket: str, width: int, nested: bool) -> dict | None:
    """Cached fold of one cube section (shops / events / rest) for a
    bracket: {"rows": ..., "total_runs", "total_wins", "total_seats"}.
    Nested sections ({cell: {group: {id: counts}}}) fold to
    {group: {id: counts}}, flat ones to {id: counts}."""
    hit = _entity_cube_with_mtime()
    if hit is None:
        return None
    key = (f"section:{name}", bracket)
    cached = _fold_cache.get(key)
    if cached is not None and cached[0] == hit[0]:
        return cached[1]
    parsed = _parse_lake_bracket(bracket)
    fold: dict | None = None
    if parsed is not None:
        cube = hit[1]
        total, wins, seats = _matching_cells(cube, parsed)
        section = cube.get(name)
        if total and section is not None:
            if nested:
                mode, player, skill, version = parsed
                groups: dict[str, dict] = {}
                for cell, per_group in section.items():
                    if not _cell_matches(cell, mode, player, skill, version):
                        continue
                    for g in per_group:
                        groups.setdefault(g, {})
                rows = {
                    g: _fold_counts(
                        {c: v.get(g) or {} for c, v in section.items()},
                        parsed,
                        width,
                    )
                    for g in groups
                }
            else:
                rows = _fold_counts(section, parsed, width)
            fold = {
                "rows": rows,
                "total_runs": total,
                "total_wins": wins,
                "total_seats": seats,
                "data_through": cube.get("data_through"),
            }
    _fold_cache_put(key, (hit[0], fold))
    return fold


def shop_bracket_fold(bracket: str) -> dict | None:
    """{etype: {id: [seen, bought, wins_bought, n_exp, wins_exp, exp_sum]}}
    for one bracket, with the bracket totals."""
    return _section_fold("shops", bracket, 6, nested=True)


def event_bracket_fold(bracket: str) -> dict | None:
    """{event: {option: [chosen, wins, n_exp, wins_exp, exp_sum]}} for one
    bracket, with the bracket totals."""
    return _section_fold("events", bracket, 5, nested=True)


def campfire_bracket_fold(bracket: str) -> dict | None:
    """{choice: [chosen, wins, low_hp, n_exp, wins_exp, exp_sum]} for one
    bracket, with the bracket totals."""
    return _section_fold("rest", bracket, 6, nested=False)


_ENCOUNTER_STORE_NAME = "encounter_store.json"


def _encounter_blob_keys(cell: str, recent: frozenset[str]) -> list[str]:
    """The encounter-blob bracket keys one cube cell contributes to,
    mirroring encounter_stats.new_accumulator: the 9 content brackets
    (mode is not an encounter axis — 'all' spans every mode), ver:<v> for
    recent versions, and <bracket>:<v> composites. Skill brackets are
    A10-gated and cumulative (wr30 includes the wr50/wr75 cohorts), the
    same fold rule the community cube uses."""
    parts = (cell or "").split("|")
    if len(parts) != 5:
        return []
    _mode, pc, a10, band, ver = parts
    keys = ["all"]
    pkey = {"1": "solo", "2": "2p", "3": "3p", "4": "4p"}.get(pc)
    if pkey:
        keys.append(pkey)
    if a10 == "1":
        keys.append("a10")
        try:
            b = int(band or 0)
        except ValueError:
            b = 0
        if b >= 1:
            keys.append("wr30")
        if b >= 2:
            keys.append("wr50")
        if b >= 3:
            keys.append("wr75")
    if ver in recent:
        composites = [f"{k}:{ver}" for k in keys if k != "all"]
        keys.append(f"ver:{ver}")
        keys.extend(composites)
    return keys


# A (encounter, act, room_type) row needs this many appearances in the ALL
# bracket to exist at all. Structurally weird runs (custom games starting at
# a later act put that act's boss in their first act array) created ghost
# rows like a 16-sample act-1 Aeonglass next to its 111k-sample act-3 row;
# a triple that's noise globally is a ghost everywhere, so it's dropped
# from every bracket, while legitimately small rows in niche brackets
# survive (ruling 2026-08-28).
_ENCOUNTER_ROW_MIN_ALL = 50


def _prune_ghost_rows(accs: dict[str, dict]) -> None:
    all_totals: dict[tuple, int] = {}
    for (enc, act, rt, _ch, _mp), vals in (accs.get("all") or {}).items():
        k = (enc, act, rt)
        all_totals[k] = all_totals.get(k, 0) + vals[0]
    ghosts = {k for k, t in all_totals.items() if t < _ENCOUNTER_ROW_MIN_ALL}
    if not ghosts:
        return
    for cells in accs.values():
        for ck in [k for k in cells if (k[0], k[1], k[2]) in ghosts]:
            del cells[ck]


def build_encounter_store(con=None) -> dict:
    """Per-bracket encounter-stats blob from the lake, in encounter_stats'
    finalized snapshot shape ({key: {"version": N, "cells": [[enc, act,
    room_type, character, mp, total, fatal, dmg, turns], ...]}}) so
    get_encounter_stats can rollup() from it unchanged. floor_events rows
    carry the walk's exact semantics (per-location party damage summed to
    the room, 1-based acts, prefix-stripped encounter ids), and a fatal is
    counted per visited room whose encounter matches the run's killer on a
    loss — the accumulator's rule, replicated."""
    from . import encounter_stats as es

    own = con is None
    if own:
        con = _connect(build=True)
    try:
        _prepare_sources(con, str(LAKE_DIR))
        # The version window must match the folds and the version pickers
        # (cube_versions: release-shaped, >=500 runs, natural-sorted).
        # Recency over raw build_ids let beta builds and stragglers crowd
        # out real versions — every version still gets submissions daily,
        # so max(submitted_at) is a near-tie across all of them. Reads the
        # previous cycle's cube (this store builds before the cube in the
        # cycle); a brand-new version appears one cycle later.
        recent = frozenset(cube_versions())
        rows = con.execute(
            f"""
            SELECT f.encounter, f.act, f.room_type, upper(e.character) AS ch,
              CASE WHEN coalesce(e.player_count, 1) > 1
                   THEN 'multi' ELSE 'solo' END AS mp,
              e.cell,
              count(*) AS total,
              count(*) FILTER (
                NOT e.win AND e.killed_by_encounter = f.encounter
              ) AS fatal,
              sum(coalesce(f.damage_taken, 0)) AS dmg,
              sum(coalesce(f.turns, 0)) AS turns
            FROM read_parquet('{LAKE_DIR}/floor_events.parquet') f
            JOIN cells e ON f.run_hash = e.run_hash
            WHERE f.room_type IN ('monster', 'elite', 'boss')
              AND f.encounter IS NOT NULL AND f.encounter <> ''
              AND f.act BETWEEN 1 AND 3
            GROUP BY 1, 2, 3, 4, 5, 6
            """
        ).fetchall()
        data_through = str(
            con.execute(
                f"SELECT max(submitted_at) FROM read_parquet('{LAKE_DIR}/runs.parquet')"
            ).fetchone()[0]
        )
    finally:
        if own:
            con.close()

    accs: dict[str, dict] = {}
    for enc, act, rt, ch, mp, cell, t, fa, d, tu in rows:
        ck = (enc, act, rt, ch, mp)
        for key in _encounter_blob_keys(cell, recent):
            cells = accs.setdefault(key, {})
            cur = cells.get(ck)
            if cur is None:
                cells[ck] = [t, fa, float(d or 0), float(tu or 0)]
            else:
                cur[0] += t
                cur[1] += fa
                cur[2] += float(d or 0)
                cur[3] += float(tu or 0)
    _prune_ghost_rows(accs)
    store: dict = {
        key: {
            "version": es.ENCOUNTER_VERSION,
            "cells": [
                [enc, act, rt, ch, mp, t, fa, round(d, 1), round(tu, 1)]
                for (enc, act, rt, ch, mp), (t, fa, d, tu) in cells.items()
            ],
        }
        for key, cells in accs.items()
    }
    store["data_through"] = data_through
    import json as _json

    tmp = LAKE_DIR / (_ENCOUNTER_STORE_NAME + ".tmp")
    tmp.write_text(_json.dumps(store, separators=(",", ":")))
    tmp.replace(LAKE_DIR / _ENCOUNTER_STORE_NAME)
    logger.info(
        "lake encounter store: %d bracket keys, %d bytes",
        len(accs),
        (LAKE_DIR / _ENCOUNTER_STORE_NAME).stat().st_size,
    )
    return store


_encounter_store_cache: tuple[float, dict] | None = None


def encounter_store_with_mtime() -> tuple[float, dict] | None:
    """Mtime-cached load of the ingest-built encounter store, or None."""
    global _encounter_store_cache
    try:
        path = LAKE_DIR / _ENCOUNTER_STORE_NAME
        if not path.exists():
            return None
        mtime = path.stat().st_mtime
        if _encounter_store_cache and _encounter_store_cache[0] == mtime:
            return _encounter_store_cache
        import json

        store = json.loads(path.read_text())
        _encounter_store_cache = (mtime, store)
        return _encounter_store_cache
    except Exception:
        logger.warning("encounter store load failed", exc_info=True)
        return None


def entity_store_with_mtime() -> tuple[float, dict] | None:
    """Mtime-cached load of the ingest-built entity store, or None."""
    global _entity_store_cache
    try:
        path = LAKE_DIR / _ENTITY_STORE_NAME
        if not path.exists():
            return None
        mtime = path.stat().st_mtime
        if _entity_store_cache and _entity_store_cache[0] == mtime:
            return _entity_store_cache
        import json

        store = json.loads(path.read_text())
        _entity_store_cache = (mtime, store)
        return _entity_store_cache
    except Exception:
        logger.warning("entity store load failed", exc_info=True)
        return None


def skip_summary() -> dict | None:
    """The reward-screen SKIP block from the entity store: fitted Elo plus
    screen totals and act buckets. Serves the scores endpoint's opt-in
    "SKIP" pseudo-entry; None until a store with the block is published."""
    hit = entity_store_with_mtime()
    if not hit:
        return None
    blk = hit[1].get("skip")
    return dict(blk) if blk else None


_SKILL_BRACKET_NAMES = {0: "a10", 1: "wr30", 2: "wr50", 3: "wr75"}


def bracket_elo_for(bracket: str | None, entity_type: str = "cards") -> dict | None:
    """Per-bracket Elo map for a lake bracket: the skill component's fit
    when the bracket has one (a10/wr30/wr50/wr75, alone or composite),
    else the game version's fit for version brackets. None otherwise —
    callers then fall back to the all-runs Elo. An entity absent from a
    returned map is below the head-to-head floor in that slice. Card maps
    sit under the bare bracket key, relic maps under "relics:<key>"."""
    parsed = _parse_lake_bracket(bracket)
    if not parsed:
        return None
    hit = entity_store_with_mtime()
    if not hit:
        return None
    bmap = hit[1].get("bracket_elo") or {}
    prefix = "" if entity_type == "cards" else f"{entity_type}:"
    _mode, _player, skill, version = parsed
    if skill is not None:
        return bmap.get(f"{prefix}{_SKILL_BRACKET_NAMES[skill]}") or None
    if version is not None:
        return bmap.get(f"{prefix}ver:{version}") or None
    return None


# ── Stats-summary core: the homepage numbers, from the lake ──────────────────


def _players_match(pc: int, players: str | None) -> bool:
    """The stats page's player-count filter against a run's party size,
    clamped to 4 the way _build_match clamps it (4 means four or more)."""
    if players is None:
        return True
    if players in ("single", "1"):
        return pc == 1
    if players == "4":
        return pc >= 4
    if players == "multi":
        return pc > 1
    return pc == int(players)


def _stats_core_results() -> list[tuple[dict, dict]]:
    """(filters, core-result) for every materialized stats combo, computed
    from one pass over runs.parquet with get_stats' core semantics:
    ascension clamped to 0-10, hidden/deleted runs excluded via the sidecar
    (matching every other lake surface), characters[] built without the
    character filter and restricted to official ids, win_rate rounded to
    one decimal."""
    from .runs_db_mongo import (
        ASCENSION_FILTER_COMBOS,
        HOT_FILTER_COMBOS,
        OFFICIAL_CHARACTERS,
        PLAYERS_FILTER_COMBOS,
    )

    con = _connect()
    try:
        cells = con.execute(
            f"""
            SELECT coalesce(upper(r.character), '') AS ch,
              coalesce(r.ascension, 0)::INT AS asc,
              least(coalesce(r.player_count, 1), 4)::INT AS pc,
              count(*) AS n, count(*) FILTER (r.win) AS w,
              count(*) FILTER (r.was_abandoned) AS ab
            FROM read_parquet('{LAKE_DIR}/runs.parquet') r
            ANTI JOIN read_parquet('{LAKE_DIR}/excluded.parquet') x
              ON r.run_hash = x.run_hash
            WHERE r.ascension BETWEEN 0 AND 10
            GROUP BY 1, 2, 3
            """
        ).fetchall()
    finally:
        con.close()

    def pct(w: int, n: int) -> float:
        return round(w / n * 100, 1) if n > 0 else 0

    out: list[tuple[dict, dict]] = []
    # Canonical counting (ruling 2026-08-27): totals cover OFFICIAL
    # characters only, so every headline equals the sum of its character
    # table; abandons stay their own visible number, never folded into
    # losses; win_rate remains wins over total attempts.
    cells = [c for c in cells if c[0] in OFFICIAL_CHARACTERS]
    for f in [*HOT_FILTER_COMBOS, *ASCENSION_FILTER_COMBOS, *PLAYERS_FILTER_COMBOS]:
        char_f = f.get("character")
        asc_f = int(f["ascension"]) if "ascension" in f else None
        pl_f = f.get("players")
        filters = {
            "character": char_f,
            "win": None,
            "ascension": f.get("ascension"),
            "game_mode": None,
            "players": pl_f,
            "username": None,
        }
        rows = [
            c
            for c in cells
            if (char_f is None or c[0] == char_f)
            and (asc_f is None or c[1] == asc_f)
            and _players_match(c[2], pl_f)
        ]
        total = sum(c[3] for c in rows)
        if total == 0:
            out.append((f, {"total_runs": 0, "filters": filters}))
            continue
        wins = sum(c[4] for c in rows)
        abandoned = sum(c[5] for c in rows)
        no_char = [
            c
            for c in cells
            if (asc_f is None or c[1] == asc_f) and _players_match(c[2], pl_f)
        ]
        char_totals: dict[str, list[int]] = {}
        for c in no_char:
            rec = char_totals.setdefault(c[0], [0, 0, 0])
            rec[0] += c[3]
            rec[1] += c[4]
            rec[2] += c[5]
        asc_totals: dict[int, list[int]] = {}
        for c in rows:
            rec = asc_totals.setdefault(c[1], [0, 0, 0])
            rec[0] += c[3]
            rec[1] += c[4]
            rec[2] += c[5]
        out.append(
            (
                f,
                {
                    "total_runs": total,
                    "total_wins": wins,
                    "total_abandoned": abandoned,
                    "win_rate": pct(wins, total),
                    "filters": filters,
                    "characters": [
                        {
                            "character": ch,
                            "total": t,
                            "wins": w,
                            "abandoned": ab,
                            "win_rate": pct(w, t),
                        }
                        for ch, (t, w, ab) in sorted(
                            char_totals.items(), key=lambda kv: -kv[1][0]
                        )
                    ],
                    "ascensions": [
                        {
                            "level": a,
                            "total": t,
                            "wins": w,
                            "abandoned": ab,
                            "win_rate": pct(w, t),
                        }
                        for a, (t, w, ab) in sorted(asc_totals.items())
                    ],
                },
            )
        )
    return out


def refresh_stats_core() -> int:
    """Merge lake-computed core fields into every materialized stats doc,
    preserving the legacy deep tables until their own conversion. Sub-second
    where the Mongo aggregation chain took minutes and timed out."""
    from datetime import datetime, timezone

    from . import cache as app_cache
    from .runs_db_mongo import _filter_key, _summary_coll, seed_stats_counters

    coll = _summary_coll()
    written = 0
    deep: dict[str, dict] = {}
    if (os.environ.get("LAKE_DEEP_TABLES", "") or "").strip().lower() == "on":
        deep = deep_tables_by_key()
    for filters, result in _stats_core_results():
        key = _filter_key(**filters_compact(filters))
        if result.get("total_runs"):
            existing = coll.find_one({"_id": key}) or {}
            merged = {
                **existing,
                **result,
                **deep.get(key, {}),
                "_id": key,
                "updated_at": datetime.now(timezone.utc),
            }
        else:
            merged = {
                **result,
                "_id": key,
                "updated_at": datetime.now(timezone.utc),
            }
        coll.replace_one({"_id": key}, merged, upsert=True)
        cache_doc = {k: v for k, v in merged.items() if k not in ("_id", "updated_at")}
        try:
            app_cache.set_json(
                app_cache.stats_key(**filters_compact(filters)),
                cache_doc,
                ttl_seconds=app_cache.WARM_TTL_SECONDS,
            )
        except Exception:
            logger.warning("stats core redis warm failed", exc_info=True)
        if not filters_compact(filters):
            try:
                seed_stats_counters(result)
            except Exception:
                logger.warning("stats counters seed failed", exc_info=True)
        written += 1
    logger.info("lake stats core refreshed: %d combos", written)
    return written


def filters_compact(filters: dict) -> dict:
    """The sparse combo form the legacy key/cache helpers expect."""
    return {k: v for k, v in filters.items() if v is not None}


_DEEP_TABLES_NAME = "deep_tables.json"


def _parquet_columns(con, name: str) -> set[str]:
    res = con.execute(
        f"SELECT * FROM read_parquet('{LAKE_DIR}/{name}.parquet') LIMIT 0"
    )
    return {d[0] for d in res.description}


def _fold_deep(rows, char_f, asc_f, official, pl_f=None):
    """Sum grouped (character, ascension, party size, key, *counts) rows into
    one combo's {key: (counts...)} map. The official filter applies even
    unfiltered, matching get_stats' _build_match."""
    out: dict[str, list[int]] = {}
    for ch, a, pc, key, *counts in rows:
        if ch not in official:
            continue
        if char_f is not None and ch != char_f:
            continue
        if asc_f is not None and a != asc_f:
            continue
        if not _players_match(pc, pl_f):
            continue
        if key is None:
            continue
        rec = out.setdefault(key, [0] * len(counts))
        for i, c in enumerate(counts):
            rec[i] += c or 0
    return out


def build_deep_tables() -> int:
    """Per-combo deep item tables for the materialized stats docs, replacing
    the retired refresh_stats_summary aggregation (~80 min of Mongo doc
    scanning per refresh). Five grouped passes over the lake folded across
    the stats_core combos; refresh_stats_core merges the stored artifact
    when LAKE_DEEP_TABLES=on. Counting stays per player like the legacy
    per-player docs (item stats dedupe per run+player+item), except shop
    potion offers count once per run instead of once per party sibling."""
    import json as _json

    from .runs_db_mongo import (
        ASCENSION_FILTER_COMBOS,
        HOT_FILTER_COMBOS,
        OFFICIAL_CHARACTERS,
        PLAYERS_FILTER_COMBOS,
    )

    if not available():
        logger.info("deep tables skipped: lake incomplete")
        return 0
    runs_p = f"read_parquet('{LAKE_DIR}/runs.parquet')"
    excl_p = f"read_parquet('{LAKE_DIR}/excluded.parquet')"
    players_p = f"read_parquet('{LAKE_DIR}/players.parquet')"
    con = _connect(build=True)
    try:
        _ensure_choice_rows(con)
        deaths = con.execute(
            f"""
            SELECT coalesce(upper(r.character), '') AS ch,
              coalesce(r.ascension, 0)::INT AS a,
              least(coalesce(r.player_count, 1), 4)::INT AS pc,
              coalesce(r.killed_by_encounter, r.killed_by_event) AS kb,
              count(*) AS n
            FROM {runs_p} r
            ANTI JOIN {excl_p} x ON r.run_hash = x.run_hash
            WHERE r.ascension BETWEEN 0 AND 10
              AND NOT coalesce(r.win, false)
              AND coalesce(r.killed_by_encounter, r.killed_by_event) IS NOT NULL
              -- The game stamps ENCOUNTER.NONE on deaths with no killer;
              -- counting it crowned "NONE" the deadliest encounter.
              AND coalesce(r.killed_by_encounter, r.killed_by_event)
                  NOT IN ('NONE', '')
            GROUP BY 1, 2, 3, 4
            """
        ).fetchall()
        picks = con.execute(
            f"""
            SELECT p.character AS ch, coalesce(r.ascension, 0)::INT AS a,
              least(coalesce(r.player_count, 1), 4)::INT AS pc,
              c.cid, count(*) AS offered, count(*) FILTER (c.picked) AS picked
            FROM choice_rows c
            JOIN {players_p} p
              ON c.run_hash = p.run_hash AND c.pidx = p.player_idx
            JOIN {runs_p} r ON c.run_hash = r.run_hash
            GROUP BY 1, 2, 3, 4
            """
        ).fetchall()

        def item_rows(table: str, col: str):
            return con.execute(
                f"""
                SELECT ch, a, pc, item, sum(copies)::BIGINT,
                  coalesce(sum(copies) FILTER (win), 0)::BIGINT,
                  coalesce(sum(copies) FILTER (NOT win), 0)::BIGINT,
                  count(*)::BIGINT, count(*) FILTER (win)::BIGINT
                FROM (
                  SELECT d.character AS ch, coalesce(r.ascension, 0)::INT AS a,
                    least(coalesce(r.player_count, 1), 4)::INT AS pc,
                    d.{col} AS item, d.run_hash, d.player_idx,
                    count(*) AS copies, bool_or(coalesce(r.win, false)) AS win
                  FROM read_parquet('{LAKE_DIR}/{table}.parquet') d
                  JOIN {runs_p} r ON d.run_hash = r.run_hash
                  ANTI JOIN {excl_p} x ON d.run_hash = x.run_hash
                  WHERE r.ascension BETWEEN 0 AND 10 AND d.{col} IS NOT NULL
                  GROUP BY 1, 2, 3, 4, d.run_hash, d.player_idx
                ) GROUP BY 1, 2, 3, 4
                """
            ).fetchall()

        cards = item_rows("deck", "card")
        relics = item_rows("relics", "relic")
        potions_owned = item_rows("potions", "potion")

        # The potion telemetry columns only exist in lakes built after the
        # schema gained them; older lakes omit the section and the doc merge
        # keeps whatever the summary already holds.
        used = []
        if "was_used" in _parquet_columns(con, "potions"):
            used = con.execute(
                f"""
                SELECT d.character AS ch, coalesce(r.ascension, 0)::INT AS a,
                  least(coalesce(r.player_count, 1), 4)::INT AS pc,
                  d.potion AS item, count(*) FILTER (d.was_used)::BIGINT AS used
                FROM read_parquet('{LAKE_DIR}/potions.parquet') d
                JOIN {runs_p} r ON d.run_hash = r.run_hash
                ANTI JOIN {excl_p} x ON d.run_hash = x.run_hash
                WHERE r.ascension BETWEEN 0 AND 10
                GROUP BY 1, 2, 3, 4
                """
            ).fetchall()
        shop = []
        if (LAKE_DIR / "shop_potions.parquet").exists():
            shop = con.execute(
                f"""
                SELECT p.character AS ch, coalesce(r.ascension, 0)::INT AS a,
                  least(coalesce(r.player_count, 1), 4)::INT AS pc,
                  s.potion AS item, count(*) AS offered,
                  count(*) FILTER (s.was_picked)::BIGINT AS picked
                FROM read_parquet('{LAKE_DIR}/shop_potions.parquet') s
                JOIN {players_p} p
                  ON s.run_hash = p.run_hash AND s.player_idx = p.player_idx
                JOIN {runs_p} r ON s.run_hash = r.run_hash
                ANTI JOIN {excl_p} x ON s.run_hash = x.run_hash
                WHERE r.ascension BETWEEN 0 AND 10
                GROUP BY 1, 2, 3, 4
                """
            ).fetchall()
    finally:
        con.close()

    def pct(a: int, b: int) -> float:
        return round(a / b * 100, 1) if b > 0 else 0

    official = frozenset(OFFICIAL_CHARACTERS)
    combos = []
    for f in [*HOT_FILTER_COMBOS, *ASCENSION_FILTER_COMBOS, *PLAYERS_FILTER_COMBOS]:
        char_f = f.get("character")
        asc_f = int(f["ascension"]) if "ascension" in f else None
        pl_f = f.get("players")
        d = _fold_deep(deaths, char_f, asc_f, official, pl_f)
        pk = _fold_deep(picks, char_f, asc_f, official, pl_f)
        cd = _fold_deep(cards, char_f, asc_f, official, pl_f)
        rl = _fold_deep(relics, char_f, asc_f, official, pl_f)
        tables: dict = {
            "deadliest": [
                {"encounter": k, "count": v[0]}
                for k, v in sorted(d.items(), key=lambda kv: -kv[1][0])[:10]
            ],
            "pick_rates": [
                {
                    "card_id": k,
                    "offered": v[0],
                    "picked": v[1],
                    "pick_rate": pct(v[1], v[0]),
                }
                for k, v in sorted(pk.items(), key=lambda kv: -kv[1][0])
            ],
            "top_cards": [
                {
                    "card_id": k,
                    "count": v[0],
                    "in_wins": v[1],
                    "in_losses": v[2],
                    "total_runs_with": v[3],
                    "win_runs": v[4],
                }
                for k, v in sorted(cd.items(), key=lambda kv: -kv[1][0])
            ],
            "top_relics": [
                {
                    "relic_id": k,
                    "count": v[0],
                    "total_runs_with": v[3],
                    "win_runs": v[4],
                }
                for k, v in sorted(rl.items(), key=lambda kv: -kv[1][0])
            ],
        }
        if shop and used:
            po = _fold_deep(potions_owned, char_f, asc_f, official, pl_f)
            us = _fold_deep(used, char_f, asc_f, official, pl_f)
            sh = _fold_deep(shop, char_f, asc_f, official, pl_f)
            tables["top_potions"] = [
                {
                    "potion_id": k,
                    "offered": v[0],
                    "picked": v[1],
                    "used": us.get(k, [0])[0],
                    "total_runs_with": po.get(k, [0] * 5)[3],
                    "win_runs": po.get(k, [0] * 5)[4],
                    "pick_rate": pct(v[1], v[0]),
                }
                for k, v in sorted(sh.items(), key=lambda kv: -kv[1][0])
            ]
        combos.append({"filters": filters_compact({**f}), "tables": tables})

    doc = {"combos": combos}
    tmp = LAKE_DIR / (_DEEP_TABLES_NAME + ".tmp")
    tmp.write_text(_json.dumps(doc, separators=(",", ":")))
    tmp.replace(LAKE_DIR / _DEEP_TABLES_NAME)
    logger.info("deep tables stored: %d combos", len(combos))
    return len(combos)


def leaderboard_boards() -> dict[str, dict] | None:
    """Every HOT leaderboard combo computed from the lake in one pass over
    a shared winning-runs table (the Mongo aggregation took ~10 minutes per
    cycle; this takes seconds). Row shape mirrors _row_to_dict; the total
    mirrors the legacy 10k count cap. None when the lake is incomplete."""
    from .runs_db_mongo import (
        HOT_LEADERBOARD_COMBOS,
        LEADERBOARD_BOARD_ROWS,
        OFFICIAL_CHARACTERS,
        _leaderboard_key,
    )

    if not available():
        return None
    con = _connect(build=True)
    try:
        con.execute(
            f"""
            CREATE OR REPLACE TEMP TABLE lb AS
            SELECT r.run_hash, upper(r.character) AS character,
              coalesce(r.ascension, 0)::INT AS ascension,
              lower(coalesce(r.game_mode, 'standard')) AS game_mode,
              r.run_time, coalesce(r.player_count, 1)::INT AS player_count,
              s.floors_reached, s.deck_size, s.relic_count, s.username,
              r.submitted_at, r.build_id,
              coalesce(r.was_abandoned, false) AS was_abandoned
            FROM read_parquet('{LAKE_DIR}/runs.parquet') r
            LEFT JOIN read_parquet('{LAKE_DIR}/run_scalars.parquet') s
              USING (run_hash)
            ANTI JOIN read_parquet('{LAKE_DIR}/excluded.parquet') x
              ON r.run_hash = x.run_hash
            WHERE coalesce(try_cast(r.win AS BOOLEAN), false)
              AND r.ascension BETWEEN 0 AND 10
            """
        )
        cols = (
            "run_hash, character, ascension, game_mode, run_time,"
            " floors_reached, deck_size, relic_count, username, submitted_at,"
            " build_id, was_abandoned"
        )
        out: dict[str, dict] = {}
        for combo in HOT_LEADERBOARD_COMBOS:
            cat = combo.get("category", "fastest")
            ch, pl, gm = (
                combo.get("character"),
                combo.get("players"),
                combo.get("game_mode"),
            )
            where: list[str] = []
            args: list = []
            if ch:
                where.append("character = ?")
                args.append(ch.upper())
            else:
                ph = ", ".join("?" for _ in OFFICIAL_CHARACTERS)
                where.append(f"character IN ({ph})")
                args.extend(OFFICIAL_CHARACTERS)
            if pl in ("single", "1"):
                where.append("player_count = 1")
            elif pl in ("2", "3"):
                where.append("player_count = ?")
                args.append(int(pl))
            elif pl == "4":
                where.append("player_count >= 4")
            elif pl == "multi":
                where.append("player_count > 1")
            if gm:
                where.append("game_mode = ?")
                args.append(gm)
            wsql = " AND ".join(where)
            order = (
                "ascension DESC, run_time ASC"
                if cat == "highest_ascension"
                else "run_time ASC"
            )
            rows = con.execute(
                f"SELECT {cols} FROM lb WHERE {wsql} ORDER BY {order}"
                f" LIMIT {int(LEADERBOARD_BOARD_ROWS)}",
                args,
            ).fetchall()
            total = min(
                con.execute(f"SELECT count(*) FROM lb WHERE {wsql}", args).fetchone()[
                    0
                ],
                10_000,
            )
            runs = [
                {
                    "run_hash": r[0],
                    "character": r[1],
                    "win": 1,
                    "was_abandoned": int(bool(r[11])),
                    "ascension": r[2],
                    "game_mode": r[3],
                    "run_time": r[4],
                    "floors_reached": r[5],
                    "deck_size": r[6],
                    "relic_count": r[7],
                    "username": r[8],
                    "submitted_at": r[9].isoformat() if r[9] is not None else None,
                    "build_id": r[10],
                }
                for r in rows
            ]
            out[
                _leaderboard_key(category=cat, character=ch, players=pl, game_mode=gm)
            ] = {
                "runs": runs,
                "total": total,
                "page": 1,
                "per_page": 50,
                "total_pages": (total + 49) // 50,
                "category": cat,
            }
        return out
    finally:
        con.close()


def deep_tables_by_key() -> dict[str, dict]:
    """{summary-doc key: tables} from the stored artifact; {} when absent."""
    import json as _json

    from .runs_db_mongo import _filter_key

    try:
        doc = _json.loads((LAKE_DIR / _DEEP_TABLES_NAME).read_text())
    except Exception:
        return {}
    return {
        _filter_key(**c.get("filters", {})): c.get("tables", {})
        for c in doc.get("combos", [])
    }


_warmer_started = False


def start_artifact_warmer(interval: int = 60) -> None:
    """Per-worker daemon that re-reads every serving artifact on a timer,
    so the multi-MB gunzip+parse after a pull happens here instead of in
    the first visitor's request. Accessors are mtime-cached: an unchanged
    artifact costs one stat() per tick, and the hot folds only recompute
    when the cube's mtime moved."""
    global _warmer_started
    if _warmer_started:
        return
    _warmer_started = True
    import threading
    import time

    def _tick() -> None:
        for load in (
            lambda: community_payload(None),
            lambda: community_payload("a10"),
            _entity_cube_with_mtime,
            entity_store_with_mtime,
            encounter_store_with_mtime,
            deep_tables_by_key,
        ):
            try:
                load()
            except Exception:
                pass
        try:
            from . import charts_blob_lake

            charts_blob_lake.charts_blob_with_mtime()
        except Exception:
            pass
        try:
            hot = ["a10", "wr30", "wr50", "wr75", "solo", "2p", *cube_versions()]
            for etype in ("cards", "relics", "potions"):
                for bk in hot:
                    entity_bracket_fold(etype, bk)
        except Exception:
            pass

    def _loop() -> None:
        while True:
            _tick()
            time.sleep(interval)

    threading.Thread(target=_loop, daemon=True, name="lake-warmer").start()
