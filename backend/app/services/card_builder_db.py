"""SQLite database for custom card builder data."""

import json
import secrets
import sqlite3
from pathlib import Path
from contextlib import contextmanager
from typing import Optional

import os

_data_dir = Path(
    os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data")
)
DB_PATH = _data_dir / "card_builder.db"


def get_db_path() -> Path:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return DB_PATH


@contextmanager
def get_conn():
    conn = sqlite3.connect(str(get_db_path()), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
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
            CREATE TABLE IF NOT EXISTS cards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                share_code TEXT UNIQUE NOT NULL,
                creator_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                class_name TEXT NOT NULL,
                card_data TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_cards_creator ON cards(creator_hash);
            CREATE INDEX IF NOT EXISTS idx_cards_share ON cards(share_code);
            CREATE INDEX IF NOT EXISTS idx_cards_updated ON cards(updated_at DESC);
        """)


def _generate_share_code() -> str:
    return secrets.token_urlsafe(8)


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["card_data"] = json.loads(d["card_data"])
    return d


def create_card(creator_hash: str, name: str, class_name: str, card_data: dict) -> dict:
    init_db()
    share_code = _generate_share_code()
    with get_conn() as conn:
        cursor = conn.execute(
            """INSERT INTO cards (share_code, creator_hash, name, class_name, card_data)
               VALUES (?, ?, ?, ?, ?)""",
            (share_code, creator_hash, name, class_name, json.dumps(card_data)),
        )
        row = conn.execute(
            "SELECT * FROM cards WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
        return _row_to_dict(row)


def update_card(
    card_id: int, creator_hash: str, name: str, class_name: str, card_data: dict
) -> Optional[dict]:
    init_db()
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT * FROM cards WHERE id = ? AND creator_hash = ?",
            (card_id, creator_hash),
        ).fetchone()
        if not existing:
            return None
        conn.execute(
            """UPDATE cards SET name = ?, class_name = ?, card_data = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ? AND creator_hash = ?""",
            (name, class_name, json.dumps(card_data), card_id, creator_hash),
        )
        row = conn.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
        return _row_to_dict(row)


def delete_card(card_id: int, creator_hash: str) -> bool:
    init_db()
    with get_conn() as conn:
        result = conn.execute(
            "DELETE FROM cards WHERE id = ? AND creator_hash = ?",
            (card_id, creator_hash),
        )
        return result.rowcount > 0


def get_card_by_id(card_id: int) -> Optional[dict]:
    init_db()
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
        return _row_to_dict(row) if row else None


def get_card_by_share_code(share_code: str) -> Optional[dict]:
    init_db()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM cards WHERE share_code = ?", (share_code,)
        ).fetchone()
        return _row_to_dict(row) if row else None


def list_cards_by_creator(creator_hash: str, page: int = 1, limit: int = 50) -> dict:
    init_db()
    per_page = min(limit, 100)
    offset = (max(page, 1) - 1) * per_page
    with get_conn() as conn:
        total = conn.execute(
            "SELECT COUNT(*) as c FROM cards WHERE creator_hash = ?", (creator_hash,)
        ).fetchone()["c"]
        rows = conn.execute(
            "SELECT * FROM cards WHERE creator_hash = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?",
            (creator_hash, per_page, offset),
        ).fetchall()
        return {
            "cards": [_row_to_dict(r) for r in rows],
            "total": total,
            "page": max(page, 1),
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page if total > 0 else 0,
        }


def list_recent_cards(page: int = 1, limit: int = 50) -> dict:
    init_db()
    per_page = min(limit, 100)
    offset = (max(page, 1) - 1) * per_page
    with get_conn() as conn:
        total = conn.execute("SELECT COUNT(*) as c FROM cards").fetchone()["c"]
        rows = conn.execute(
            "SELECT * FROM cards ORDER BY updated_at DESC LIMIT ? OFFSET ?",
            (per_page, offset),
        ).fetchall()
        return {
            "cards": [_row_to_dict(r) for r in rows],
            "total": total,
            "page": max(page, 1),
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page if total > 0 else 0,
        }
