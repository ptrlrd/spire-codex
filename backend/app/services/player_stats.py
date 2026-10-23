"""One player's own stats grids, folded from lab/player_stats.py's
parquet. Rows are additive counters per (character, ascension, version,
players) slice, so any profile filter sums exactly; lift is wins over
expectation across the seats that had one."""

from __future__ import annotations

import os
import threading
import time
from pathlib import Path

LAKE_DIR = Path(os.environ.get("LAKE_DIR", "/lake"))
FILE = "player_stats.parquet"
MIN_LIFT_SEATS = 5
_TTL = 300.0
_MAX_CACHE = 512

_cache: dict[tuple, tuple[float, float, dict]] = {}
_lock = threading.Lock()


def _empty() -> dict:
    return {
        "runs": 0,
        "wins": 0,
        "tables": {
            k: []
            for k in ("cards", "relics", "potions", "events", "shops", "campfires")
        },
    }


def _lift(xn: int, xw: int, xs: float) -> float | None:
    if xn < MIN_LIFT_SEATS:
        return None
    return round((xw - xs) / xn * 100, 1)


def _query(
    path: Path,
    user_id: str,
    character: str | None,
    ascension: int | None,
    version: str | None,
    players: int | None,
) -> list[tuple]:
    import duckdb

    where = ["user_id = ?"]
    params: list = [user_id]
    if character:
        where.append("character = ?")
        params.append(character)
    if ascension is not None:
        where.append("ascension = ?")
        params.append(ascension)
    if version:
        where.append("version = ?")
        params.append(version)
    if players is not None:
        where.append("players = ?")
        params.append(players)
    con = duckdb.connect()
    try:
        con.execute("SET threads=2")
        con.execute("SET memory_limit='256MB'")
        return con.execute(
            f"""SELECT kind, id, sub, sum(n), sum(w), sum(xn), sum(xw), sum(xs),
                  sum(offered), sum(taken)
                FROM read_parquet('{path}')
                WHERE {" AND ".join(where)}
                GROUP BY 1, 2, 3""",
            params,
        ).fetchall()
    finally:
        con.close()


def fold(rows: list[tuple]) -> dict:
    out = _empty()
    tables = out["tables"]
    for kind, eid, sub, n, w, xn, xw, xs, offered, taken in rows:
        n, w, xn, xw = int(n or 0), int(w or 0), int(xn or 0), int(xw or 0)
        xs, offered, taken = float(xs or 0.0), int(offered or 0), int(taken or 0)
        if kind == "runs":
            out["runs"] += n
            out["wins"] += w
        elif kind in ("cards", "relics", "potions"):
            if n <= 0:
                continue
            row = {
                "id": eid,
                "runs": n,
                "wins": w,
                "win_rate": round(w / n * 100, 1),
                "lift": _lift(xn, xw, xs),
            }
            if kind != "potions":
                row["offered"] = offered
                row["taken"] = taken
            tables[kind].append(row)
        elif kind == "events":
            if n > 0 and eid and sub:
                tables["events"].append(
                    {
                        "event": eid,
                        "option": sub,
                        "chosen": n,
                        "wins": w,
                        "win_rate": round(w / n * 100, 1),
                        "lift": _lift(xn, xw, xs),
                    }
                )
        elif kind == "campfires":
            if n > 0:
                tables["campfires"].append(
                    {
                        "choice": eid,
                        "chosen": n,
                        "wins": w,
                        "win_rate": round(w / n * 100, 1),
                        "lift": _lift(xn, xw, xs),
                    }
                )
        elif kind == "shops":
            if offered > 0:
                tables["shops"].append(
                    {"entity_type": sub, "id": eid, "seen": offered, "bought": taken}
                )
    for k in ("cards", "relics", "potions"):
        tables[k].sort(key=lambda r: (-r["runs"], r["id"]))
    tables["events"].sort(key=lambda r: (r["event"], -r["chosen"], r["option"]))
    tables["campfires"].sort(key=lambda r: (-r["chosen"], r["choice"]))
    tables["shops"].sort(key=lambda r: (-r["bought"], -r["seen"], r["id"]))
    return out


def get_player_stats(
    user_id: str,
    character: str | None = None,
    ascension: int | None = None,
    version: str | None = None,
    players: int | None = None,
) -> dict | None:
    """None when the lake has no player stats file yet."""
    path = LAKE_DIR / FILE
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return None
    key = (user_id, character, ascension, version, players)
    now = time.time()
    with _lock:
        hit = _cache.get(key)
        if hit and hit[0] == mtime and now - hit[1] < _TTL:
            return hit[2]
    data = fold(_query(path, user_id, character, ascension, version, players))
    with _lock:
        if len(_cache) >= _MAX_CACHE:
            _cache.clear()
        _cache[key] = (mtime, now, data)
    return data
