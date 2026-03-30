"""SQLite database for community run data."""
import json
import hashlib
import sqlite3
from pathlib import Path
from contextlib import contextmanager

import os

# Use DATA_DIR env var (Docker) or fall back to project data/
_data_dir = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data"))
DB_PATH = _data_dir / "runs.db"


def get_db_path() -> Path:
    """Return the database path, creating the directory if needed."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return DB_PATH


@contextmanager
def get_conn():
    """Get a database connection with WAL mode for concurrent reads."""
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
    """Create tables if they don't exist."""
    with get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_hash TEXT UNIQUE NOT NULL,
                seed TEXT NOT NULL,
                character TEXT NOT NULL,
                win INTEGER NOT NULL,
                was_abandoned INTEGER NOT NULL DEFAULT 0,
                ascension INTEGER NOT NULL DEFAULT 0,
                game_mode TEXT NOT NULL DEFAULT 'standard',
                player_count INTEGER NOT NULL DEFAULT 1,
                run_time INTEGER NOT NULL DEFAULT 0,
                floors_reached INTEGER NOT NULL DEFAULT 0,
                acts_completed INTEGER NOT NULL DEFAULT 0,
                killed_by TEXT,
                deck_size INTEGER NOT NULL DEFAULT 0,
                relic_count INTEGER NOT NULL DEFAULT 0,
                username TEXT,
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS run_cards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id INTEGER NOT NULL REFERENCES runs(id),
                card_id TEXT NOT NULL,
                upgraded INTEGER NOT NULL DEFAULT 0,
                enchantment TEXT,
                floor_added INTEGER
            );

            CREATE TABLE IF NOT EXISTS run_relics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id INTEGER NOT NULL REFERENCES runs(id),
                relic_id TEXT NOT NULL,
                floor_added INTEGER
            );

            CREATE TABLE IF NOT EXISTS run_card_choices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id INTEGER NOT NULL REFERENCES runs(id),
                card_id TEXT NOT NULL,
                was_picked INTEGER NOT NULL,
                floor INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_runs_character ON runs(character);
            CREATE INDEX IF NOT EXISTS idx_runs_win ON runs(win);
            CREATE INDEX IF NOT EXISTS idx_runs_ascension ON runs(ascension);
            CREATE INDEX IF NOT EXISTS idx_runs_game_mode ON runs(game_mode);
            CREATE INDEX IF NOT EXISTS idx_run_cards_card ON run_cards(card_id);
            CREATE INDEX IF NOT EXISTS idx_run_cards_run ON run_cards(run_id);
            CREATE INDEX IF NOT EXISTS idx_run_relics_relic ON run_relics(relic_id);
            CREATE INDEX IF NOT EXISTS idx_run_choices_card ON run_card_choices(card_id);
            CREATE INDEX IF NOT EXISTS idx_run_choices_run ON run_card_choices(run_id);
        """)

        # Migrations — add columns to existing tables
        for col, coltype in [("was_abandoned", "INTEGER NOT NULL DEFAULT 0"), ("player_count", "INTEGER NOT NULL DEFAULT 1"), ("username", "TEXT")]:
            try:
                conn.execute(f"ALTER TABLE runs ADD COLUMN {col} {coltype}")
            except Exception:
                pass  # column already exists
        try:
            conn.execute("CREATE INDEX IF NOT EXISTS idx_runs_player_count ON runs(player_count)")
        except Exception:
            pass


def compute_run_hash(data: dict) -> str:
    """Compute a unique hash for deduplication based on seed + character + start_time."""
    key = f"{data.get('seed', '')}:{data['players'][0]['character']}:{data.get('start_time', '')}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def clean_id(raw_id: str) -> str:
    """Strip prefixes like CARD., RELIC., etc."""
    for prefix in ("CARD.", "RELIC.", "ENCHANTMENT.", "MONSTER.", "ENCOUNTER.", "CHARACTER.", "ACT."):
        if raw_id.startswith(prefix):
            return raw_id[len(prefix):]
    return raw_id


def submit_run(data: dict, username: str | None = None) -> dict:
    """Parse and store a run. Returns status dict."""
    # Validate structure
    if not data.get("players") or not data.get("map_point_history") or not isinstance(data.get("acts"), list):
        return {"error": "Invalid run data — missing required fields"}

    run_hash = compute_run_hash(data)
    player = data["players"][0]
    character = clean_id(player["character"])
    was_abandoned = int(data.get("was_abandoned", False))

    total_floors = sum(len(act) for act in data.get("map_point_history", []))
    killed_by = clean_id(data["killed_by_encounter"]) if data.get("killed_by_encounter") else None
    player_count = len(data.get("players", []))

    with get_conn() as conn:
        # Check for duplicate
        existing = conn.execute("SELECT id FROM runs WHERE run_hash = ?", (run_hash,)).fetchone()
        if existing:
            # Ensure JSON file exists for sharing even on duplicates
            runs_dir = _data_dir / "runs"
            runs_dir.mkdir(parents=True, exist_ok=True)
            run_file = runs_dir / f"{run_hash}.json"
            if not run_file.exists():
                with open(run_file, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False)
            return {"error": "This run has already been submitted", "duplicate": True, "run_hash": run_hash}

        # Insert run
        cursor = conn.execute("""
            INSERT INTO runs (run_hash, seed, character, win, was_abandoned, ascension, game_mode,
                              player_count, run_time, floors_reached, acts_completed, killed_by,
                              deck_size, relic_count, username)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            run_hash, data.get("seed", ""), character, int(data.get("win", False)),
            was_abandoned, data.get("ascension", 0), data.get("game_mode", "standard"),
            player_count, data.get("run_time", 0), total_floors, len(data.get("acts", [])),
            killed_by, len(player["deck"]), len(player["relics"]), username,
        ))
        run_id = cursor.lastrowid

        # Insert cards
        for card in player["deck"]:
            card_id = clean_id(card["id"])
            upgraded = card.get("current_upgrade_level", 0)
            enchantment = clean_id(card["enchantment"]["id"]) if card.get("enchantment") else None
            floor_added = card.get("floor_added_to_deck")
            conn.execute(
                "INSERT INTO run_cards (run_id, card_id, upgraded, enchantment, floor_added) VALUES (?, ?, ?, ?, ?)",
                (run_id, card_id, upgraded, enchantment, floor_added),
            )

        # Insert relics
        for relic in player["relics"]:
            relic_id = clean_id(relic["id"])
            floor_added = relic.get("floor_added_to_deck")
            conn.execute(
                "INSERT INTO run_relics (run_id, relic_id, floor_added) VALUES (?, ?, ?)",
                (run_id, relic_id, floor_added),
            )

        # Insert card choices from floor history
        for act_idx, act_floors in enumerate(data.get("map_point_history", [])):
            for floor_idx, floor in enumerate(act_floors):
                floor_num = floor_idx + 1
                for ps in floor.get("player_stats", []):
                    for choice in ps.get("card_choices", []):
                        card_id = clean_id(choice["card"]["id"])
                        was_picked = int(choice.get("was_picked", False))
                        conn.execute(
                            "INSERT INTO run_card_choices (run_id, card_id, was_picked, floor) VALUES (?, ?, ?, ?)",
                            (run_id, card_id, was_picked, floor_num),
                        )

    # Save full run JSON for sharing
    runs_dir = _data_dir / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    with open(runs_dir / f"{run_hash}.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)

    return {"success": True, "run_id": run_id, "run_hash": run_hash}


def get_stats(character: str | None = None, win: str | None = None,
              ascension: str | None = None, game_mode: str | None = None,
              players: str | None = None) -> dict:
    """Compute aggregate community stats with optional filters."""
    with get_conn() as conn:
        # Build WHERE clause
        conditions = []
        params: list = []
        if character:
            conditions.append("r.character = ?")
            params.append(character.upper())
        if win == "true":
            conditions.append("r.win = 1")
        elif win == "false":
            conditions.append("r.win = 0 AND r.was_abandoned = 0")
        elif win == "abandoned":
            conditions.append("r.was_abandoned = 1")
        if ascension is not None and ascension != "":
            conditions.append("r.ascension = ?")
            params.append(int(ascension))
        if game_mode:
            conditions.append("r.game_mode = ?")
            params.append(game_mode)
        if players == "single":
            conditions.append("r.player_count = 1")
        elif players == "multi":
            conditions.append("r.player_count > 1")
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        total = conn.execute(f"SELECT COUNT(*) as c FROM runs r {where}", params).fetchone()["c"]
        if total == 0:
            return {"total_runs": 0, "filters": {"character": character, "win": win, "ascension": ascension, "game_mode": game_mode, "players": players}}

        win_where = where + (" AND " if where else "WHERE ") + "r.win = 1"
        wins = conn.execute(f"SELECT COUNT(*) as c FROM runs r {win_where}", params).fetchone()["c"]
        abandoned_where = where + (" AND " if where else "WHERE ") + "r.was_abandoned = 1"
        abandoned = conn.execute(f"SELECT COUNT(*) as c FROM runs r {abandoned_where}", params).fetchone()["c"]

        # Win rate by character (always unfiltered by character for the overview)
        char_stats = conn.execute("""
            SELECT character, COUNT(*) as total, SUM(win) as wins
            FROM runs GROUP BY character ORDER BY total DESC
        """).fetchall()

        # Card pick rates — ALL cards, not just top N
        pick_rates = conn.execute(f"""
            SELECT cc.card_id,
                   COUNT(*) as offered,
                   SUM(cc.was_picked) as picked,
                   ROUND(100.0 * SUM(cc.was_picked) / COUNT(*), 1) as pick_rate
            FROM run_card_choices cc
            JOIN runs r ON cc.run_id = r.id
            {where}
            GROUP BY cc.card_id
            ORDER BY pick_rate DESC
        """, params).fetchall()

        # Cards in winning decks (filtered)
        win_params = list(params)
        win_where = where + (" AND " if where else "WHERE ") + "r.win = 1"
        win_cards = conn.execute(f"""
            SELECT rc.card_id, COUNT(*) as count
            FROM run_cards rc JOIN runs r ON rc.run_id = r.id
            {win_where}
            GROUP BY rc.card_id ORDER BY count DESC
        """, win_params).fetchall()

        # Cards in losing decks (filtered)
        loss_where = where + (" AND " if where else "WHERE ") + "r.win = 0"
        loss_cards = conn.execute(f"""
            SELECT rc.card_id, COUNT(*) as count
            FROM run_cards rc JOIN runs r ON rc.run_id = r.id
            {loss_where}
            GROUP BY rc.card_id ORDER BY count DESC
        """, params).fetchall()

        # All cards in decks (filtered)
        all_cards = conn.execute(f"""
            SELECT rc.card_id, COUNT(*) as count
            FROM run_cards rc JOIN runs r ON rc.run_id = r.id
            {where}
            GROUP BY rc.card_id ORDER BY count DESC
        """, params).fetchall()

        # Most common relics (filtered)
        top_relics = conn.execute(f"""
            SELECT rr.relic_id, COUNT(*) as count
            FROM run_relics rr JOIN runs r ON rr.run_id = r.id
            {where}
            GROUP BY rr.relic_id ORDER BY count DESC LIMIT 20
        """, params).fetchall()

        # Most deadly encounters (filtered, losses only)
        death_where = where + (" AND " if where else "WHERE ") + "r.win = 0 AND r.killed_by IS NOT NULL"
        deaths = conn.execute(f"""
            SELECT r.killed_by, COUNT(*) as count
            FROM runs r
            {death_where}
            GROUP BY r.killed_by ORDER BY count DESC LIMIT 10
        """, params).fetchall()

        # Ascension distribution (filtered)
        asc_stats = conn.execute(f"""
            SELECT r.ascension, COUNT(*) as total, SUM(r.win) as wins
            FROM runs r {where} GROUP BY r.ascension ORDER BY r.ascension
        """, params).fetchall()

        # Win runs per card (distinct runs, not copies)
        win_runs_query = conn.execute(f"""
            SELECT rc.card_id, COUNT(DISTINCT rc.run_id) as run_count
            FROM run_cards rc JOIN runs r ON rc.run_id = r.id
            {win_where}
            GROUP BY rc.card_id
        """, win_params).fetchall()
        win_runs_map = {r["card_id"]: r["run_count"] for r in win_runs_query}

        # Total runs per card (distinct)
        all_runs_query = conn.execute(f"""
            SELECT rc.card_id, COUNT(DISTINCT rc.run_id) as run_count
            FROM run_cards rc JOIN runs r ON rc.run_id = r.id
            {where}
            GROUP BY rc.card_id
        """, params).fetchall()
        all_runs_map = {r["card_id"]: r["run_count"] for r in all_runs_query}

        win_card_map = {r["card_id"]: r["count"] for r in win_cards}
        loss_card_map = {r["card_id"]: r["count"] for r in loss_cards}

        return {
            "total_runs": total,
            "total_wins": wins,
            "total_abandoned": abandoned,
            "win_rate": round(wins / total * 100, 1) if total > 0 else 0,
            "filters": {"character": character, "win": win, "ascension": ascension, "game_mode": game_mode, "players": players},
            "characters": [
                {"character": r["character"], "total": r["total"], "wins": r["wins"],
                 "win_rate": round(r["wins"] / r["total"] * 100, 1) if r["total"] > 0 else 0}
                for r in char_stats
            ],
            "ascensions": [
                {"level": r["ascension"], "total": r["total"], "wins": r["wins"],
                 "win_rate": round(r["wins"] / r["total"] * 100, 1) if r["total"] > 0 else 0}
                for r in asc_stats
            ],
            "top_cards": [{"card_id": r["card_id"], "count": r["count"],
                           "in_wins": win_card_map.get(r["card_id"], 0),
                           "in_losses": loss_card_map.get(r["card_id"], 0),
                           "win_runs": win_runs_map.get(r["card_id"], 0),
                           "total_runs_with": all_runs_map.get(r["card_id"], 0)}
                          for r in all_cards],
            "pick_rates": [
                {"card_id": r["card_id"], "offered": r["offered"], "picked": r["picked"], "pick_rate": r["pick_rate"]}
                for r in pick_rates
            ],
            "top_relics": [{"relic_id": r["relic_id"], "count": r["count"]} for r in top_relics],
            "deadliest": [{"encounter": r["killed_by"], "count": r["count"]} for r in deaths],
        }


# Initialize on import
init_db()
