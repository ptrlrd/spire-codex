"""Charts blob built from the lake, replacing the frozen snapshot's copy.

DuckDB does the reading, filtering, eligibility, and bracket assignment;
the fold is charts_stats.accumulate() itself, so every accumulation
semantic (floor caps, first-room reads, dedup sets, deck growth) is
inherited from the proven walk code instead of re-implemented in SQL.
One nested query aggregates each run's floors/deck/relics/potions into
lists, so the builder streams complete runs in a single pass with no
ordering requirement on the parquet files and no per-run cursor merge.

Serving follows the fallback ruling (2026-08-29): current generation ->
previous generation -> empty. Never the snapshot.
"""

from __future__ import annotations

import gzip
import json
import logging
from datetime import datetime

from . import charts_stats
from .lake_stats import (
    _ELIGIBLE_SQL,
    LAKE_DIR,
    _connect,
    _ensure_cells,
    cube_versions,
)

logger = logging.getLogger(__name__)

_BLOB_NAME = "charts_blob.json.gz"
_BLOB_PREV_NAME = "charts_blob.prev.json.gz"

_WR_BY_BAND = {1: "wr30", 2: "wr50", 3: "wr75"}


def _run_brackets(cell: str, versions: set[str]) -> list[str]:
    """Bracket keys one run's cell folds into: the skill ladder the walk
    used, plus version and skill x version composites for cube versions.
    accumulate() ignores keys the accumulator wasn't seeded with."""
    parts = cell.split("|")
    a10 = len(parts) > 2 and parts[2] == "1"
    band = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else 0
    ver = parts[4] if len(parts) > 4 else ""
    keys = ["all"]
    if a10:
        keys.append("a10")
        for b in range(1, band + 1):
            keys.append(_WR_BY_BAND[b])
    if ver in versions:
        keys.append(ver)
        for k in list(keys[1:-1]):
            keys.append(f"{k}:{ver}")
    return keys


def _players_from_nested(deck, relics, potions) -> list[dict]:
    players: dict[int, dict] = {}

    def slot(pidx) -> dict:
        return players.setdefault(
            int(pidx or 1), {"deck": [], "relics": [], "potions": []}
        )

    for d in deck:
        c: dict = {"id": d["card"], "floor_added_to_deck": d["fa"]}
        if d["ench"]:
            c["enchantment"] = {"id": d["ench"]}
        slot(d["pidx"])["deck"].append(c)
    for r in relics:
        slot(r["pidx"])["relics"].append({"id": r["relic"]})
    for p in potions:
        slot(p["pidx"])["potions"].append({"id": p["potion"]})
    return [players[k] for k in sorted(players)]


def _history_from_nested(floors) -> list[list[dict]]:
    """Nested floor structs (sorted by act, floor_idx) -> map_point_history."""
    acts: list[list[dict]] = []
    cur_act = None
    for fl in floors:
        if fl["act"] != cur_act:
            acts.append([])
            cur_act = fl["act"]
        room = {}
        if fl["room_type"] or fl["room_model"]:
            room = {
                "room_type": fl["room_type"],
                "model_id": fl["room_model"],
                "turns_taken": fl["room_turns"],
            }
        stats = [
            {
                "max_hp": p["max_hp"],
                "current_hp": p["current_hp"],
                "current_gold": p["current_gold"],
                "damage_taken": p["damage_taken"],
                "rest_site_choices": ["SMITH"] * int(p["smiths"] or 0),
                "event_choices": [
                    {"title": {"key": k, "table": "events"}}
                    for k in (p["events"] or [])
                ],
            }
            for p in (fl["players"] or [])
        ]
        acts[-1].append({"rooms": [room] if room else [], "player_stats": stats})
    return acts


# Staged build: every source is written ONCE to hash-bucketed parquet
# (eligible runs only, columns pre-projected, the per-floor player list
# pre-shaped), then each bucket is aggregated and streamed on its own.
# The nested list() aggregates cannot spill, and an ordered list(...)
# buffers its whole input first: the first full-corpus run OOM'd the
# 4.5GB cap even at 1/8 of the runs (2026-09-01). Lists are unordered
# here and each run's floors are sorted in Python instead.
_BUCKETS = 32
_STAGE_DIR = "charts_stage"

_STAGE_META_SQL = """
    COPY (
      SELECT (hash(c.run_hash) % {n})::UTINYINT AS bucket, c.run_hash,
        coalesce(c.character, '') AS character, coalesce(c.win, false) AS win,
        coalesce(c.was_abandoned, false) AS was_abandoned,
        coalesce(c.player_count, 1) AS player_count,
        coalesce(c.played_at, c.submitted_at) AS played, c.cell
      FROM cells c
    ) TO '{stage}/meta' (FORMAT PARQUET, PARTITION_BY (bucket), COMPRESSION ZSTD, ROW_GROUP_SIZE 20000)
"""

_STAGE_FLOORS_SQL = """
    COPY (
      SELECT (hash(f.run_hash) % {n})::UTINYINT AS bucket, f.run_hash, f.act,
        f.floor_idx, f.room_type, f.room_model, f.room_turns,
        [struct_pack(
          max_hp := p.max_hp, current_hp := p.current_hp,
          current_gold := p.current_gold, damage_taken := p.damage_taken,
          smiths := len(list_filter(p.rest_site_choices, x -> x = 'SMITH')),
          events := [t."key" FOR t IN [e.title FOR e IN p.event_choices]
                     IF t."table" = 'events']
        ) FOR p IN f.players] AS players
      FROM read_parquet('{lake}/floors.parquet') f
      SEMI JOIN cells c ON c.run_hash = f.run_hash
    ) TO '{stage}/floors' (FORMAT PARQUET, PARTITION_BY (bucket), COMPRESSION ZSTD, ROW_GROUP_SIZE 20000)
"""

_STAGE_ROWS_SQL = """
    COPY (
      SELECT (hash(t.run_hash) % {n})::UTINYINT AS bucket, t.run_hash,
        t.player_idx, {cols}
      FROM read_parquet('{lake}/{table}.parquet') t
      SEMI JOIN cells c ON c.run_hash = t.run_hash
    ) TO '{stage}/{table}' (FORMAT PARQUET, PARTITION_BY (bucket), COMPRESSION ZSTD, ROW_GROUP_SIZE 20000)
"""

_STAGE_CHILD_COLS = {
    "deck": "t.card, t.floor_added AS fa, t.enchantment AS ench",
    "relics": "t.relic",
    "potions": "t.potion",
}

# Per-bucket assembly. Child CTEs are substituted per bucket so a table
# with no rows in a bucket becomes a typed empty relation instead of a
# read_parquet() over zero files.
_BUCKET_SQL = """
    WITH fl AS ({floors}),
    dk AS ({deck}),
    rl AS ({relics}),
    pt AS ({potions})
    SELECT m.run_hash, m.character, m.win, m.was_abandoned, m.player_count,
      m.played, m.cell, fl.floors, dk.deck, rl.relics, pt.potions
    FROM read_parquet('{stage}/meta/*/*.parquet', hive_partitioning = true) m
    LEFT JOIN fl USING (run_hash)
    LEFT JOIN dk USING (run_hash)
    LEFT JOIN rl USING (run_hash)
    LEFT JOIN pt USING (run_hash)
    WHERE m.bucket = {b}
"""

_CHILD_AGG = {
    "floors": (
        "SELECT run_hash, list(struct_pack(act := act, floor_idx := floor_idx,"
        " room_type := room_type, room_model := room_model,"
        " room_turns := room_turns, players := players)) AS floors"
        " FROM read_parquet('{stage}/floors/*/*.parquet', hive_partitioning = true)"
        " WHERE bucket = {b} GROUP BY 1",
        "SELECT NULL::VARCHAR AS run_hash, NULL::STRUCT(act BIGINT, floor_idx BIGINT,"
        " room_type VARCHAR, room_model VARCHAR, room_turns BIGINT,"
        " players STRUCT(max_hp BIGINT, current_hp BIGINT, current_gold BIGINT,"
        " damage_taken BIGINT, smiths BIGINT, events VARCHAR[])[])[] AS floors"
        " WHERE false",
    ),
    "deck": (
        "SELECT run_hash, list(struct_pack(pidx := player_idx, card := card,"
        " fa := fa, ench := ench)) AS deck"
        " FROM read_parquet('{stage}/deck/*/*.parquet', hive_partitioning = true)"
        " WHERE bucket = {b} GROUP BY 1",
        "SELECT NULL::VARCHAR AS run_hash, NULL::STRUCT(pidx BIGINT, card VARCHAR,"
        " fa BIGINT, ench VARCHAR)[] AS deck WHERE false",
    ),
    "relics": (
        "SELECT run_hash, list(struct_pack(pidx := player_idx, relic := relic))"
        " AS relics"
        " FROM read_parquet('{stage}/relics/*/*.parquet', hive_partitioning = true)"
        " WHERE bucket = {b} GROUP BY 1",
        "SELECT NULL::VARCHAR AS run_hash, NULL::STRUCT(pidx BIGINT,"
        " relic VARCHAR)[] AS relics WHERE false",
    ),
    "potions": (
        "SELECT run_hash, list(struct_pack(pidx := player_idx, potion := potion))"
        " AS potions"
        " FROM read_parquet('{stage}/potions/*/*.parquet', hive_partitioning = true)"
        " WHERE bucket = {b} GROUP BY 1",
        "SELECT NULL::VARCHAR AS run_hash, NULL::STRUCT(pidx BIGINT,"
        " potion VARCHAR)[] AS potions WHERE false",
    ),
}


def _stage_sources(con, stage) -> None:
    import shutil

    shutil.rmtree(stage, ignore_errors=True)
    stage.mkdir(parents=True)
    lake, st, n = str(LAKE_DIR), str(stage), _BUCKETS
    con.execute(_STAGE_META_SQL.format(n=n, stage=st))
    con.execute(_STAGE_FLOORS_SQL.format(n=n, stage=st, lake=lake))
    for table, cols in _STAGE_CHILD_COLS.items():
        con.execute(
            _STAGE_ROWS_SQL.format(n=n, stage=st, lake=lake, table=table, cols=cols)
        )


def _bucket_query(stage, b: int) -> str:
    parts = {}
    for table, (agg, empty) in _CHILD_AGG.items():
        has_files = any((stage / table).rglob("*.parquet"))
        parts[table] = agg.format(stage=str(stage), b=b) if has_files else empty
    return _BUCKET_SQL.format(stage=str(stage), b=b, **parts)


def build_charts_blob() -> dict | None:
    """Build and store the finalized charts blob from the lake. Returns the
    blob or None when the lake is incomplete."""
    import shutil

    con = _connect(build=True)
    stage = LAKE_DIR / "tmp" / _STAGE_DIR
    try:
        con.execute(_ELIGIBLE_SQL.format(lake=LAKE_DIR))
        _ensure_cells(con, str(LAKE_DIR))
        # Fewer threads: parallel hash aggregation keeps thread-local list
        # state; the budget here is memory, not wall clock.
        con.execute("SET threads=3")
        _stage_sources(con, stage)
        versions = cube_versions()
        vset = set(versions)
        acc = charts_stats.new_accumulator(versions)
        bracket_cache: dict[str, list[str]] = {}
        n = 0
        for b in range(_BUCKETS):
            res = con.execute(_bucket_query(stage, b))
            while True:
                rows = res.fetchmany(64)
                if not rows:
                    break
                for row in rows:
                    _h, ch, win, ab, pc, played, cellv = row[:7]
                    floors, deck, relics, potions = row[7:]
                    floors = sorted(
                        floors or [], key=lambda fl: (fl["act"], fl["floor_idx"])
                    )
                    brs = bracket_cache.get(cellv)
                    if brs is None:
                        brs = _run_brackets(cellv, vset)
                        bracket_cache[cellv] = brs
                    blob = {
                        "map_point_history": _history_from_nested(floors),
                        "players": _players_from_nested(
                            deck or [], relics or [], potions or []
                        ),
                        "was_abandoned": bool(ab),
                    }
                    charts_stats.accumulate(
                        acc,
                        blob,
                        brackets=brs,
                        is_win=bool(win),
                        character=ch,
                        player_count=int(pc),
                        played=played if isinstance(played, datetime) else None,
                    )
                    n += 1
    finally:
        try:
            con.execute("SET threads=5")
        except Exception:
            pass
        con.close()
        shutil.rmtree(stage, ignore_errors=True)
    if not n:
        return None

    blob = charts_stats.finalize(acc)
    cur_path = LAKE_DIR / _BLOB_NAME
    tmp = LAKE_DIR / (_BLOB_NAME + ".tmp")
    with gzip.open(tmp, "wt", encoding="utf-8", compresslevel=6) as f:
        json.dump(blob, f, separators=(",", ":"))
    if cur_path.exists():
        cur_path.replace(LAKE_DIR / _BLOB_PREV_NAME)
    tmp.replace(cur_path)
    logger.info(
        "charts blob stored: %d runs, %d brackets, %d bytes",
        n,
        len(blob),
        cur_path.stat().st_size,
    )
    return blob


_blob_cache: tuple[float, dict] | None = None


def charts_blob_with_mtime() -> tuple[float, dict] | None:
    """Current generation, else previous, else None — per the fallback
    ruling the frozen snapshot is never served."""
    global _blob_cache
    for name in (_BLOB_NAME, _BLOB_PREV_NAME):
        path = LAKE_DIR / name
        try:
            if not path.exists():
                continue
            mtime = path.stat().st_mtime
            if _blob_cache and _blob_cache[0] == mtime:
                return _blob_cache
            with gzip.open(path, "rt", encoding="utf-8") as f:
                _blob_cache = (mtime, json.load(f))
            return _blob_cache
        except Exception:
            logger.warning("charts blob load failed for %s", name, exc_info=True)
    return None
