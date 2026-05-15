"""SQLite-backed search analytics.

Writes are batched on a background thread so the API request never blocks
on disk I/O — search logging is best-effort and a stalled writer drops
queued rows rather than backpressuring real traffic. The DB lives next to
runs.db inside DATA_DIR so the same Docker volume + Litestream replication
pipeline covers both.

The point of capturing query text (which would explode Prometheus
cardinality) is twofold:
  - top searches → what people actually look for, used to prioritize
    product work
  - zero-result searches → what people look for AND don't find, the
    most actionable bucket (missing entities, synonym gaps,
    locale-only spellings)

`ip_hash` is salted with the current UTC date so the same client on the
same day collapses to one identity (de-duping the "top" list) but cannot
be tracked across days. Hash is truncated to 16 hex chars — enough for
within-day uniqueness, short enough not to bloat the row.
"""

import hashlib
import logging
import os
import queue
import sqlite3
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

_data_dir = Path(
    os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data")
)
DB_PATH = _data_dir / "searches.db"

# Bounded — drop on overflow rather than back-pressuring HTTP traffic.
# ~2 writes/sec sustained at current load; 10k entries = ~80 min of buffer
# even with the writer thread completely stalled. Plenty for any plausible
# disk hiccup.
_WRITE_QUEUE: queue.Queue = queue.Queue(maxsize=10_000)
_BATCH_SIZE = 100
_FLUSH_INTERVAL_S = 5.0
_MAX_QUERY_LEN = 200


def get_db_path() -> Path:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return DB_PATH


@contextmanager
def get_conn():
    conn = sqlite3.connect(str(get_db_path()), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS searches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts INTEGER NOT NULL,
                query TEXT NOT NULL,
                entity_type TEXT,
                lang TEXT,
                ip_hash TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_searches_ts ON searches(ts);
            CREATE INDEX IF NOT EXISTS idx_searches_query ON searches(query);
            CREATE INDEX IF NOT EXISTS idx_searches_entity ON searches(entity_type);
        """)


def hash_ip(client_ip: str | None) -> str:
    """Stable-within-day, untraceable-across-days hash of the client IP."""
    if not client_ip:
        return ""
    today = datetime.now(timezone.utc).date().isoformat()
    return hashlib.sha256(f"{client_ip}:{today}".encode()).hexdigest()[:16]


def log_search(
    query: str,
    entity_type: str | None,
    lang: str | None,
    ip_hash: str,
) -> None:
    """Enqueue a search for the background writer. Non-blocking."""
    if not query:
        return
    try:
        _WRITE_QUEUE.put_nowait(
            (
                int(time.time()),
                query[:_MAX_QUERY_LEN],
                entity_type,
                lang,
                ip_hash,
            )
        )
    except queue.Full:
        # Best-effort logging — never block the request path.
        pass


def _writer_loop() -> None:
    while True:
        batch: list[tuple] = []
        try:
            batch.append(_WRITE_QUEUE.get(timeout=_FLUSH_INTERVAL_S))
        except queue.Empty:
            continue
        while len(batch) < _BATCH_SIZE:
            try:
                batch.append(_WRITE_QUEUE.get_nowait())
            except queue.Empty:
                break
        try:
            with get_conn() as conn:
                conn.executemany(
                    "INSERT INTO searches (ts, query, entity_type, lang, ip_hash) "
                    "VALUES (?, ?, ?, ?, ?)",
                    batch,
                )
        except Exception:
            logger.exception("search batch write failed (%d rows dropped)", len(batch))


def top_searches(
    days: int = 7,
    limit: int = 100,
    entity_type: str | None = None,
) -> list[dict]:
    cutoff = int(time.time()) - days * 86400
    where = ["ts >= ?"]
    params: list = [cutoff]
    if entity_type:
        where.append("entity_type = ?")
        params.append(entity_type)
    where_clause = " WHERE " + " AND ".join(where)
    with get_conn() as conn:
        rows = conn.execute(
            f"""
            SELECT query,
                   entity_type,
                   COUNT(*) as hits,
                   COUNT(DISTINCT ip_hash) as unique_users
            FROM searches{where_clause}
            GROUP BY query, entity_type
            ORDER BY hits DESC
            LIMIT ?
            """,
            [*params, limit],
        ).fetchall()
    return [dict(r) for r in rows]


def recent_searches(
    limit: int = 200,
    entity_type: str | None = None,
) -> list[dict]:
    where: list[str] = []
    params: list = []
    if entity_type:
        where.append("entity_type = ?")
        params.append(entity_type)
    where_clause = (" WHERE " + " AND ".join(where)) if where else ""
    with get_conn() as conn:
        rows = conn.execute(
            f"""
            SELECT ts, query, entity_type, lang
            FROM searches{where_clause}
            ORDER BY ts DESC
            LIMIT ?
            """,
            [*params, limit],
        ).fetchall()
    return [dict(r) for r in rows]


def search_volume(days: int = 30) -> list[dict]:
    """Per-day hit counts, useful for spotting trends."""
    cutoff = int(time.time()) - days * 86400
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT
                date(ts, 'unixepoch') as day,
                COUNT(*) as hits,
                COUNT(DISTINCT ip_hash) as unique_users
            FROM searches
            WHERE ts >= ?
            GROUP BY day
            ORDER BY day DESC
            """,
            (cutoff,),
        ).fetchall()
    return [dict(r) for r in rows]


# Schema + background writer come up at import time so they're ready
# before the first request lands.
init_db()
threading.Thread(target=_writer_loop, daemon=True, name="searches-writer").start()
