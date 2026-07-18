"""Aggregates behind /api/charts, the run-data explorer.

Two data paths, both designed so the browser only ever receives a small,
ready-to-plot JSON (the usual community charts sites ship every run to the
client and aggregate there, which is why they crawl):

- Metadata frame: one process-wide list of per-run scalar tuples (character,
  win, ascension, mode, players, floors, deck size, ...) loaded from the run
  store and refreshed lazily. Every metadata chart is a single pass over the
  frame with the request's filters applied, and supports splitting the series
  by character, player count, outcome, or ascension band. 200k+ runs
  aggregate in well under a second, and the router caches responses on top.
- Blob stats: anything per-floor or per-entity (damage, HP/gold/deck curves,
  encounter histograms, event outcomes, card/relic weekly stats) needs the
  full run blobs, so they piggyback on the single snapshot walk in
  ``run_entity_stats`` (same pattern as community_stats) and are served as
  O(1) reads. Per-user variants walk just that user's blobs on demand.

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
(
    CHAR,
    WIN,
    ASC,
    MODE,
    PLAYERS,
    TIME,
    FLOORS,
    DECK,
    RELICS,
    DAY,
    USER,
    ABANDONED,
    ACTS,
    DAILY,
    BUILD,
) = range(15)

_FRAME: list[tuple] = []
_FRAME_TS: float = 0.0
# The scan costs ~400s under load; rescanning every 10min starved workers.
_FRAME_TTL = 3600
_FRAME_LOCK = threading.Lock()

# Smallest sample a single point may summarise; thinner buckets are dropped so
# the lines don't whip around on noise.
MIN_POINT_N = 20
# Smallest filtered sample a per-series split needs to be drawn at all.
MIN_SERIES_N = 30
# Scatter sampling cap per series.
SCATTER_PER_SERIES = 600


def _norm_char(raw: str | None) -> str:
    """ "character.necrobinder" / "NECROBINDER" -> "NECROBINDER"."""
    return (raw or "").split(".")[-1].upper()


def _bare(raw: str | None) -> str | None:
    """ "CARD.WISP" -> "WISP"; None for empty values."""
    if not raw:
        return None
    parts = str(raw).split(".", 1)
    return parts[1] if len(parts) > 1 else parts[0]


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


def _week_label(week: int) -> str:
    return datetime.fromtimestamp(week * 7 * 86400, tz=timezone.utc).strftime(
        "%Y-%m-%d"
    )


def _daily_date(seed: str | None, game_mode: str) -> str:
    """Daily seeds encode their date as DD_MM_YYYY; '' for everything else."""
    if game_mode != "daily" or not seed:
        return ""
    parts = str(seed).split("_")
    if (
        len(parts) >= 3
        and parts[0].isdigit()
        and parts[1].isdigit()
        and parts[2].isdigit()
    ):
        dd, mm, yyyy = parts[0], parts[1], parts[2]
        if len(yyyy) == 4:
            return f"{yyyy}-{mm.zfill(2)}-{dd.zfill(2)}"
    return ""


def _load_frame() -> list[tuple]:
    rows: list[tuple] = []
    if os.environ.get("MONGO_URL", "").strip():
        from .runs_db_mongo import _get_collection

        cursor = _get_collection().find(
            # Exclude admin-flagged cheated runs (absent field = eligible) and
            # clamp to the official ascension range (A11+ is modded, mirroring
            # _build_match); modded characters already fold into ALL only below.
            {"hidden": {"$ne": True}, "ascension": {"$gte": 0, "$lte": 10}},
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
                "acts_completed": 1,
                "seed": 1,
                "build_id": 1,
            },
        )
        for d in cursor:
            mode = (d.get("game_mode") or "standard").lower()
            rows.append(
                (
                    _norm_char(d.get("character")),
                    1 if d.get("win") else 0,
                    int(d.get("ascension") or 0),
                    mode,
                    int(d.get("player_count") or 1),
                    int(d.get("run_time") or 0),
                    int(d.get("floors_reached") or 0),
                    int(d.get("deck_size") or 0),
                    int(d.get("relic_count") or 0),
                    _epoch_day(d.get("submitted_at")),
                    (d.get("username") or "").lower(),
                    1 if d.get("was_abandoned") else 0,
                    int(d.get("acts_completed") or 0),
                    _daily_date(d.get("seed"), mode),
                    (d.get("build_id") or "").strip(),
                )
            )
    else:
        from .runs_db import get_conn

        with get_conn() as conn:
            for d in conn.execute(
                "SELECT character, win, ascension, game_mode, player_count,"
                " run_time, floors_reached, deck_size, relic_count,"
                " submitted_at, username, was_abandoned, acts_completed, seed,"
                " build_id"
                " FROM runs WHERE ascension BETWEEN 0 AND 10"
            ):
                mode = (d["game_mode"] or "standard").lower()
                rows.append(
                    (
                        _norm_char(d["character"]),
                        1 if d["win"] else 0,
                        int(d["ascension"] or 0),
                        mode,
                        int(d["player_count"] or 1),
                        int(d["run_time"] or 0),
                        int(d["floors_reached"] or 0),
                        int(d["deck_size"] or 0),
                        int(d["relic_count"] or 0),
                        _epoch_day(d["submitted_at"]),
                        (d["username"] or "").lower(),
                        1 if d["was_abandoned"] else 0,
                        int(d["acts_completed"] or 0),
                        _daily_date(d["seed"], mode),
                        (d["build_id"] or "").strip(),
                    )
                )
    return rows


_FRAME_REFRESHING = False
_FRAME_OK = False
_FRAME_RETRY_TS = 0.0
_FRAME_RETRY_SECONDS = 30


def _kick_frame_refresh() -> None:
    """Reload the frame on a daemon thread, at most one in flight. A failed
    load must NOT count as fresh: it only sets the retry stamp, so the
    worker retries within seconds instead of serving an empty frame for a
    full TTL (that was hours of blank charts when a scan died under load)."""
    global _FRAME_REFRESHING
    with _FRAME_LOCK:
        if _FRAME_REFRESHING:
            return
        _FRAME_REFRESHING = True

    def _run() -> None:
        global _FRAME, _FRAME_TS, _FRAME_REFRESHING, _FRAME_OK, _FRAME_RETRY_TS
        started = time.monotonic()
        try:
            rows = _load_frame()
            with _FRAME_LOCK:
                if rows or not _FRAME:
                    _FRAME = rows
                _FRAME_TS = time.time()
                _FRAME_OK = True
            logger.info(
                "charts frame loaded: %d rows in %.1fs",
                len(rows),
                time.monotonic() - started,
            )
        except Exception:
            logger.warning("charts frame reload failed", exc_info=True)
            with _FRAME_LOCK:
                _FRAME_RETRY_TS = time.time()
        finally:
            with _FRAME_LOCK:
                _FRAME_REFRESHING = False

    threading.Thread(target=_run, name="charts-frame-refresh", daemon=True).start()


def frame_loading() -> bool:
    """True while the frame is empty and no load has ever SUCCEEDED, so
    endpoints mark payloads "building" (short cache) instead of caching a
    bogus empty chart. A successful empty load clears it: a store with no
    runs is empty, not warming up."""
    return not _FRAME and not _FRAME_OK


def _frame_fresh() -> bool:
    return _FRAME_OK and time.time() - _FRAME_TS < _FRAME_TTL


def get_frame(wait: bool = False) -> list[tuple]:
    """The metadata frame, refreshed from the store at most every TTL.

    Request path (wait=False): never blocks. A fresh frame serves as-is; a
    stale or missing one kicks a background reload (throttled after
    failures) and serves whatever is loaded right now.

    wait=True is for the prewarmer: it must never compute warm payloads
    from an empty frame, so it waits out the load (bounded), re-kicking
    after failures until the deadline."""
    if _frame_fresh():
        return _FRAME
    if time.time() - _FRAME_RETRY_TS >= _FRAME_RETRY_SECONDS:
        _kick_frame_refresh()
    if wait:
        deadline = time.time() + 600
        while time.time() < deadline:
            if _frame_fresh():
                break
            if time.time() - _FRAME_RETRY_TS >= _FRAME_RETRY_SECONDS:
                _kick_frame_refresh()
            time.sleep(1)
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


_WINRATE_MIN_RUNS = 5  # mirror runs_db_mongo.WINRATE_MIN_RUNS
_FRAME_WR: dict[str, float] = {}
_FRAME_WR_TS: float = -1.0


def _frame_winrate_map() -> dict[str, float]:
    """username -> overall win rate (0-100, 5-run floor) from the frame's USER +
    WIN columns. DB-agnostic (works on the SQLite fallback) and cached per frame
    reload. Matches the get_user_winrates definition used by the other brackets."""
    global _FRAME_WR, _FRAME_WR_TS
    if _FRAME_WR_TS == _FRAME_TS and _FRAME_WR:
        return _FRAME_WR
    counts: dict[str, list[int]] = {}
    for r in _FRAME:
        u = r[USER]
        if not u:
            continue
        c = counts.setdefault(u, [0, 0])
        c[0] += 1
        if r[WIN]:
            c[1] += 1
    _FRAME_WR = {
        u: (w / t * 100.0)
        for u, (t, w) in counts.items()
        if t >= _WINRATE_MIN_RUNS and t > 0
    }
    _FRAME_WR_TS = _FRAME_TS
    return _FRAME_WR


# Content brackets -> (ascension floor, win-rate floor %). A10-gated, matching
# the run-entity-stats brackets. None / "all" means no bracket filter.
_BRACKET_FILTERS: dict[str, tuple[int, float | None]] = {
    "a10": (10, None),
    "wr30": (10, 30.0),
    "wr50": (10, 50.0),
    "wr75": (10, 75.0),
}


def filter_rows(
    rows: list[tuple],
    players: int | None,
    ascension: int | None,
    game_mode: str | None,
    username: str | None,
    bracket: str | None = None,
    build_id: str | None = None,
) -> list[tuple]:
    u = (username or "").lower().strip()
    asc_floor, wr_floor = _BRACKET_FILTERS.get(bracket or "", (None, None))
    wr_map = _frame_winrate_map() if wr_floor is not None else None
    out = []
    for r in rows:
        # Game version: query-time on the frame, so it combines with every
        # other filter here (unlike the snapshot brackets, no materialization).
        if build_id and r[BUILD] != build_id:
            continue
        if players is not None and r[PLAYERS] != players:
            continue
        if ascension is not None and r[ASC] != ascension:
            continue
        if game_mode is not None and r[MODE] != game_mode:
            continue
        if u and r[USER] != u:
            continue
        # Content bracket: A10 floor and (for wr tiers) the submitter's overall
        # win rate must exceed the threshold. Strict >, matching the brackets.
        if asc_floor is not None and r[ASC] < asc_floor:
            continue
        if wr_floor is not None and (wr_map or {}).get(r[USER], -1.0) <= wr_floor:
            continue
        out.append(r)
    return out


# ── Series splitting ─────────────────────────────────────────────────────────

SPLITS = ("character", "players", "outcome", "ascension")

# A10 is the ascension cap; nothing above it exists.
_ASC_BANDS = [
    (0, 0, "A0"),
    (1, 4, "A1-A4"),
    (5, 9, "A5-A9"),
    (10, 10, "A10"),
]
_PLAYER_LABELS = {1: "Solo", 2: "2 Players", 3: "3 Players", 4: "4 Players"}


def _series_split(
    rows: list[tuple], split: str = "character"
) -> list[tuple[str, str, list[tuple]]]:
    """(series_id, label, rows) for the requested split, plus the ALL series.
    Splits with too little sample are dropped; for the character split,
    modded characters fold into ALL only."""
    out: list[tuple[str, str, list[tuple]]] = [("ALL", "All runs", rows)]
    if split == "players":
        by: dict[int, list[tuple]] = {}
        for r in rows:
            by.setdefault(min(r[PLAYERS], 4), []).append(r)
        for p in (1, 2, 3, 4):
            sub = by.get(p) or []
            if len(sub) >= MIN_SERIES_N:
                out.append((f"P{p}", _PLAYER_LABELS[p], sub))
    elif split == "outcome":
        wins = [r for r in rows if r[WIN]]
        losses = [r for r in rows if not r[WIN]]
        if len(wins) >= MIN_SERIES_N:
            out.append(("WIN", "Wins", wins))
        if len(losses) >= MIN_SERIES_N:
            out.append(("LOSS", "Losses", losses))
    elif split == "ascension":
        for lo, hi, label in _ASC_BANDS:
            sub = [r for r in rows if lo <= r[ASC] <= hi]
            if len(sub) >= MIN_SERIES_N:
                out.append((label, label, sub))
    else:  # character
        chars = _official_characters()
        by_char: dict[str, list[tuple]] = {}
        for r in rows:
            by_char.setdefault(r[CHAR], []).append(r)
        out = [("ALL", "All characters", rows)]
        for cid, name in chars.items():
            sub = by_char.get(cid) or []
            if len(sub) >= MIN_SERIES_N:
                out.append((cid, name, sub))
    return out


# ── Metadata chart builders ──────────────────────────────────────────────────

# Run stats that "vs stat" / histogram / scatter charts can use.
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
    "ascension": {"label": "Ascension", "idx": ASC, "bucket": 1, "max": 10},
}


def _stat_value(row: tuple, stat: dict) -> float:
    return row[stat["idx"]] * stat.get("scale", 1)


def winrate_by_floor(rows: list[tuple], split: str) -> list[dict]:
    """Of the runs that reached floor X, how many went on to win."""
    series = []
    for sid, label, sub in _series_split(rows, split):
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


def deaths_by_floor(rows: list[tuple], split: str) -> list[dict]:
    """Where losses end. Abandoned runs are excluded, they end anywhere."""
    series = []
    for sid, label, sub in _series_split(rows, split):
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


def winrate_over_time(rows: list[tuple], split: str) -> list[dict]:
    series = []
    for sid, label, sub in _series_split(rows, split):
        weeks: dict[int, list[int]] = {}
        for r in sub:
            if r[DAY] <= 0:
                continue
            cell = weeks.setdefault(r[DAY] // 7, [0, 0])
            cell[0] += 1
            cell[1] += r[WIN]
        points = []
        for wk in sorted(weeks):
            n, w = weeks[wk]
            if n >= 10:
                points.append(
                    {"x": _week_label(wk), "y": round(w / n * 100, 1), "n": n}
                )
        if points:
            series.append({"id": sid, "label": label, "points": points})
    return series


def runs_over_time(rows: list[tuple], split: str) -> list[dict]:
    series = []
    for sid, label, sub in _series_split(rows, split):
        weeks: dict[int, int] = {}
        for r in sub:
            if r[DAY] > 0:
                weeks[r[DAY] // 7] = weeks.get(r[DAY] // 7, 0) + 1
        points = [{"x": _week_label(wk), "y": n} for wk, n in sorted(weeks.items())]
        if points:
            series.append({"id": sid, "label": label, "points": points})
    return series


def winrate_by_stat(rows: list[tuple], stat_key: str, split: str) -> list[dict]:
    stat = STATS[stat_key]
    series = []
    for sid, label, sub in _series_split(rows, split):
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


def stat_histogram(rows: list[tuple], stat_key: str, split: str) -> list[dict]:
    stat = STATS[stat_key]
    series = []
    for sid, label, sub in _series_split(rows, split):
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


def stat_scatter(rows: list[tuple], x_key: str, y_key: str, split: str) -> list[dict]:
    sx, sy = STATS[x_key], STATS[y_key]
    groups = [g for g in _series_split(rows, split) if g[0] != "ALL"]
    if not groups:
        groups = [("ALL", "All runs", rows)]
    series = []
    for sid, label, sub in groups:
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
    return series


_FUNNEL_STAGES = [
    ("Started", lambda r: True),
    ("Reached Act 2", lambda r: r[ACTS] >= 1),
    ("Reached Act 3", lambda r: r[ACTS] >= 2),
    ("Won", lambda r: bool(r[WIN])),
]


def acts_funnel(rows: list[tuple], split: str) -> list[dict]:
    """How far runs get: share surviving each act boundary, ending in wins."""
    series = []
    for sid, label, sub in _series_split(rows, split):
        n = len(sub)
        if n < MIN_POINT_N:
            continue
        points = []
        for stage, pred in _FUNNEL_STAGES:
            c = sum(1 for r in sub if pred(r))
            points.append({"x": stage, "y": round(c / n * 100, 1), "n": c})
        series.append({"id": sid, "label": label, "points": points, "total": n})
    return series


def hardest_dailies(rows: list[tuple], limit: int = 42) -> list[dict]:
    """Win rate per daily date (the seed encodes the daily's date)."""
    by_date: dict[str, list[int]] = {}
    for r in rows:
        if r[DAILY]:
            cell = by_date.setdefault(r[DAILY], [0, 0])
            cell[0] += 1
            cell[1] += r[WIN]
    dates = sorted(by_date)[-limit:]
    points = [
        {
            "x": d,
            "y": round(by_date[d][1] / by_date[d][0] * 100, 1),
            "n": by_date[d][0],
        }
        for d in dates
        if by_date[d][0] >= 5
    ]
    return (
        [{"id": "ALL", "label": "Daily win rate", "points": points}] if points else []
    )


# ── Blob stats: accumulated during the snapshot walk ─────────────────────────

_COMBAT_ROOMS = frozenset({"monster", "elite", "boss"})
_MAX_FLOOR = 60
_HIST_BUCKET = 5  # % of max HP per histogram bucket
_HIST_CAP = 100  # damage >= 100% of max HP folds into the top bucket
BLOB_VERSION = 3
# Content brackets the blob is accumulated per (mirrors the run_entity_stats
# brackets): "all" plus the A10-gated win-rate ladder. A run feeds every bracket
# it matches, so the blob charts can re-slice by skill just like the frame ones.
_BLOB_BRACKETS = ["all", "a10", "wr30", "wr50", "wr75"]


def _new_acc_one() -> dict[str, Any]:
    return {
        # (char, players, floor) -> [sum_hp_pct, n]   combat damage only
        "hp_floor": {},
        # (char, players, encounter) -> [sum_dmg_pct, n_dmg, sum_turns, n_rooms]
        "enc": {},
        # (players, encounter, bucket) -> n            damage histogram cells
        "enc_hist": {},
        # (char, players, room_type) -> deaths
        "death_room": {},
        # (char, players, win, floor) -> [s_hp, n_hp, s_gold, n_gold, s_deck, n_deck]
        "traj": {},
        # (char, players, elites_fought) -> [n, wins]
        "elites": {},
        # (char, players, smith_count) -> [n, wins]
        "smiths": {},
        # (event, option) -> [n, wins]
        "events": {},
        # (etype, entity, week) -> [n, wins]
        "entity_week": {},
        # week -> [n, wins]                            baseline for pick rates
        "week_totals": {},
        # (card, copies_bucket) -> [n, wins]
        "copies": {},
        # enchantment -> [n, wins]
        "ench": {},
    }


def new_accumulator(versions=None) -> dict[str, Any]:
    """Per-bracket blob accumulators; accumulate() folds each run into the
    sub-accumulator for every content bracket it belongs to. `versions`
    (release build_ids) pre-seeds one bucket per version plus one per
    bracket x version composite (``a10:v0.107.1``), so the blob charts
    honor the same version filter the frame charts apply query-time.
    accumulate() only folds into buckets that already exist."""
    acc = {b: _new_acc_one() for b in _BLOB_BRACKETS}
    for v in versions or []:
        acc[v] = _new_acc_one()
        for b in _BLOB_BRACKETS:
            if b != "all":
                acc[f"{b}:{v}"] = _new_acc_one()
    return acc


# Merging two accumulators (from parallel run-chunk walks) adds per key. Most
# charts cells are `key -> [numbers]` (element-wise add); enc_hist and death_room
# are `key -> count` (scalar add).
_CHART_LIST_FIELDS = (
    "hp_floor",
    "enc",
    "traj",
    "elites",
    "smiths",
    "events",
    "entity_week",
    "week_totals",
    "copies",
    "ench",
)
_CHART_COUNTER_FIELDS = ("enc_hist", "death_room")


def _merge_list_dict(dst: dict, src: dict) -> None:
    """dst[key] += src[key] element-wise (both are lists of the same length)."""
    for k, v in src.items():
        cur = dst.get(k)
        if cur is None:
            dst[k] = list(v)
        else:
            for i, x in enumerate(v):
                cur[i] += x


def merge(dst: dict, src: dict) -> None:
    """Fold accumulator `src` into `dst` (both from new_accumulator())."""
    for bracket, s in src.items():
        d = dst.get(bracket)
        if d is None:
            dst[bracket] = s
            continue
        for field in _CHART_LIST_FIELDS:
            _merge_list_dict(d[field], s[field])
        for field in _CHART_COUNTER_FIELDS:
            df = d[field]
            for k, v in s[field].items():
                df[k] = df.get(k, 0) + v


def _bump2(d: dict, key: Any, win: bool) -> None:
    cell = d.setdefault(key, [0, 0])
    cell[0] += 1
    if win:
        cell[1] += 1


def accumulate(
    acc: dict[str, Any],
    blob: dict,
    *,
    brackets,
    is_win: bool,
    character: str,
    player_count: int,
    submitted: Any = None,
) -> None:
    """Fold one run into the sub-accumulator of every content bracket it belongs
    to (`brackets` always includes 'all')."""
    for b in brackets:
        sub = acc.get(b)
        if sub is not None:
            _accumulate_one(
                sub,
                blob,
                is_win=is_win,
                character=character,
                player_count=player_count,
                submitted=submitted,
            )


def _accumulate_one(
    acc: dict[str, Any],
    blob: dict,
    *,
    is_win: bool,
    character: str,
    player_count: int,
    submitted: Any = None,
) -> None:
    """Fold one run blob into ONE bracket's accumulator. Defensive like the
    community walk: missing keys skip quietly, never raise."""
    char = _norm_char(character)
    players = min(max(int(player_count or 1), 1), 4)
    week = _epoch_day(submitted) // 7 if submitted else 0

    floor_idx = 0
    last_room_type = None
    elite_count = 0
    smith_count = 0
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
            if room_type == "elite":
                elite_count += 1
            is_combat = room_type in _COMBAT_ROOMS
            model_id = room.get("model_id") or ""
            enc = (
                model_id.split(".", 1)[1] if model_id.startswith("ENCOUNTER.") else None
            )
            turns = room.get("turns_taken")
            if is_combat and enc and isinstance(turns, (int, float)) and turns >= 0:
                ecell = acc["enc"].setdefault((char, players, enc), [0.0, 0, 0.0, 0])
                ecell[2] += min(turns, 200)
                ecell[3] += 1

            for ps in floor.get("player_stats") or []:
                if not isinstance(ps, dict):
                    continue
                max_hp = ps.get("max_hp")
                hp_ok = isinstance(max_hp, (int, float)) and max_hp > 0

                # Per-floor trajectory: HP % and gold, split by outcome.
                cur_hp = ps.get("current_hp")
                cur_gold = ps.get("current_gold")
                tcell = None
                if hp_ok and isinstance(cur_hp, (int, float)) and cur_hp >= 0:
                    tcell = acc["traj"].setdefault(
                        (char, players, 1 if is_win else 0, floor_idx),
                        [0.0, 0, 0.0, 0, 0.0, 0],
                    )
                    tcell[0] += min(cur_hp / max_hp, 1.5)
                    tcell[1] += 1
                if isinstance(cur_gold, (int, float)) and cur_gold >= 0:
                    if tcell is None:
                        tcell = acc["traj"].setdefault(
                            (char, players, 1 if is_win else 0, floor_idx),
                            [0.0, 0, 0.0, 0, 0.0, 0],
                        )
                    tcell[2] += min(cur_gold, 20000)
                    tcell[3] += 1

                # Combat damage.
                dmg = ps.get("damage_taken")
                if is_combat and hp_ok and isinstance(dmg, (int, float)) and dmg >= 0:
                    pct = min(dmg / max_hp, 1.5)
                    cell = acc["hp_floor"].setdefault(
                        (char, players, floor_idx), [0.0, 0]
                    )
                    cell[0] += pct
                    cell[1] += 1
                    if enc:
                        ecell = acc["enc"].setdefault(
                            (char, players, enc), [0.0, 0, 0.0, 0]
                        )
                        ecell[0] += pct
                        ecell[1] += 1
                        bucket = min(
                            int(pct * 100) // _HIST_BUCKET, _HIST_CAP // _HIST_BUCKET
                        )
                        hkey = (players, enc, bucket)
                        acc["enc_hist"][hkey] = acc["enc_hist"].get(hkey, 0) + 1

                # Rest-site smith count (per run, across all players).
                for choice in ps.get("rest_site_choices") or []:
                    if choice == "SMITH":
                        smith_count += 1

                # Event decisions with outcomes attached.
                for ec in ps.get("event_choices") or []:
                    title = (ec.get("title") or {}) if isinstance(ec, dict) else {}
                    if title.get("table") != "events":
                        continue
                    key = title.get("key") or ""
                    if ".options." not in key:
                        continue
                    event_id = key.split(".", 1)[0]
                    option_id = key.split(".options.", 1)[1].split(".", 1)[0]
                    if event_id and option_id:
                        _bump2(acc["events"], (event_id, option_id), is_win)

    total_floors = floor_idx

    if not is_win and not blob.get("was_abandoned") and last_room_type:
        key = (char, players, last_room_type)
        acc["death_room"][key] = acc["death_room"].get(key, 0) + 1

    _bump2(acc["elites"], (char, players, min(elite_count, 12)), is_win)
    _bump2(acc["smiths"], (char, players, min(smith_count, 15)), is_win)

    # Per-entity weekly stats + copies + enchantments, from the final loadout.
    if week > 0:
        _bump2(acc["week_totals"], week, is_win)
    seen_entities: set[tuple[str, str]] = set()
    seen_ench: set[str] = set()
    for player in blob.get("players") or []:
        if not isinstance(player, dict):
            continue
        card_counts: dict[str, int] = {}
        adds_by_floor: dict[int, int] = {}
        for c in player.get("deck") or []:
            if not isinstance(c, dict):
                continue
            cid = _bare(c.get("id"))
            if cid:
                card_counts[cid] = card_counts.get(cid, 0) + 1
            fa = c.get("floor_added_to_deck")
            if isinstance(fa, (int, float)) and 0 <= fa <= _MAX_FLOOR:
                adds_by_floor[int(fa)] = adds_by_floor.get(int(fa), 0) + 1
            ench = c.get("enchantment")
            eid = _bare(ench.get("id")) if isinstance(ench, dict) else None
            if eid:
                seen_ench.add(eid)
        for cid, count in card_counts.items():
            seen_entities.add(("cards", cid))
            _bump2(acc["copies"], (cid, min(count, 5)), is_win)
        for rel in player.get("relics") or []:
            rid = _bare(rel.get("id")) if isinstance(rel, dict) else _bare(rel)
            if rid:
                seen_entities.add(("relics", rid))
        for pot in player.get("potions") or []:
            pid = _bare(pot.get("id")) if isinstance(pot, dict) else _bare(pot)
            if pid:
                seen_entities.add(("potions", pid))

        # Deck growth: cumulative cards-still-in-deck added by each floor.
        if adds_by_floor and total_floors:
            cum = 0
            cum_by_floor = []
            for f in range(0, min(total_floors, _MAX_FLOOR) + 1):
                cum += adds_by_floor.get(f, 0)
                cum_by_floor.append((f, cum))
            for f, c in cum_by_floor:
                if f == 0:
                    continue
                tcell = acc["traj"].setdefault(
                    (char, players, 1 if is_win else 0, f), [0.0, 0, 0.0, 0, 0.0, 0]
                )
                tcell[4] += c
                tcell[5] += 1

    if week > 0:
        for etype, eid in seen_entities:
            _bump2(acc["entity_week"], (etype, eid, week), is_win)
    for eid in seen_ench:
        _bump2(acc["ench"], eid, is_win)


def finalize(acc: dict[str, Any]) -> dict[str, Any]:
    """Per-bracket JSON-able blob for the snapshot: {bracket: <cell lists>}."""
    return {b: _finalize_one(sub) for b, sub in acc.items()}


def _finalize_one(acc: dict[str, Any]) -> dict[str, Any]:
    """JSON-able cell lists for one bracket. Rollups happen per request."""
    return {
        "version": BLOB_VERSION,
        "hp_floor": [
            [c, p, f, round(s, 4), n] for (c, p, f), (s, n) in acc["hp_floor"].items()
        ],
        "enc": [
            [c, p, e, round(s, 4), n, round(st, 1), nt]
            for (c, p, e), (s, n, st, nt) in acc["enc"].items()
        ],
        "enc_hist": [[p, e, b, n] for (p, e, b), n in acc["enc_hist"].items()],
        "death_room": [[c, p, rt, n] for (c, p, rt), n in acc["death_room"].items()],
        "traj": [
            [c, p, w, f, round(sh, 4), nh, round(sg, 1), ng, round(sd, 1), nd]
            for (c, p, w, f), (sh, nh, sg, ng, sd, nd) in acc["traj"].items()
        ],
        "elites": [[c, p, b, n, w] for (c, p, b), (n, w) in acc["elites"].items()],
        "smiths": [[c, p, b, n, w] for (c, p, b), (n, w) in acc["smiths"].items()],
        "events": [[e, o, n, w] for (e, o), (n, w) in acc["events"].items()],
        "entity_week": [
            [t, e, wk, n, w] for (t, e, wk), (n, w) in acc["entity_week"].items()
        ],
        "week_totals": [[wk, n, w] for wk, (n, w) in acc["week_totals"].items()],
        "copies": [[e, b, n, w] for (e, b), (n, w) in acc["copies"].items()],
        "ench": [[e, n, w] for e, (n, w) in acc["ench"].items()],
    }


def empty() -> dict[str, Any]:
    """Per-bracket empty blob ({bracket: <empty cells>})."""
    return finalize(new_accumulator())


def empty_one() -> dict[str, Any]:
    """One bracket's empty finalized blob (the blob-reader fallback)."""
    return _finalize_one(_new_acc_one())


# ── Blob stat rollups (snapshot cells -> chart series) ───────────────────────


def _char_label(cid: str, chars: dict[str, str]) -> str:
    return "All characters" if cid == "ALL" else chars.get(cid, cid.title())


def _entity_names(etype: str) -> dict[str, str]:
    from . import data_service

    loaders = {
        "cards": data_service.load_cards,
        "relics": data_service.load_relics,
        "potions": data_service.load_potions,
    }
    try:
        return {
            e["id"]: e.get("name") or e["id"] for e in loaders[etype]() if e.get("id")
        }
    except Exception:
        return {}


def _merge_cells(
    cells: list[list], players: int | None, character: str | None = None
) -> dict[str, dict[Any, list[float]]]:
    """cells [[char, players, key, *values], ...] -> {char: {key: [..sums..]}},
    keeping only the requested player count / character (None = all) and
    folding an ALL pseudo-character in."""
    out: dict[str, dict[Any, list[float]]] = {"ALL": {}}
    chars = _official_characters()
    for c, p, key, *vals in cells:
        if players is not None and p != players:
            continue
        if character is not None and c != character:
            continue
        for bucket in ("ALL", c) if c in chars else ("ALL",):
            slot = out.setdefault(bucket, {}).setdefault(key, [0.0] * len(vals))
            for i, v in enumerate(vals):
                slot[i] += v
    return out


def hp_loss_by_floor(stats: dict[str, Any], players: int | None) -> list[dict]:
    merged = _merge_cells(stats.get("hp_floor") or [], players)
    chars = _official_characters()
    series = []
    for cid, by_floor in merged.items():
        points = [
            {"x": f, "y": round(s / n * 100, 1), "n": int(n)}
            for f, (s, n) in sorted(by_floor.items())
            if n >= 15
        ]
        if points:
            series.append(
                {"id": cid, "label": _char_label(cid, chars), "points": points}
            )
    return series


def _encounter_names() -> dict[str, str]:
    # Historical entries ride along: retired-but-official content (the
    # Doormaker era) still fills months of run rows, and this map doubles as
    # the modded-id guard, so without them those rows silently vanish.
    from .encounter_stats import HISTORICAL_ENCOUNTERS
    from . import data_service

    try:
        names = {
            e["id"]: e.get("name") or e["id"]
            for e in data_service.load_encounters()
            if e.get("id")
        }
        return {**HISTORICAL_ENCOUNTERS, **names}
    except Exception:
        return dict(HISTORICAL_ENCOUNTERS)


def encounter_ranking(
    stats: dict[str, Any], players: int | None, metric: str = "damage", top: int = 25
) -> list[dict]:
    """Encounters ranked by avg % max HP lost per fight, or by avg turns."""
    merged = _merge_cells(stats.get("enc") or [], players)
    names = _encounter_names()
    # Fold renamed ids into their current id first (Toadpoles -> Seapunk),
    # so a renamed fight ranks as one entry instead of two half-sized ones.
    from .encounter_stats import ENCOUNTER_ID_RENAMES

    folded: dict[str, list[float]] = {}
    for enc, (s, n, st, nt) in (merged.get("ALL") or {}).items():
        key = ENCOUNTER_ID_RENAMES.get(enc, enc)
        f = folded.setdefault(key, [0.0, 0, 0.0, 0])
        f[0] += s
        f[1] += n
        f[2] += st
        f[3] += nt
    rows = []
    for enc, (s, n, st, nt) in folded.items():
        if names and enc not in names:
            continue  # modded encounters
        if metric == "turns":
            if nt < 30:
                continue
            rows.append(
                {
                    "x": names.get(enc) or enc.replace("_", " ").title(),
                    "y": round(st / nt, 1),
                    "n": int(nt),
                }
            )
        else:
            if n < 30:
                continue
            rows.append(
                {
                    "x": names.get(enc) or enc.replace("_", " ").title(),
                    "y": round(s / n * 100, 1),
                    "n": int(n),
                }
            )
    rows.sort(key=lambda r: r["y"], reverse=True)
    label = "Avg turns per fight" if metric == "turns" else "Avg % max HP lost"
    return [{"id": "ALL", "label": label, "points": rows[:top]}]


def encounter_histogram(
    stats: dict[str, Any], players: int | None, encounter: str
) -> list[dict]:
    """Damage distribution for one encounter, in 5%-of-max-HP buckets."""
    by_bucket: dict[int, int] = {}
    for p, enc, b, n in stats.get("enc_hist") or []:
        if enc != encounter:
            continue
        if players is not None and p != players:
            continue
        by_bucket[b] = by_bucket.get(b, 0) + n
    total = sum(by_bucket.values())
    if total < MIN_POINT_N:
        return []
    max_b = _HIST_CAP // _HIST_BUCKET
    points = []
    for b in range(0, max_b + 1):
        n = by_bucket.get(b, 0)
        lo = b * _HIST_BUCKET
        label = f"{lo}-{lo + _HIST_BUCKET}%" if b < max_b else f"{_HIST_CAP}%+"
        points.append({"x": label, "y": round(n / total * 100, 2), "n": n})
    names = _encounter_names()
    return [
        {
            "id": "ALL",
            "label": names.get(encounter, encounter.replace("_", " ").title()),
            "points": points,
            "total": total,
        }
    ]


def deaths_by_room(stats: dict[str, Any], players: int | None) -> list[dict]:
    merged = _merge_cells(
        [[c, p, rt, n] for c, p, rt, n in stats.get("death_room") or []], players
    )
    chars = _official_characters()
    series = []
    for cid, by_room in merged.items():
        total = sum(v[0] for v in by_room.values())
        if total < MIN_POINT_N:
            continue
        points = [
            {"x": rt.title(), "y": round(n / total * 100, 1), "n": int(n)}
            for rt, (n,) in sorted(by_room.items(), key=lambda kv: -kv[1][0])
        ]
        series.append(
            {
                "id": cid,
                "label": _char_label(cid, chars),
                "points": points,
                "total": total,
            }
        )
    return series


_TRAJ_METRICS = {
    "hp": (0, 1, 100, "Avg % of max HP"),
    "gold": (2, 3, 1, "Avg gold held"),
    "deck": (4, 5, 1, "Avg cards added"),
}


def run_trajectory(
    stats: dict[str, Any],
    players: int | None,
    metric: str,
    character: str | None = None,
) -> list[dict]:
    """Per-floor average of HP %, gold, or deck size, winners vs losers."""
    si, ni, scale, _label = _TRAJ_METRICS[metric]
    by_outcome: dict[int, dict[int, list[float]]] = {0: {}, 1: {}}
    chars = _official_characters()
    for c, p, w, f, *vals in stats.get("traj") or []:
        if players is not None and p != players:
            continue
        if character is not None and c != character:
            continue
        if character is None and chars and c not in chars:
            continue
        slot = by_outcome[int(w)].setdefault(f, [0.0, 0])
        slot[0] += vals[si]
        slot[1] += vals[ni]
    series = []
    for w, sid, label in ((1, "WIN", "Wins"), (0, "LOSS", "Losses")):
        points = [
            {"x": f, "y": round(s / n * scale, 1), "n": int(n)}
            for f, (s, n) in sorted(by_outcome[w].items())
            if n >= 15
        ]
        if points:
            series.append({"id": sid, "label": label, "points": points})
    return series


def _bucket_vs_winrate(
    cells: list[list], players: int | None, x_fmt=lambda b: b
) -> list[dict]:
    merged = _merge_cells(cells, players)
    chars = _official_characters()
    series = []
    for cid, by_bucket in merged.items():
        points = [
            {"x": x_fmt(b), "y": round(w / n * 100, 1), "n": int(n)}
            for b, (n, w) in sorted(by_bucket.items())
            if n >= MIN_POINT_N
        ]
        if points:
            series.append(
                {"id": cid, "label": _char_label(cid, chars), "points": points}
            )
    return series


def elites_vs_winrate(stats: dict[str, Any], players: int | None) -> list[dict]:
    return _bucket_vs_winrate(stats.get("elites") or [], players)


def smiths_vs_winrate(stats: dict[str, Any], players: int | None) -> list[dict]:
    return _bucket_vs_winrate(stats.get("smiths") or [], players)


def event_outcomes(stats: dict[str, Any], event_id: str) -> list[dict]:
    """Pick share and win rate per option of one event."""
    from . import data_service

    rows = [(o, n, w) for e, o, n, w in stats.get("events") or [] if e == event_id]
    total = sum(n for _, n, _ in rows)
    if total < MIN_POINT_N:
        return []
    labels: dict[str, str] = {}
    try:
        for e in data_service.load_events():
            if e.get("id") == event_id:
                for opt in e.get("options") or []:
                    if opt.get("id"):
                        labels[opt["id"]] = opt.get("title") or opt["id"].title()
    except Exception:
        pass
    rows.sort(key=lambda r: -r[1])
    pick = []
    winr = []
    for o, n, w in rows:
        x = labels.get(o) or o.replace("_", " ").title()
        pick.append({"x": x, "y": round(n / total * 100, 1), "n": n})
        if n >= MIN_POINT_N:
            winr.append({"x": x, "y": round(w / n * 100, 1), "n": n})
    return [
        {"id": "PICK", "label": "Pick share %", "points": pick, "total": total},
        {"id": "WINRATE", "label": "Win rate when picked %", "points": winr},
    ]


def event_list(stats: dict[str, Any]) -> list[dict]:
    """Events present in the data with totals, for the UI's selector."""
    from . import data_service

    totals: dict[str, int] = {}
    for e, _o, n, _w in stats.get("events") or []:
        totals[e] = totals.get(e, 0) + n
    names: dict[str, str] = {}
    try:
        names = {
            e["id"]: e.get("name") or e["id"]
            for e in data_service.load_events()
            if e.get("id")
        }
    except Exception:
        pass
    out = [
        {"id": e, "name": names.get(e) or e.replace("_", " ").title(), "n": n}
        for e, n in totals.items()
        if n >= MIN_POINT_N and (not names or e in names)
    ]
    out.sort(key=lambda r: -r["n"])
    return out


def entity_over_time(stats: dict[str, Any], etype: str, entity: str) -> list[dict]:
    """Weekly pick rate and win rate for one card/relic/potion, with the
    overall weekly win rate as the baseline."""
    week_totals = {wk: (n, w) for wk, n, w in stats.get("week_totals") or []}
    cells = {
        wk: (n, w)
        for t, e, wk, n, w in stats.get("entity_week") or []
        if t == etype and e == entity
    }
    weeks = sorted(wk for wk in cells if week_totals.get(wk, (0, 0))[0] >= 25)
    if not weeks:
        return []
    pick, withr, base = [], [], []
    for wk in weeks:
        n, w = cells[wk]
        tn, tw = week_totals[wk]
        label = _week_label(wk)
        pick.append({"x": label, "y": round(n / tn * 100, 1), "n": n})
        if n >= 10:
            withr.append({"x": label, "y": round(w / n * 100, 1), "n": n})
        base.append({"x": label, "y": round(tw / tn * 100, 1), "n": tn})
    return [
        {"id": "WITH", "label": "Win rate with it", "points": withr},
        {"id": "BASE", "label": "Overall win rate", "points": base},
        {"id": "PICK", "label": "% of runs holding it", "points": pick},
    ]


def entity_copies(stats: dict[str, Any], entity: str) -> list[dict]:
    """Win rate by number of copies in the final deck (cards only)."""
    rows = [(b, n, w) for e, b, n, w in stats.get("copies") or [] if e == entity]
    points = [
        {"x": f"{b}+" if b >= 5 else str(b), "y": round(w / n * 100, 1), "n": n}
        for b, n, w in sorted(rows)
        if n >= MIN_POINT_N
    ]
    return (
        [{"id": "ALL", "label": "Win rate by copies", "points": points}]
        if points
        else []
    )


def enchant_winrate(stats: dict[str, Any]) -> list[dict]:
    """Win rate of runs whose final deck holds each enchantment."""
    from . import data_service

    names: dict[str, str] = {}
    try:
        names = {
            e["id"]: e.get("name") or e["id"]
            for e in data_service.load_enchantments()
            if e.get("id")
        }
    except Exception:
        pass
    rows = []
    for e, n, w in stats.get("ench") or []:
        if n < MIN_POINT_N:
            continue
        if names and e not in names:
            continue
        rows.append(
            {
                "x": names.get(e) or e.replace("_", " ").title(),
                "y": round(w / n * 100, 1),
                "n": n,
            }
        )
    rows.sort(key=lambda r: -r["y"])
    return (
        [{"id": "ALL", "label": "Win rate with enchantment", "points": rows}]
        if rows
        else []
    )


# ── Per-user blob stats (on-demand walk of one user's runs) ──────────────────

_USER_BLOB_CAP = 1500


def build_user_blob_stats(username: str) -> dict[str, Any]:
    """Accumulate blob stats from one user's runs, newest first, capped.
    Reads the same on-disk blobs the snapshot walk uses."""
    u = (username or "").strip()
    if not u:
        return empty_one()
    rows: list[dict] = []
    if os.environ.get("MONGO_URL", "").strip():
        from .runs_db_mongo import _get_collection

        cursor = (
            _get_collection()
            .find(
                {"username_lower": u.lower()},
                {
                    "_id": 1,
                    "character": 1,
                    "win": 1,
                    "player_count": 1,
                    "submitted_at": 1,
                },
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
                "submitted_at": d.get("submitted_at"),
            }
            for d in cursor
        ]
    else:
        from .runs_db import get_conn

        with get_conn() as conn:
            rows = [
                dict(r)
                for r in conn.execute(
                    "SELECT run_hash, character, win, player_count, submitted_at"
                    " FROM runs WHERE username_lower = ?"
                    " ORDER BY id DESC LIMIT ?",
                    (u.lower(), _USER_BLOB_CAP),
                )
            ]

    # Single-bracket walk: the username is the filter, so content brackets don't
    # apply here. Use the per-bracket-free helpers directly.
    acc = _new_acc_one()
    for row in rows:
        path = _RUNS_DIR / f"{row['run_hash']}.json"
        if not path.exists():
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                blob = json.load(f)
            _accumulate_one(
                acc,
                blob,
                is_win=bool(row["win"]),
                character=row["character"],
                player_count=row["player_count"],
                submitted=row.get("submitted_at"),
            )
        except Exception:
            continue
    return _finalize_one(acc)
