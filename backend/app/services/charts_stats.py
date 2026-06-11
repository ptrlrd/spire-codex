"""Aggregates behind /api/charts, the run-data explorer.

Two data paths, both designed so the browser only ever receives a small,
ready-to-plot JSON (the usual community charts sites ship every run to the
client and aggregate there, which is why they crawl):

- Metadata frame: one process-wide list of per-run scalar tuples (character,
  win, ascension, mode, players, floors, deck size, ...) loaded from the run
  store and refreshed lazily. Every metadata chart is a single pass over the
  frame with the request's filters applied. 200k+ runs aggregate in well
  under a second, and the router caches responses on top.
- Blob stats: per-floor damage, encounter damage, and death room types need
  the full run blobs, so they piggyback on the single snapshot walk in
  ``run_entity_stats`` (same pattern as community_stats) and are served as
  O(1) reads, split by character x player count. Per-user variants walk just
  that user's blobs on demand.

This module must not import run_entity_stats (the dependency runs the other
way, like community_stats).
"""

from __future__ import annotations

import json
import logging
import math
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_DATA_DIR = Path(
    os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data")
)
_RUNS_DIR = _DATA_DIR / "runs"

# ── Frame: per-run metadata tuples ───────────────────────────────────────────

# Tuple indices (kept positional to stay light at 200k+ rows).
CHAR, WIN, ASC, MODE, PLAYERS, TIME, FLOORS, DECK, RELICS, DAY, USER, ABANDONED = range(
    12
)

_FRAME: list[tuple] = []
_FRAME_TS: float = 0.0
_FRAME_TTL = 600  # seconds between store reloads
_FRAME_LOCK = threading.Lock()

# Smallest sample a single point may summarise; thinner buckets are dropped so
# the lines don't whip around on noise.
MIN_POINT_N = 20
# Smallest filtered sample a per-character series needs to be drawn at all.
MIN_SERIES_N = 30
# Scatter sampling caps (points per series / total).
SCATTER_PER_SERIES = 600

_GAME_MODES = frozenset({"standard", "daily", "custom"})


def _norm_char(raw: str | None) -> str:
    """ "character.necrobinder" / "NECROBINDER" -> "NECROBINDER"."""
    return (raw or "").split(".")[-1].upper()


def _epoch_day(submitted: Any) -> int:
    if submitted is None:
        return 0
    if hasattr(submitted, "timestamp"):
        return int(submitted.timestamp() // 86400)
    s = str(submitted)
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            dt = datetime.strptime(s[:19], fmt).replace(tzinfo=timezone.utc)
            return int(dt.timestamp() // 86400)
        except ValueError:
            continue
    return 0


def _load_frame() -> list[tuple]:
    rows: list[tuple] = []
    if os.environ.get("MONGO_URL", "").strip():
        from .runs_db_mongo import _get_collection

        cursor = _get_collection().find(
            {},
            {
                "_id": 0,
                "character": 1,
                "win": 1,
                "ascension": 1,
                "game_mode": 1,
                "player_count": 1,
                "run_time": 1,
                "floors_reached": 1,
                "deck_size": 1,
                "relic_count": 1,
                "submitted_at": 1,
                "username": 1,
                "was_abandoned": 1,
            },
        )
        for d in cursor:
            rows.append(
                (
                    _norm_char(d.get("character")),
                    1 if d.get("win") else 0,
                    int(d.get("ascension") or 0),
                    (d.get("game_mode") or "standard").lower(),
                    int(d.get("player_count") or 1),
                    int(d.get("run_time") or 0),
                    int(d.get("floors_reached") or 0),
                    int(d.get("deck_size") or 0),
                    int(d.get("relic_count") or 0),
                    _epoch_day(d.get("submitted_at")),
                    (d.get("username") or "").lower(),
                    1 if d.get("was_abandoned") else 0,
                )
            )
    else:
        from .runs_db import get_conn

        with get_conn() as conn:
            for d in conn.execute(
                "SELECT character, win, ascension, game_mode, player_count,"
                " run_time, floors_reached, deck_size, relic_count,"
                " submitted_at, username, was_abandoned FROM runs"
            ):
                rows.append(
                    (
                        _norm_char(d["character"]),
                        1 if d["win"] else 0,
                        int(d["ascension"] or 0),
                        (d["game_mode"] or "standard").lower(),
                        int(d["player_count"] or 1),
                        int(d["run_time"] or 0),
                        int(d["floors_reached"] or 0),
                        int(d["deck_size"] or 0),
                        int(d["relic_count"] or 0),
                        _epoch_day(d["submitted_at"]),
                        (d["username"] or "").lower(),
                        1 if d["was_abandoned"] else 0,
                    )
                )
    return rows


def get_frame() -> list[tuple]:
    """The metadata frame, reloading from the store at most every TTL.
    Keeps serving the previous frame if a reload fails."""
    global _FRAME, _FRAME_TS
    if _FRAME and time.time() - _FRAME_TS < _FRAME_TTL:
        return _FRAME
    with _FRAME_LOCK:
        if _FRAME and time.time() - _FRAME_TS < _FRAME_TTL:
            return _FRAME
        try:
            rows = _load_frame()
            if rows or not _FRAME:
                _FRAME = rows
            _FRAME_TS = time.time()
        except Exception:
            logger.warning("charts frame reload failed", exc_info=True)
            _FRAME_TS = time.time()  # don't hammer a broken store
    return _FRAME


def _official_characters() -> dict[str, str]:
    """id -> display name (without the leading "The") for official characters."""
    from . import data_service

    try:
        out = {}
        for c in data_service.load_characters():
            cid = (c.get("id") or "").upper()
            if cid:
                name = c.get("name") or cid.title()
                out[cid] = name.removeprefix("The ").strip()
        return out
    except Exception:
        logger.warning("charts character load failed", exc_info=True)
        return {}


def filter_rows(
    rows: list[tuple],
    players: int | None,
    ascension: int | None,
    game_mode: str | None,
    username: str | None,
) -> list[tuple]:
    u = (username or "").lower().strip()
    out = []
    for r in rows:
        if players is not None and r[PLAYERS] != players:
            continue
        if ascension is not None and r[ASC] != ascension:
            continue
        if game_mode is not None and r[MODE] != game_mode:
            continue
        if u and r[USER] != u:
            continue
        out.append(r)
    return out


def _series_split(rows: list[tuple]) -> list[tuple[str, str, list[tuple]]]:
    """(series_id, label, rows) per official character with enough sample,
    plus the ALL series. Modded characters fold into ALL only."""
    chars = _official_characters()
    by_char: dict[str, list[tuple]] = {}
    for r in rows:
        by_char.setdefault(r[CHAR], []).append(r)
    out: list[tuple[str, str, list[tuple]]] = [("ALL", "All characters", rows)]
    for cid, name in chars.items():
        sub = by_char.get(cid) or []
        if len(sub) >= MIN_SERIES_N:
            out.append((cid, name, sub))
    return out


# ── Metadata chart builders ──────────────────────────────────────────────────

# Run stats that "vs stat" / histogram / scatter charts can use.
# value(row) -> numeric; bucket = bucket width; max caps the axis.
STATS: dict[str, dict[str, Any]] = {
    "floors_reached": {
        "label": "Floors reached",
        "idx": FLOORS,
        "bucket": 1,
        "max": 60,
    },
    "deck_size": {"label": "Deck size", "idx": DECK, "bucket": 2, "max": 90},
    "relic_count": {"label": "Relic count", "idx": RELICS, "bucket": 1, "max": 45},
    "run_minutes": {
        "label": "Run length (minutes)",
        "idx": TIME,
        "bucket": 5,
        "max": 240,
        "scale": 1 / 60,
    },
    "ascension": {"label": "Ascension", "idx": ASC, "bucket": 1, "max": 20},
}


def _stat_value(row: tuple, stat: dict) -> float:
    v = row[stat["idx"]] * stat.get("scale", 1)
    return v


def winrate_by_floor(rows: list[tuple]) -> list[dict]:
    """Of the runs that reached floor X, how many went on to win."""
    series = []
    for sid, label, sub in _series_split(rows):
        max_f = min(max((r[FLOORS] for r in sub), default=0), 60)
        total = [0] * (max_f + 1)
        wins = [0] * (max_f + 1)
        for r in sub:
            f = min(r[FLOORS], 60)
            if f >= 1:
                total[f] += 1
                wins[f] += r[WIN]
        points = []
        reach = 0
        reach_w = 0
        # Suffix sums: runs whose final floor is >= X reached X.
        suffix = []
        for f in range(max_f, 0, -1):
            reach += total[f]
            reach_w += wins[f]
            suffix.append((f, reach, reach_w))
        for f, n, w in reversed(suffix):
            if n >= MIN_POINT_N:
                points.append({"x": f, "y": round(w / n * 100, 1), "n": n})
        if points:
            series.append({"id": sid, "label": label, "points": points})
    return series


def deaths_by_floor(rows: list[tuple]) -> list[dict]:
    """Where losses end. Abandoned runs are excluded, they end anywhere."""
    series = []
    for sid, label, sub in _series_split(rows):
        losses = [r for r in sub if not r[WIN] and not r[ABANDONED]]
        if len(losses) < MIN_POINT_N:
            continue
        counts: dict[int, int] = {}
        for r in losses:
            f = min(max(r[FLOORS], 1), 60)
            counts[f] = counts.get(f, 0) + 1
        n_total = len(losses)
        points = [
            {"x": f, "y": round(c / n_total * 100, 2), "n": c}
            for f, c in sorted(counts.items())
        ]
        series.append({"id": sid, "label": label, "points": points, "total": n_total})
    return series


def winrate_over_time(rows: list[tuple]) -> list[dict]:
    series = []
    for sid, label, sub in _series_split(rows):
        weeks: dict[int, list[int]] = {}
        for r in sub:
            if r[DAY] <= 0:
                continue
            wk = r[DAY] // 7
            cell = weeks.setdefault(wk, [0, 0])
            cell[0] += 1
            cell[1] += r[WIN]
        points = []
        for wk in sorted(weeks):
            n, w = weeks[wk]
            if n >= 10:
                label_date = datetime.fromtimestamp(wk * 7 * 86400, tz=timezone.utc)
                points.append(
                    {
                        "x": label_date.strftime("%Y-%m-%d"),
                        "y": round(w / n * 100, 1),
                        "n": n,
                    }
                )
        if points:
            series.append({"id": sid, "label": label, "points": points})
    return series


def runs_over_time(rows: list[tuple]) -> list[dict]:
    series = []
    for sid, label, sub in _series_split(rows):
        weeks: dict[int, int] = {}
        for r in sub:
            if r[DAY] > 0:
                weeks[r[DAY] // 7] = weeks.get(r[DAY] // 7, 0) + 1
        points = [
            {
                "x": datetime.fromtimestamp(wk * 7 * 86400, tz=timezone.utc).strftime(
                    "%Y-%m-%d"
                ),
                "y": n,
            }
            for wk, n in sorted(weeks.items())
        ]
        if points:
            series.append({"id": sid, "label": label, "points": points})
    return series


def winrate_by_stat(rows: list[tuple], stat_key: str) -> list[dict]:
    stat = STATS[stat_key]
    series = []
    for sid, label, sub in _series_split(rows):
        buckets: dict[int, list[int]] = {}
        for r in sub:
            v = _stat_value(r, stat)
            if v < 0 or v > stat["max"]:
                continue
            b = int(v // stat["bucket"]) * stat["bucket"]
            cell = buckets.setdefault(b, [0, 0])
            cell[0] += 1
            cell[1] += r[WIN]
        points = [
            {"x": b, "y": round(w / n * 100, 1), "n": n}
            for b, (n, w) in sorted(buckets.items())
            if n >= MIN_POINT_N
        ]
        if points:
            series.append({"id": sid, "label": label, "points": points})
    return series


def stat_histogram(rows: list[tuple], stat_key: str) -> list[dict]:
    stat = STATS[stat_key]
    series = []
    for sid, label, sub in _series_split(rows):
        buckets: dict[int, int] = {}
        kept = 0
        for r in sub:
            v = _stat_value(r, stat)
            if v < 0 or v > stat["max"]:
                continue
            b = int(v // stat["bucket"]) * stat["bucket"]
            buckets[b] = buckets.get(b, 0) + 1
            kept += 1
        if kept < MIN_POINT_N:
            continue
        points = [
            {"x": b, "y": round(c / kept * 100, 2), "n": c}
            for b, c in sorted(buckets.items())
        ]
        series.append({"id": sid, "label": label, "points": points, "total": kept})
    return series


def stat_scatter(rows: list[tuple], x_key: str, y_key: str) -> list[dict]:
    sx, sy = STATS[x_key], STATS[y_key]
    series = []
    for sid, label, sub in _series_split(rows):
        if sid == "ALL" and len(_official_characters()) > 0:
            continue  # scatter is per character; an ALL blob would just overdraw
        stride = max(1, math.ceil(len(sub) / SCATTER_PER_SERIES))
        points = []
        for i in range(0, len(sub), stride):
            r = sub[i]
            points.append(
                {
                    "x": round(_stat_value(r, sx), 2),
                    "y": round(_stat_value(r, sy), 2),
                    "win": r[WIN],
                }
            )
        if points:
            series.append(
                {"id": sid, "label": label, "points": points, "sampled_from": len(sub)}
            )
    if not series:  # username filters can leave only modded/one char in ALL
        sub = rows
        stride = max(1, math.ceil(len(sub) / SCATTER_PER_SERIES))
        points = [
            {
                "x": round(_stat_value(sub[i], sx), 2),
                "y": round(_stat_value(sub[i], sy), 2),
                "win": sub[i][WIN],
            }
            for i in range(0, len(sub), stride)
        ]
        if points:
            series.append(
                {
                    "id": "ALL",
                    "label": "All runs",
                    "points": points,
                    "sampled_from": len(sub),
                }
            )
    return series


# ── Blob stats: accumulated during the snapshot walk ─────────────────────────

_COMBAT_ROOMS = frozenset({"monster", "elite", "boss"})
_MAX_FLOOR = 60


def new_accumulator() -> dict[str, Any]:
    return {
        # (char, players, floor) -> [sum_hp_pct, n]
        "hp_floor": {},
        # (char, players, encounter_id) -> [sum_hp_pct, n]
        "enc_dmg": {},
        # (char, players, room_type) -> deaths
        "death_room": {},
    }


def accumulate(
    acc: dict[str, Any],
    blob: dict,
    *,
    is_win: bool,
    character: str,
    player_count: int,
) -> None:
    """Fold one run blob into the blob-stats accumulator. Defensive like the
    community walk: missing keys skip quietly, never raise."""
    char = _norm_char(character)
    players = min(max(int(player_count or 1), 1), 4)

    floor_idx = 0
    last_room_type = None
    for act_floors in blob.get("map_point_history") or []:
        for floor in act_floors or []:
            if not isinstance(floor, dict):
                continue
            floor_idx += 1
            if floor_idx > _MAX_FLOOR:
                break
            rooms = floor.get("rooms") or []
            room = rooms[0] if rooms and isinstance(rooms[0], dict) else {}
            room_type = (room.get("room_type") or "").lower()
            if room_type:
                last_room_type = room_type
            if room_type not in _COMBAT_ROOMS:
                continue
            model_id = room.get("model_id") or ""
            enc = (
                model_id.split(".", 1)[1] if model_id.startswith("ENCOUNTER.") else None
            )
            for ps in floor.get("player_stats") or []:
                if not isinstance(ps, dict):
                    continue
                dmg = ps.get("damage_taken")
                max_hp = ps.get("max_hp")
                if not isinstance(dmg, (int, float)) or not isinstance(
                    max_hp, (int, float)
                ):
                    continue
                if dmg < 0 or max_hp <= 0:
                    continue
                pct = min(dmg / max_hp, 1.5)
                cell = acc["hp_floor"].setdefault((char, players, floor_idx), [0.0, 0])
                cell[0] += pct
                cell[1] += 1
                if enc:
                    ecell = acc["enc_dmg"].setdefault((char, players, enc), [0.0, 0])
                    ecell[0] += pct
                    ecell[1] += 1

    if not is_win and not blob.get("was_abandoned") and last_room_type:
        key = (char, players, last_room_type)
        acc["death_room"][key] = acc["death_room"].get(key, 0) + 1


def finalize(acc: dict[str, Any]) -> dict[str, Any]:
    """JSON-able cell lists for the snapshot. Rollups happen per request."""
    return {
        "version": 1,
        "hp_floor": [
            [c, p, f, round(s, 4), n] for (c, p, f), (s, n) in acc["hp_floor"].items()
        ],
        "enc_dmg": [
            [c, p, e, round(s, 4), n] for (c, p, e), (s, n) in acc["enc_dmg"].items()
        ],
        "death_room": [[c, p, rt, n] for (c, p, rt), n in acc["death_room"].items()],
    }


def empty() -> dict[str, Any]:
    return finalize(new_accumulator())


# ── Blob stat rollups (snapshot cells -> chart series) ───────────────────────


def _merge_cells(
    cells: list[list],
    players: int | None,
) -> dict[str, dict[Any, list[float]]]:
    """cells [[char, players, key, sum, n], ...] -> {char: {key: [sum, n]}},
    keeping only the requested player count (None = all) and folding an ALL
    pseudo-character in."""
    out: dict[str, dict[Any, list[float]]] = {"ALL": {}}
    chars = _official_characters()
    for c, p, key, s, n in cells:
        if players is not None and p != players:
            continue
        for bucket in ("ALL", c) if c in chars else ("ALL",):
            slot = out.setdefault(bucket, {}).setdefault(key, [0.0, 0])
            slot[0] += s
            slot[1] += n
    return out


def hp_loss_by_floor(stats: dict[str, Any], players: int | None) -> list[dict]:
    merged = _merge_cells(stats.get("hp_floor") or [], players)
    chars = _official_characters()
    series = []
    for cid, by_floor in merged.items():
        points = [
            {"x": f, "y": round(s / n * 100, 1), "n": n}
            for f, (s, n) in sorted(by_floor.items())
            if n >= 15
        ]
        if points:
            series.append(
                {
                    "id": cid,
                    "label": "All characters" if cid == "ALL" else chars.get(cid, cid),
                    "points": points,
                }
            )
    return series


def encounter_damage(
    stats: dict[str, Any], players: int | None, top: int = 25
) -> list[dict]:
    """Top encounters by average % of max HP lost per player-fight."""
    from . import data_service

    merged = _merge_cells(stats.get("enc_dmg") or [], players)
    names: dict[str, str] = {}
    try:
        names = {
            e["id"]: e.get("name") or e["id"]
            for e in data_service.load_encounters()
            if e.get("id")
        }
    except Exception:
        pass
    rows = []
    for enc, (s, n) in (merged.get("ALL") or {}).items():
        if n < 30:
            continue
        if names and enc not in names:
            continue  # modded encounters
        rows.append(
            {
                "x": names.get(enc) or enc.replace("_", " ").title(),
                "y": round(s / n * 100, 1),
                "n": n,
            }
        )
    rows.sort(key=lambda r: r["y"], reverse=True)
    return [{"id": "ALL", "label": "Avg % max HP lost", "points": rows[:top]}]


def deaths_by_room(stats: dict[str, Any], players: int | None) -> list[dict]:
    merged = _merge_cells(
        [[c, p, rt, 0.0, n] for c, p, rt, n in stats.get("death_room") or []], players
    )
    chars = _official_characters()
    series = []
    for cid, by_room in merged.items():
        total = sum(n for _, n in by_room.values())
        if total < MIN_POINT_N:
            continue
        points = [
            {"x": rt.title(), "y": round(n / total * 100, 1), "n": n}
            for rt, (_, n) in sorted(by_room.items(), key=lambda kv: -kv[1][1])
        ]
        series.append(
            {
                "id": cid,
                "label": "All characters" if cid == "ALL" else chars.get(cid, cid),
                "points": points,
                "total": total,
            }
        )
    return series


# ── Per-user blob stats (on-demand walk of one user's runs) ──────────────────

_USER_BLOB_CAP = 1500


def build_user_blob_stats(username: str) -> dict[str, Any]:
    """Accumulate blob stats from one user's runs, newest first, capped.
    Reads the same on-disk blobs the snapshot walk uses."""
    u = (username or "").strip()
    if not u:
        return empty()
    rows: list[dict] = []
    if os.environ.get("MONGO_URL", "").strip():
        import re as _re

        from .runs_db_mongo import _get_collection

        cursor = (
            _get_collection()
            .find(
                {"username": {"$regex": f"^{_re.escape(u)}$", "$options": "i"}},
                {"_id": 1, "character": 1, "win": 1, "player_count": 1},
            )
            .sort("submitted_at", -1)
            .limit(_USER_BLOB_CAP)
        )
        rows = [
            {
                "run_hash": d["_id"],
                "character": d.get("character") or "",
                "win": bool(d.get("win")),
                "player_count": d.get("player_count") or 1,
            }
            for d in cursor
        ]
    else:
        from .runs_db import get_conn

        with get_conn() as conn:
            rows = [
                dict(r)
                for r in conn.execute(
                    "SELECT run_hash, character, win, player_count FROM runs"
                    " WHERE username = ? COLLATE NOCASE"
                    " ORDER BY id DESC LIMIT ?",
                    (u, _USER_BLOB_CAP),
                )
            ]

    acc = new_accumulator()
    for row in rows:
        path = _RUNS_DIR / f"{row['run_hash']}.json"
        if not path.exists():
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                blob = json.load(f)
            accumulate(
                acc,
                blob,
                is_win=bool(row["win"]),
                character=row["character"],
                player_count=row["player_count"],
            )
        except Exception:
            continue
    return finalize(acc)
