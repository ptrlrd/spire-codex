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


_NESTED_SQL = """
    WITH fl AS (
      SELECT f.run_hash,
        list(struct_pack(
          act := f.act, floor_idx := f.floor_idx, room_type := f.room_type,
          room_model := f.room_model, room_turns := f.room_turns,
          players := [struct_pack(
            max_hp := p.max_hp, current_hp := p.current_hp,
            current_gold := p.current_gold, damage_taken := p.damage_taken,
            smiths := len(list_filter(p.rest_site_choices, x -> x = 'SMITH')),
            events := [t."key" FOR t IN [e.title FOR e IN p.event_choices]
                       IF t."table" = 'events']
          ) FOR p IN f.players]
        ) ORDER BY f.act, f.floor_idx) AS floors
      FROM read_parquet('{lake}/floors.parquet') f
      GROUP BY 1
    ),
    dk AS (
      SELECT run_hash, list(struct_pack(pidx := player_idx, card := card,
        fa := floor_added, ench := enchantment)) AS deck
      FROM read_parquet('{lake}/deck.parquet') GROUP BY 1
    ),
    rl AS (
      SELECT run_hash, list(struct_pack(pidx := player_idx, relic := relic))
        AS relics
      FROM read_parquet('{lake}/relics.parquet') GROUP BY 1
    ),
    pt AS (
      SELECT run_hash, list(struct_pack(pidx := player_idx, potion := potion))
        AS potions
      FROM read_parquet('{lake}/potions.parquet') GROUP BY 1
    )
    SELECT c.run_hash, coalesce(c.character, ''), coalesce(c.win, false),
      coalesce(c.was_abandoned, false), coalesce(c.player_count, 1),
      coalesce(c.played_at, c.submitted_at), c.cell,
      fl.floors, dk.deck, rl.relics, pt.potions
    FROM cells c
    LEFT JOIN fl USING (run_hash)
    LEFT JOIN dk USING (run_hash)
    LEFT JOIN rl USING (run_hash)
    LEFT JOIN pt USING (run_hash)
"""


def build_charts_blob() -> dict | None:
    """Build and store the finalized charts blob from the lake. Returns the
    blob or None when the lake is incomplete."""
    con = _connect(build=True)
    try:
        con.execute(_ELIGIBLE_SQL.format(lake=LAKE_DIR))
        _ensure_cells(con, str(LAKE_DIR))
        versions = cube_versions()
        vset = set(versions)
        acc = charts_stats.new_accumulator(versions)
        bracket_cache: dict[str, list[str]] = {}
        res = con.execute(_NESTED_SQL.format(lake=LAKE_DIR))
        n = 0
        while True:
            rows = res.fetchmany(500)
            if not rows:
                break
            for row in rows:
                _h, ch, win, ab, pc, played, cellv = row[:7]
                floors, deck, relics, potions = row[7:]
                brs = bracket_cache.get(cellv)
                if brs is None:
                    brs = _run_brackets(cellv, vset)
                    bracket_cache[cellv] = brs
                blob = {
                    "map_point_history": _history_from_nested(floors or []),
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
        con.close()
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
