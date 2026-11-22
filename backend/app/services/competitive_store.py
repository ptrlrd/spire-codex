"""The competitive pool: runs the replay judge marked, per bracket.

lab/competitive_store.py builds one small JSON from the lake each cycle and
this module folds and serves it. A cleared run counts with its own result.
A flagged run, and a started run that never uploaded, counts as a loss in
its bracket. Item usage and the charts read cleared runs only. The main
stats never read this pool, so every run still counts there as it was
played.
"""

import json
import os
import time
from collections import defaultdict
from pathlib import Path

LAKE_DIR = Path(os.environ.get("LAKE_DIR", "/lake"))
STORE_NAME = "competitive_store.json"
PREV_NAME = "competitive_store.prev.json"
BRACKETS = ("a10_solo", "dread_solo")
BOARDS = ("wins", "win_rate", "fastest")
KINDS = ("cards", "relics", "potions")
ALL = "all"

_cache: tuple[tuple, dict] | None = None


def _new_scope() -> dict:
    return {
        "runs": 0,
        "wins": 0,
        "flagged": 0,
        "forfeits": 0,
        "players": {},
        "used": {k: defaultdict(lambda: [0, 0]) for k in KINDS},
        "per_day": defaultdict(int),
        "win_time": defaultdict(int),
        "characters": defaultdict(int),
    }


def _player(scope: dict, user_id: str, username: str | None) -> dict:
    row = scope["players"].get(user_id)
    if row is None:
        row = scope["players"][user_id] = {
            "username": None,
            "wins": 0,
            "runs": 0,
            "best_time": None,
            "best_run": None,
            "best_character": None,
            "by_character": defaultdict(int),
        }
    if username:
        row["username"] = username
    return row


def _scopes(pool: dict, bracket: str, character: str | None):
    by_scope = pool[bracket]
    keys = [ALL] + ([character] if character else [])
    for key in keys:
        if key not in by_scope:
            by_scope[key] = _new_scope()
        yield by_scope[key]


def fold(runs: list[dict], members: list[tuple], forfeits: list[dict]) -> dict:
    """runs: run_hash, user_id, username, character, win, run_time, day,
    state, bracket. members: (run_hash, kind, id) for cleared runs.
    forfeits: user_id, username, character, bracket."""
    pool: dict = {b: {} for b in BRACKETS}
    cleared: dict[str, dict] = {}
    for r in runs:
        bracket = r.get("bracket")
        if bracket not in pool:
            continue
        character = (r.get("character") or "").lower() or None
        user_id = (r.get("user_id") or "").strip()
        is_cleared = r.get("state") == "cleared"
        win = bool(r.get("win")) and is_cleared
        if is_cleared:
            cleared[r["run_hash"]] = r
        for scope in _scopes(pool, bracket, character):
            if is_cleared:
                scope["runs"] += 1
                scope["wins"] += win
                if r.get("day"):
                    scope["per_day"][r["day"]] += 1
                if character:
                    scope["characters"][character] += 1
                if win and r.get("run_time"):
                    scope["win_time"][int(r["run_time"]) // 60] += 1
            else:
                scope["flagged"] += 1
            if not user_id:
                continue
            p = _player(scope, user_id, r.get("username"))
            p["runs"] += 1
            p["wins"] += win
            if character:
                p["by_character"][character] += 1
            t = r.get("run_time")
            if win and t and (p["best_time"] is None or t < p["best_time"]):
                p["best_time"] = int(t)
                p["best_run"] = r["run_hash"]
                p["best_character"] = character
    for f in forfeits:
        bracket = f.get("bracket")
        if bracket not in pool:
            continue
        character = (f.get("character") or "").lower() or None
        user_id = (f.get("user_id") or "").strip()
        for scope in _scopes(pool, bracket, character):
            scope["forfeits"] += 1
            if user_id:
                p = _player(scope, user_id, f.get("username"))
                p["runs"] += 1
                if character:
                    p["by_character"][character] += 1
    for run_hash, kind, item in members:
        r = cleared.get(run_hash)
        if r is None or kind not in KINDS or not item:
            continue
        character = (r.get("character") or "").lower() or None
        for scope in _scopes(pool, r["bracket"], character):
            cell = scope["used"][kind][item]
            cell[0] += 1
            cell[1] += bool(r.get("win"))
    return {
        "computed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "brackets": {
            b: {key: _finish(scope) for key, scope in scopes.items()}
            for b, scopes in pool.items()
        },
    }


def _finish(scope: dict) -> dict:
    players = []
    for p in scope["players"].values():
        if not p["username"]:
            continue
        played = p.pop("by_character")
        main = max(played.items(), key=lambda kv: (kv[1], kv[0]))[0] if played else None
        players.append({**p, "character": main})
    players.sort(key=lambda p: (-p["runs"], p["username"]))
    return {
        "runs": scope["runs"],
        "wins": scope["wins"],
        "flagged": scope["flagged"],
        "forfeits": scope["forfeits"],
        "players": players,
        "used": {
            k: sorted(
                ([item, n, w] for item, (n, w) in scope["used"][k].items()),
                key=lambda x: (-x[1], x[0]),
            )
            for k in KINDS
        },
        "per_day": sorted(scope["per_day"].items()),
        "win_time": sorted(scope["win_time"].items()),
        "characters": sorted(scope["characters"].items(), key=lambda x: (-x[1], x[0])),
    }


def _read(path: Path) -> tuple[tuple, dict] | None:
    try:
        st = path.stat()
        store = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(store, dict):
        return None
    return (str(path), st.st_mtime_ns, st.st_size), store


def load() -> dict | None:
    """Current store, else the previous generation's, else nothing."""
    global _cache
    for name in (STORE_NAME, PREV_NAME):
        path = LAKE_DIR / name
        try:
            st = path.stat()
        except OSError:
            continue
        stamp = (str(path), st.st_mtime_ns, st.st_size)
        if _cache and _cache[0] == stamp:
            return _cache[1]
        found = _read(path)
        if found:
            _cache = found
            return found[1]
    return None


def _board(players: list[dict], board: str, min_runs: int, limit: int) -> list[dict]:
    if board == "wins":
        rows = [p for p in players if p["wins"] > 0]
        rows.sort(key=lambda p: (-p["wins"], p["runs"], p["username"]))
    elif board == "win_rate":
        rows = [p for p in players if p["runs"] >= min_runs]
        rows.sort(key=lambda p: (-p["wins"] / p["runs"], -p["runs"], p["username"]))
    else:
        rows = [p for p in players if p["best_time"]]
        rows.sort(key=lambda p: (p["best_time"], p["username"]))
    out = []
    for i, p in enumerate(rows[:limit]):
        out.append(
            {
                "rank": i + 1,
                "username": p["username"],
                "character": p["best_character"]
                if board == "fastest"
                else p["character"],
                "wins": p["wins"],
                "runs": p["runs"],
                "win_rate": round(100.0 * p["wins"] / p["runs"], 1)
                if p["runs"]
                else 0.0,
                "best_time": p["best_time"],
                "best_run": p["best_run"],
            }
        )
    return out


def view(
    store: dict | None,
    bracket: str,
    character: str | None = None,
    min_runs: int = 1,
    limit: int = 100,
    used_limit: int = 50,
) -> dict:
    scope = ((store or {}).get("brackets") or {}).get(bracket, {}).get(
        (character or ALL).lower()
    ) or _finish(_new_scope())
    runs = scope["runs"]
    return {
        "bracket": bracket,
        "character": character.lower() if character else None,
        "computed_at": (store or {}).get("computed_at"),
        "building": store is None,
        "runs": runs,
        "wins": scope["wins"],
        "flagged": scope["flagged"],
        "forfeits": scope["forfeits"],
        "min_runs": min_runs,
        "boards": {b: _board(scope["players"], b, min_runs, limit) for b in BOARDS},
        "used": {
            k: [
                {
                    "id": item,
                    "runs": n,
                    "wins": w,
                    "share": round(100.0 * n / runs, 1) if runs else 0.0,
                    "win_rate": round(100.0 * w / n, 1) if n else 0.0,
                }
                for item, n, w in scope["used"][k][:used_limit]
            ]
            for k in KINDS
        },
        "per_day": scope["per_day"],
        "win_time": scope["win_time"],
        "characters": scope["characters"],
    }
