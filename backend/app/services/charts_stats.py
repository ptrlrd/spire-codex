"""Aggregates behind /api/charts, the run-data explorer.

Two data paths, both designed so the browser only ever receives a small,
ready-to-plot JSON (the usual community charts sites ship every run to the
client and aggregate there, which is why they crawl):

- Metadata frame: a per-worker DuckDB table of per-run scalars (character,
  win, ascension, mode, players, floors, deck size, ...) loaded from the
  ingest-built frame.parquet and refreshed lazily. Every metadata chart is a
  grouped query over the frame with the request's filters applied, and
  supports splitting the series by character, player count, outcome, or
  ascension band. Only the grouped result leaves DuckDB, and the router
  caches responses on top.
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
import os
import threading
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_DATA_DIR = Path(
    os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data")
)
_RUNS_DIR = _DATA_DIR / "runs"

# Ingest-built frame snapshot: the exact per-run tuples below, dumped to
# parquet once per ingest so workers load the frame in seconds instead of
# scanning Mongo for 15 minutes per boot (the scan wedged under any
# concurrent load and took the chart pages down repeatedly on 2026-08-25/26).
_FRAME_PARQUET = Path(os.environ.get("LAKE_DIR", "/lake")) / "frame.parquet"
_FRAME_PARQUET_MAX_AGE = 24 * 3600
_FRAME_COLS = (
    "character VARCHAR, win TINYINT, ascension INT, game_mode VARCHAR,"
    " player_count INT, run_time BIGINT, floors_reached INT, deck_size INT,"
    " relic_count INT, played_day INT, username VARCHAR, was_abandoned TINYINT,"
    " acts_completed INT, daily_date VARCHAR, build_id VARCHAR, upload_day INT"
)


# mtime of the parquet actually loaded into the frame db (0.0 = loaded from the
# DB scan). Freshness must compare file identity, not wall-clock load time:
# a load that finishes just after the ingest replaced the file would
# otherwise stamp old rows as newer than the new file for a whole TTL.
_FRAME_SRC_MTIME = 0.0


def _new_frame_db():
    import duckdb

    con = duckdb.connect()
    con.execute("SET threads=2")
    con.execute("SET memory_limit='1500MB'")
    return con


def _finish_frame_db(con) -> int:
    """The per-username winrate table the wr brackets filter through
    (mirrors get_user_winrates: overall rate, 5-run floor), plus the count."""
    con.execute(
        "CREATE OR REPLACE TABLE frame_wr AS"
        " SELECT username, count(*) AS t, sum(win) AS w FROM frame"
        " WHERE username IS NOT NULL AND username <> ''"
        f" AND NOT {_SHORT_ABANDON}"
        " GROUP BY 1 HAVING count(*) >= 5"
    )
    return con.execute("SELECT count(*) FROM frame").fetchone()[0]


def _load_frame_parquet():
    """(connection, rows) with the ingest-built frame as a DuckDB table, or
    None (missing, stale, or unreadable)."""
    global _FRAME_SRC_MTIME
    try:
        if not _FRAME_PARQUET.exists():
            return None
        mtime = _FRAME_PARQUET.stat().st_mtime
        if time.time() - mtime > _FRAME_PARQUET_MAX_AGE:
            logger.warning("frame parquet is stale; falling back to the DB scan")
            return None
        con = _new_frame_db()
        try:
            cols = {
                r[0]
                for r in con.execute(
                    f"DESCRIBE SELECT * FROM read_parquet('{_FRAME_PARQUET}')"
                ).fetchall()
            }
            select = _FRAME_SELECT
            if "upload_day" not in cols:
                select = select.replace(", upload_day", ", 0 AS upload_day")
            con.execute(f"CREATE TABLE frame ({_FRAME_COLS})")
            con.execute(
                f"INSERT INTO frame SELECT {select}"
                f" FROM read_parquet('{_FRAME_PARQUET}')"
            )
            n = _finish_frame_db(con)
        except Exception:
            con.close()
            raise
        if n:
            _FRAME_SRC_MTIME = mtime
            return (con, n)
        con.close()
        return None
    except Exception:
        logger.warning("frame parquet load failed; falling back", exc_info=True)
        return None


def _lake_frame_select(runs_p: Path, scalars_p: Path, with_hash: bool = False) -> str:
    """The frame as one SQL projection over the lake. Mirrors the Mongo row
    construction exactly: hidden $ne True (from the fresh sidecar, not the
    stale extract-time flag), ascension 0-10 with missing excluded, Pacific
    played_day (connection must be SET TimeZone='UTC' so the naive-as-UTC
    convention matches pacific_epoch_day), daily seed date, fresh username."""
    hash_col = "r.run_hash AS run_hash, " if with_hash else ""
    return f"""
        SELECT {hash_col}
          -- Doc-truth character/build_id via the fresh sidecar: pages
          -- extracted before _meta.character existed fall back to players[1]
          -- and misattribute co-op party members (369/2000 in the 2026-08-29
          -- validation).
          upper(split_part(coalesce(s.character, r.character, ''), '.', -1))
            AS character,
          (CASE WHEN coalesce(try_cast(r.win AS BOOLEAN), false)
            THEN 1 ELSE 0 END)::TINYINT AS win,
          r.ascension::INT AS ascension,
          lower(coalesce(r.game_mode, 'standard')) AS game_mode,
          coalesce(r.player_count, 1)::INT AS player_count,
          coalesce(r.run_time, 0)::BIGINT AS run_time,
          coalesce(s.floors_reached, 0)::INT AS floors_reached,
          coalesce(s.deck_size, 0)::INT AS deck_size,
          coalesce(s.relic_count, 0)::INT AS relic_count,
          coalesce((timezone('America/Los_Angeles',
              coalesce(r.played_at, r.submitted_at)::TIMESTAMP::TIMESTAMPTZ))::date
            - DATE '1970-01-01', 0)::INT AS played_day,
          lower(coalesce(s.username, '')) AS username,
          (CASE WHEN coalesce(try_cast(r.was_abandoned AS BOOLEAN), false)
            THEN 1 ELSE 0 END)::TINYINT AS was_abandoned,
          coalesce(s.acts_completed, 0)::INT AS acts_completed,
          CASE WHEN lower(coalesce(r.game_mode, 'standard')) = 'daily'
                AND regexp_matches(coalesce(r.seed, ''),
                    '^[0-9]+_[0-9]+_[0-9]{{4}}(_|$)')
            THEN string_split(r.seed, '_')[3] || '-'
              || lpad(string_split(r.seed, '_')[2], 2, '0') || '-'
              || lpad(string_split(r.seed, '_')[1], 2, '0')
            ELSE '' END AS daily_date,
          trim(coalesce(s.build_id, r.build_id, '')) AS build_id,
          coalesce((timezone('America/Los_Angeles',
              r.submitted_at::TIMESTAMP::TIMESTAMPTZ))::date
            - DATE '1970-01-01', 0)::INT AS upload_day
        FROM read_parquet('{runs_p}') r
        LEFT JOIN read_parquet('{scalars_p}') s USING (run_hash)
        WHERE coalesce(s.hidden, false) = false
          AND r.ascension BETWEEN 0 AND 10
    """


def _store_frame_from_lake() -> int | None:
    """Build frame.parquet as one DuckDB COPY over the lake instead of the
    doc-by-doc Mongo walk (measured at 3h of the 6.5h store tail). Returns
    None when the lake inputs aren't present so the caller can fall back."""
    import duckdb

    lake_dir = Path(os.environ.get("LAKE_DIR", "/lake"))
    runs_p = lake_dir / "runs.parquet"
    scalars_p = lake_dir / "run_scalars.parquet"
    if not (runs_p.exists() and scalars_p.exists()):
        return None
    con = duckdb.connect()
    try:
        con.execute("SET TimeZone='UTC'")
        tmp = _FRAME_PARQUET.with_suffix(".parquet.tmp")
        con.execute(
            f"COPY ({_lake_frame_select(runs_p, scalars_p)})"
            f" TO '{tmp}' (FORMAT parquet, COMPRESSION zstd)"
        )
        n = int(
            con.execute(f"SELECT count(*) FROM read_parquet('{tmp}')").fetchone()[0]
        )
        tmp.replace(_FRAME_PARQUET)
    finally:
        con.close()
    logger.info(
        "frame parquet stored from lake: %d rows, %d bytes",
        n,
        _FRAME_PARQUET.stat().st_size,
    )
    return n


def store_frame_parquet() -> int:
    """Ingest-time: run the canonical frame builder once and dump the rows
    to parquet for every worker to load cheaply. Returns the row count."""
    import duckdb

    if (os.environ.get("FRAME_FROM_LAKE", "") or "").strip().lower() in (
        "1",
        "on",
        "true",
    ):
        n = _store_frame_from_lake()
        if n is not None:
            return n
        logger.warning("lake frame inputs missing; falling back to the db walk")
    rows = _load_frame_from_db()
    con = duckdb.connect()
    try:
        con.execute(f"CREATE TABLE f ({_FRAME_COLS})")
        con.executemany(f"INSERT INTO f VALUES ({', '.join('?' * 16)})", rows)
        tmp = _FRAME_PARQUET.with_suffix(".parquet.tmp")
        con.execute(f"COPY f TO '{tmp}' (FORMAT parquet, COMPRESSION zstd)")
        tmp.replace(_FRAME_PARQUET)
    finally:
        con.close()
    logger.info(
        "frame parquet stored: %d rows, %d bytes",
        len(rows),
        _FRAME_PARQUET.stat().st_size,
    )
    return len(rows)


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
    UPLOAD_DAY,
) = range(16)

# The frame lives in a per-worker in-memory DuckDB (tables frame + frame_wr),
# swapped whole on reload. Columnar: the same 1.4M rows cost ~200MB where the
# old list of Python tuples cost ~1.5GB per worker (OOM-killed workers,
# 2026-08-30). Requests hold the db they started on (FrameQuery), so a
# swapped-out db is freed when the last of them finishes, never closed
# under one.
_FRAME_DB = None
_FRAME_ROWS = 0
_FRAME_TS: float = 0.0
# The scan costs ~400s under load; rescanning every 10min starved workers.
_FRAME_TTL = 3600
_FRAME_LOCK = threading.Lock()
_FRAME_FETCH_GATE = threading.BoundedSemaphore(2)

_SHORT_ABANDON = "(was_abandoned = 1 AND floors_reached <= 5)"

_FRAME_SELECT = (
    "character, win, ascension, game_mode, player_count, run_time,"
    " floors_reached, deck_size, relic_count, played_day, username,"
    " was_abandoned, acts_completed, daily_date, build_id, upload_day"
)

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
    """Pacific-calendar day bucket (site policy: never UTC boundaries)."""
    from .timeutil import pacific_epoch_day

    return pacific_epoch_day(submitted)


def _week_label(week: int) -> str:
    from .timeutil import epoch_day_label

    return epoch_day_label(week * 7)


def _day_label(day: int) -> str:
    from .timeutil import epoch_day_label

    return epoch_day_label(day)


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


def _load_frame():
    """(connection, rows): the frame db from the parquet, else from a
    store scan (SQLite dev, or a missing/stale parquet in prod)."""
    cached = _load_frame_parquet()
    if cached is not None:
        return cached
    return _frame_db(_load_frame_from_db())


def _frame_db(rows: list[tuple]):
    con = _new_frame_db()
    con.execute(f"CREATE TABLE frame ({_FRAME_COLS})")
    for i in range(0, len(rows), 50_000):
        con.executemany(
            "INSERT INTO frame VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            rows[i : i + 50_000],
        )
    return (con, _finish_frame_db(con))


def _load_frame_from_db() -> list[tuple]:
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
                "played_at": 1,
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
                    _epoch_day(d.get("played_at") or d.get("submitted_at")),
                    (d.get("username") or "").lower(),
                    1 if d.get("was_abandoned") else 0,
                    int(d.get("acts_completed") or 0),
                    _daily_date(d.get("seed"), mode),
                    (d.get("build_id") or "").strip(),
                    _epoch_day(d.get("submitted_at")),
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
                        _epoch_day(d["submitted_at"]),
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
        global _FRAME_DB, _FRAME_ROWS, _FRAME_TS, _FRAME_REFRESHING
        global _FRAME_OK, _FRAME_RETRY_TS
        started = time.monotonic()
        try:
            con, n = _load_frame()
            with _FRAME_LOCK:
                if n or _FRAME_DB is None:
                    _FRAME_DB, _FRAME_ROWS = con, n
                _FRAME_TS = time.time()
                _FRAME_OK = True
            logger.info(
                "charts frame loaded: %d rows in %.1fs",
                n,
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
    return not _FRAME_ROWS and not _FRAME_OK


def _frame_fresh() -> bool:
    if not (_FRAME_OK and time.time() - _FRAME_TS < _FRAME_TTL):
        return False
    # A newly published frame.parquet must be picked up without waiting out
    # the TTL or restarting workers — the ingest cadence depends on it.
    # Compare against the mtime of the file we actually loaded (not the
    # wall-clock load time): a load finishing just after an ingest replaced
    # the file would otherwise pass as fresh for a whole TTL.
    try:
        disk_mtime = _FRAME_PARQUET.stat().st_mtime
    except OSError:
        return True
    if _FRAME_SRC_MTIME:
        return disk_mtime == _FRAME_SRC_MTIME
    return disk_mtime <= _FRAME_TS


def get_frame(wait: bool = False) -> int:
    """The frame's row count, refreshing the frame db from the store at
    most every TTL. Truthiness is the contract (callers ask "is a frame
    loaded"); charts read the rows through frame_query.

    Request path (wait=False): never blocks. A fresh frame serves as-is; a
    stale or missing one kicks a background reload (throttled after
    failures) and serves whatever is loaded right now.

    wait=True is for the prewarmer: it must never compute warm payloads
    from an empty frame, so it waits out the load (bounded), re-kicking
    after failures until the deadline."""
    if _frame_fresh():
        return _FRAME_ROWS
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
    return _FRAME_ROWS


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


# Content brackets -> (ascension floor, win-rate floor %). A10-gated, matching
# the run-entity-stats brackets. None / "all" means no bracket filter.
_BRACKET_FILTERS: dict[str, tuple[int, float | None]] = {
    "a10": (10, None),
    "wr30": (10, 30.0),
    "wr50": (10, 50.0),
    "wr75": (10, 75.0),
}


class FrameQuery:
    """A request's filters over the frame db. It holds the db it started on,
    so a reload can't mix two frames into one chart, and a swapped-out db
    lives until its last request lets go of it."""

    def __init__(self, con, where: list[str], args: list):
        self.con = con
        self.args = args
        self.total: int | None = None
        clause = f" WHERE {' AND '.join(where)}" if where else ""
        self.src = f"(SELECT rowid AS seq, * FROM frame{clause}) f"

    def run(self, sql: str) -> list[tuple]:
        if self.con is None:
            return []
        cur = self.con.cursor()
        try:
            with _FRAME_FETCH_GATE:
                return cur.execute(sql, self.args).fetchall()
        finally:
            cur.close()


def frame_query(
    players: int | None,
    ascension: int | None,
    game_mode: str | None,
    username: str | None,
    bracket: str | None = None,
    build_id: str | None = None,
    include_short_abandons: bool = False,
) -> FrameQuery:
    """The wr tiers keep their semantics: A10 floor, submitter overall win
    rate strictly above the threshold, 5-run floor. Runs abandoned by floor 5
    are left out unless a run-count chart asks for every run."""
    with _FRAME_LOCK:
        con = _FRAME_DB
    u = (username or "").lower().strip()
    asc_floor, wr_floor = _BRACKET_FILTERS.get(bracket or "", (None, None))
    where: list[str] = []
    args: list = []
    if build_id:
        where.append("build_id = ?")
        args.append(build_id)
    if players is not None:
        where.append("player_count = ?")
        args.append(players)
    if ascension is not None:
        where.append("ascension = ?")
        args.append(ascension)
    if game_mode is not None:
        where.append("game_mode = ?")
        args.append(game_mode)
    if u:
        where.append("username = ?")
        args.append(u)
    if asc_floor is not None:
        where.append("ascension >= ?")
        args.append(asc_floor)
    if wr_floor is not None:
        where.append(
            "username IN (SELECT username FROM frame_wr WHERE w * 100.0 / t > ?)"
        )
        args.append(wr_floor)
    if not include_short_abandons:
        where.append(f"NOT {_SHORT_ABANDON}")
    return FrameQuery(con, where, args)


def frame_count(fq: FrameQuery) -> int:
    if fq.total is None:
        rows = fq.run(f"SELECT count(*) FROM {fq.src}")
        fq.total = rows[0][0] if rows else 0
    return fq.total


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


def _split_spec(split: str) -> tuple[str, str, list[tuple[str, str, Any]]]:
    """(ALL label, SQL series key, [(series id, label, key value)]) for a
    split. Anything else splits by character, where modded characters fold
    into ALL only."""
    if split == "players":
        return (
            "All runs",
            "least(player_count, 4)",
            [(f"P{p}", label, p) for p, label in _PLAYER_LABELS.items()],
        )
    if split == "outcome":
        return (
            "All runs",
            "win <> 0",
            [("WIN", "Wins", True), ("LOSS", "Losses", False)],
        )
    if split == "ascension":
        bands = "".join(
            f" WHEN ascension BETWEEN {lo} AND {hi} THEN '{label}'"
            for lo, hi, label in _ASC_BANDS
        )
        return (
            "All runs",
            f"CASE{bands} END",
            [(label, label, label) for _lo, _hi, label in _ASC_BANDS],
        )
    chars = _official_characters()
    ids = ", ".join("'" + cid.replace("'", "''") + "'" for cid in chars)
    return (
        "All characters",
        f"CASE WHEN character IN ({ids}) THEN character END" if chars else "NULL",
        [(cid, name, cid) for cid, name in chars.items()],
    )


def _grouped(
    fq: FrameQuery,
    split: str,
    bucket: str,
    aggs: str = "",
    where: str | None = None,
) -> list[tuple[str, str, int, dict]]:
    """(series id, label, runs, {bucket: [count, *aggs]}) for ALL plus every
    split series with at least MIN_SERIES_N runs. Rows outside `where` count
    toward a series' runs but land in no bucket. aggs must be sums so ALL can
    add the series keys up."""
    all_label, key, cands = _split_spec(split)
    b = bucket if where is None else f"CASE WHEN {where} THEN {bucket} END"
    extra = f", {aggs}" if aggs else ""
    sizes: dict = {}
    cells: dict = {}
    for k, bv, *vals in fq.run(
        f"SELECT {key}, {b}, count(*){extra} FROM {fq.src} GROUP BY ALL"
    ):
        sizes[k] = sizes.get(k, 0) + vals[0]
        if bv is not None:
            cells.setdefault(k, {})[bv] = vals
    fq.total = sum(sizes.values())
    merged: dict = {}
    for by_bucket in cells.values():
        for bv, vals in by_bucket.items():
            acc = merged.get(bv)
            merged[bv] = vals if acc is None else [a + v for a, v in zip(acc, vals)]
    out = [("ALL", all_label, fq.total, merged)]
    out += [
        (sid, label, sizes[k], cells.get(k, {}))
        for sid, label, k in cands
        if sizes.get(k, 0) >= MIN_SERIES_N
    ]
    return out


# ── Metadata chart builders ──────────────────────────────────────────────────

# Run stats that "vs stat" / histogram / scatter charts can use.
STATS: dict[str, dict[str, Any]] = {
    "floors_reached": {
        "label": "Floors reached",
        "col": "floors_reached",
        "bucket": 1,
        "max": 60,
    },
    "deck_size": {"label": "Deck size", "col": "deck_size", "bucket": 2, "max": 90},
    "relic_count": {
        "label": "Relic count",
        "col": "relic_count",
        "bucket": 1,
        "max": 45,
    },
    "run_minutes": {
        "label": "Run length (minutes)",
        "col": "run_time",
        "bucket": 5,
        "max": 240,
        "per": 60,
    },
    "ascension": {"label": "Ascension", "col": "ascension", "bucket": 1, "max": 10},
}


def _stat_buckets(stat: dict) -> tuple[str, str]:
    """(bucket, in range) as SQL over the stored column, in plotted units."""
    col, per = stat["col"], stat.get("per", 1)
    return (
        f"({col} // {stat['bucket'] * per}) * {stat['bucket']}",
        f"{col} BETWEEN 0 AND {stat['max'] * per}",
    )


def _stat_point(raw: int, stat: dict) -> float:
    per = stat.get("per")
    return round(raw, 2) if per is None else round(raw * (1 / per), 2)


def winrate_by_floor(fq: FrameQuery, split: str) -> list[dict]:
    """Of the runs that reached floor X, how many went on to win."""
    series = []
    for sid, label, _n, cells in _grouped(
        fq, split, "least(floors_reached, 60)", "sum(win)", "floors_reached >= 1"
    ):
        points = []
        reach = reach_w = 0
        for f in range(max(cells, default=0), 0, -1):
            n, w = cells.get(f, (0, 0))
            reach += n
            reach_w += w
            if reach >= MIN_POINT_N:
                points.append(
                    {"x": f, "y": round(reach_w / reach * 100, 1), "n": reach}
                )
        if points:
            points.reverse()
            series.append({"id": sid, "label": label, "points": points})
    return series


def deaths_by_floor(fq: FrameQuery, split: str) -> list[dict]:
    """Where losses end. Abandoned runs are excluded, they end anywhere."""
    series = []
    for sid, label, _n, cells in _grouped(
        fq,
        split,
        "least(greatest(floors_reached, 1), 60)",
        where="win = 0 AND was_abandoned = 0",
    ):
        n_total = sum(c[0] for c in cells.values())
        if n_total < MIN_POINT_N:
            continue
        points = [
            {"x": f, "y": round(c[0] / n_total * 100, 2), "n": c[0]}
            for f, c in sorted(cells.items())
        ]
        series.append({"id": sid, "label": label, "points": points, "total": n_total})
    return series


def winrate_over_time(fq: FrameQuery, split: str) -> list[dict]:
    series = []
    for sid, label, _n, cells in _grouped(
        fq, split, "played_day // 7", "sum(win)", "played_day > 0"
    ):
        points = [
            {"x": _week_label(wk), "y": round(w / n * 100, 1), "n": n}
            for wk, (n, w) in sorted(cells.items())
            if n >= 10
        ]
        if points:
            series.append({"id": sid, "label": label, "points": points})
    return series


MA_DAYS = 30


def _moving_average(days: dict[int, int], first: int, last: int) -> dict[int, float]:
    """Trailing MA_DAYS-day average in runs per week, keyed by week, read at
    each week's last day (or the newest day in the data). None until a full
    window of history exists."""
    out: dict[int, float] = {}
    window = 0
    for d in range(first, last + 1):
        window += days.get(d, 0)
        if d - MA_DAYS >= first:
            window -= days.get(d - MA_DAYS, 0)
        if (d + 1) % 7 == 0 or d == last:
            if d - first + 1 >= MA_DAYS:
                out[d // 7] = round(window * 7 / MA_DAYS, 1)
    return out


def runs_over_time(fq: FrameQuery, split: str, day: str = "played_day") -> list[dict]:
    series = []
    for sid, label, _n, cells in _grouped(fq, split, day, where=f"{day} > 0"):
        if not cells:
            continue
        days = {d: c[0] for d, c in cells.items()}
        weeks: dict[int, int] = {}
        for d, n in days.items():
            weeks[d // 7] = weeks.get(d // 7, 0) + n
        ma = _moving_average(days, min(days), max(days))
        points = [
            {"x": _week_label(wk), "y": n, "ma": ma.get(wk)}
            for wk, n in sorted(weeks.items())
        ]
        series.append({"id": sid, "label": label, "points": points})
    return series


def winrate_by_stat(fq: FrameQuery, stat_key: str, split: str) -> list[dict]:
    bucket, in_range = _stat_buckets(STATS[stat_key])
    series = []
    for sid, label, _n, cells in _grouped(fq, split, bucket, "sum(win)", in_range):
        points = [
            {"x": b, "y": round(w / n * 100, 1), "n": n}
            for b, (n, w) in sorted(cells.items())
            if n >= MIN_POINT_N
        ]
        if points:
            series.append({"id": sid, "label": label, "points": points})
    return series


def stat_histogram(fq: FrameQuery, stat_key: str, split: str) -> list[dict]:
    bucket, in_range = _stat_buckets(STATS[stat_key])
    series = []
    for sid, label, _n, cells in _grouped(fq, split, bucket, where=in_range):
        kept = sum(c[0] for c in cells.values())
        if kept < MIN_POINT_N:
            continue
        points = [
            {"x": b, "y": round(c[0] / kept * 100, 2), "n": c[0]}
            for b, c in sorted(cells.items())
        ]
        series.append({"id": sid, "label": label, "points": points, "total": kept})
    return series


def _win_seconds() -> str:
    stat = STATS["run_minutes"]
    return f"win <> 0 AND {stat['col']} BETWEEN 1 AND {stat['max'] * stat['per']}"


def time_to_win(fq: FrameQuery, split: str) -> list[dict]:
    """How long winning runs take: run length of wins in 5-minute buckets,
    with each series' average and median baked into its label so "how long
    does it take to beat a run" is answered right in the legend. Zero-length
    times are runs whose file carried no timer, not instant wins."""
    stat = STATS["run_minutes"]
    width, per = stat["bucket"] * stat["per"], stat["per"]
    series = []
    for sid, label, _n, cells in _grouped(fq, split, stat["col"], where=_win_seconds()):
        hist = sorted((t, c[0]) for t, c in cells.items())
        n = sum(c for _t, c in hist)
        if n < MIN_POINT_N:
            continue
        buckets: dict[int, int] = {}
        for t, c in hist:
            b = (t // width) * stat["bucket"]
            buckets[b] = buckets.get(b, 0) + c
        avg = sum(t * c for t, c in hist) / (n * per)
        mid = _nth(hist, n // 2) * (1 / per)
        med = mid if n % 2 else (_nth(hist, n // 2 - 1) * (1 / per) + mid) / 2
        points = [
            {"x": b, "y": round(c / n * 100, 2), "n": c}
            for b, c in sorted(buckets.items())
        ]
        series.append(
            {
                "id": sid,
                "label": f"{label} (avg {avg:.0f}m, median {med:.0f}m)",
                "points": points,
                "total": n,
                "avg_minutes": round(avg, 1),
                "median_minutes": round(med, 1),
            }
        )
    return series


def _nth(hist: list[tuple[int, int]], i: int) -> int:
    for t, c in hist:
        if i < c:
            return t
        i -= c
    raise IndexError(i)


def time_to_win_daily(fq: FrameQuery, split: str) -> list[dict]:
    """Average length of winning runs per day: the pace trend behind the
    time-to-win distribution. Days with under 10 wins are dropped rather
    than plotted as noise (mirrors winrate_over_time's per-point floor)."""
    per = STATS["run_minutes"]["per"]
    series = []
    for sid, label, _n, cells in _grouped(
        fq, split, "played_day", "sum(run_time)", f"played_day > 0 AND {_win_seconds()}"
    ):
        points = [
            {"x": _day_label(d), "y": round(secs / (n * per), 1), "n": n}
            for d, (n, secs) in sorted(cells.items())
            if n >= 10
        ]
        if points:
            series.append({"id": sid, "label": label, "points": points})
    return series


def stat_scatter(fq: FrameQuery, x_key: str, y_key: str, split: str) -> list[dict]:
    """Every series sampled down to SCATTER_PER_SERIES points by taking every
    stride-th run in frame order."""
    sx, sy = STATS[x_key], STATS[y_key]
    _all_label, key, cands = _split_spec(split)
    sizes = dict(fq.run(f"SELECT {key}, count(*) FROM {fq.src} GROUP BY 1"))
    fq.total = sum(sizes.values())
    groups = [
        (sid, label, k) for sid, label, k in cands if sizes.get(k, 0) >= MIN_SERIES_N
    ]
    rows = f"{fq.src} WHERE {key} IS NOT NULL"
    if not groups:
        key, rows = "true", fq.src
        groups = [("ALL", "All runs", True)]
    sampled: dict = {}
    for k, xv, yv, win, cnt in fq.run(
        f"SELECT k, x, y, win, cnt FROM (SELECT {key} AS k,"
        f" {sx['col']} AS x, {sy['col']} AS y, win,"
        f" row_number() OVER (PARTITION BY {key} ORDER BY seq) AS rn,"
        f" count(*) OVER (PARTITION BY {key}) AS cnt FROM {rows})"
        f" WHERE (rn - 1) % greatest(1, ceil(cnt / {SCATTER_PER_SERIES}))::BIGINT = 0"
        " ORDER BY rn"
    ):
        point = {"x": _stat_point(xv, sx), "y": _stat_point(yv, sy), "win": win}
        sampled.setdefault(k, (cnt, []))[1].append(point)
    return [
        {
            "id": sid,
            "label": label,
            "points": sampled[k][1],
            "sampled_from": sampled[k][0],
        }
        for sid, label, k in groups
        if k in sampled
    ]


_FUNNEL_STAGES = ("Started", "Reached Act 2", "Reached Act 3", "Won")


def acts_funnel(fq: FrameQuery, split: str) -> list[dict]:
    """How far runs get: share surviving each act boundary, ending in wins."""
    series = []
    for sid, label, n, cells in _grouped(
        fq,
        split,
        "0",
        "count(*) FILTER (WHERE acts_completed >= 1),"
        " count(*) FILTER (WHERE acts_completed >= 2),"
        " count(*) FILTER (WHERE win <> 0)",
    ):
        if n < MIN_POINT_N:
            continue
        counts = cells.get(0, [n, 0, 0, 0])
        points = [
            {"x": stage, "y": round(c / n * 100, 1), "n": c}
            for stage, c in zip(_FUNNEL_STAGES, counts)
        ]
        series.append({"id": sid, "label": label, "points": points, "total": n})
    return series


def hardest_dailies(fq: FrameQuery, limit: int = 42) -> list[dict]:
    """Win rate per daily date (the seed encodes the daily's date)."""
    by_date = {
        d: (n, w)
        for d, n, w in fq.run(
            f"SELECT daily_date, count(*), sum(win) FROM {fq.src}"
            f" WHERE daily_date <> '' GROUP BY 1 ORDER BY 1 DESC LIMIT {int(limit)}"
        )
    }
    dates = sorted(by_date)
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
    played: Any = None,
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
                played=played,
            )


def _accumulate_one(
    acc: dict[str, Any],
    blob: dict,
    *,
    is_win: bool,
    character: str,
    player_count: int,
    played: Any = None,
) -> None:
    """Fold one run blob into ONE bracket's accumulator. Defensive like the
    community walk: missing keys skip quietly, never raise."""
    char = _norm_char(character)
    players = min(max(int(player_count or 1), 1), 4)
    week = _epoch_day(played) // 7 if played else 0

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
                {
                    "username_lower": u.lower(),
                    "hidden": {"$ne": True},
                    "deleted_at": None,
                },
                {
                    "_id": 1,
                    "character": 1,
                    "win": 1,
                    "player_count": 1,
                    "submitted_at": 1,
                    "played_at": 1,
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
                "played_at": d.get("played_at"),
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
    blob_map: dict[str, dict] = {}
    if os.environ.get("MONGO_URL", "").strip():
        from .runs_db_mongo import get_run_blobs

        blob_map = get_run_blobs([row["run_hash"] for row in rows])
    for row in rows:
        blob = blob_map.get(row["run_hash"])
        if blob is None:
            path = _RUNS_DIR / f"{row['run_hash']}.json"
            if not path.exists():
                continue
            try:
                with open(path, "r", encoding="utf-8") as f:
                    blob = json.load(f)
            except Exception:
                continue
        try:
            _accumulate_one(
                acc,
                blob,
                is_win=bool(row["win"]),
                character=row["character"],
                player_count=row["player_count"],
                played=row.get("played_at") or row.get("submitted_at"),
            )
        except Exception:
            continue
    return _finalize_one(acc)
