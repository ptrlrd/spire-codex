"""Community run database — local SQLite or Turso (libSQL).

Connection strategy: when TURSO_URL is set, `get_conn()` returns a
libsql_experimental connection (drop-in sqlite3 API) pointed at Turso.
Otherwise it falls back to the legacy local SQLite file at DATA_DIR/runs.db.

This lets us flip a single host to Turso by setting an env var, with no
changes at call sites. Once Turso has proven stable in prod, the sqlite
fallback and the data/runs.db volume mount can be removed.
"""

import hashlib
import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

# Use DATA_DIR env var (Docker) or fall back to project data/
_data_dir = Path(
    os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data")
)
DB_PATH = _data_dir / "runs.db"


def get_db_path() -> Path:
    """Return the database path, creating the directory if needed."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return DB_PATH


def _using_turso() -> bool:
    """Single source of truth for "are we on Turso right now". Trimmed so
    an accidental TURSO_URL=" " doesn't half-activate the libsql path.
    """
    return bool(os.environ.get("TURSO_URL", "").strip())


class _DictRowCursor:
    """Wraps a libsql cursor so fetchone()/fetchall() return dicts. The
    underlying Connection in libsql_experimental doesn't accept a
    `row_factory` attribute (it's a Rust-backed object), so we adapt at
    the cursor level instead. Dict semantics match what sqlite3.Row gave
    us, which the rest of this module relies on (`row["run_hash"]`).
    """

    def __init__(self, cursor):
        self._cursor = cursor

    def _to_dict(self, row):
        if row is None:
            return None
        desc = self._cursor.description or ()
        return {d[0]: row[i] for i, d in enumerate(desc)}

    def fetchone(self):
        return self._to_dict(self._cursor.fetchone())

    def fetchall(self):
        return [self._to_dict(r) for r in self._cursor.fetchall()]

    def __iter__(self):
        for row in self._cursor:
            yield self._to_dict(row)

    def __getattr__(self, name):
        return getattr(self._cursor, name)


class _DictRowConn:
    """Wraps a libsql Connection so every .execute() returns a
    _DictRowCursor. Everything else (commit, rollback, close,
    executescript, executemany) passes through to the wrapped connection.
    """

    def __init__(self, conn):
        self._conn = conn

    def execute(self, *args, **kwargs):
        return _DictRowCursor(self._conn.execute(*args, **kwargs))

    def __getattr__(self, name):
        return getattr(self._conn, name)


@contextmanager
def get_conn():
    """Yield a DB connection. Commits on clean exit, rolls back on exception.
    Routes to Turso when TURSO_URL is set, local SQLite otherwise.
    """
    if _using_turso():
        # Lazy import so dev environments that haven't pip-installed
        # libsql can still run on the sqlite path. Using the official
        # `libsql` package (not `libsql-experimental`, which ships an
        # empty cursor.description and breaks dict-row mapping).
        import libsql

        raw = libsql.connect(
            os.environ["TURSO_URL"],
            auth_token=os.environ.get("TURSO_AUTH_TOKEN", ""),
        )
        conn = _DictRowConn(raw)
        # Skip PRAGMA journal_mode=WAL — Turso handles concurrency
        # natively, and the pragma would burn a network round-trip.
        # Foreign keys are enforced by default on Turso.
    else:
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

            CREATE TABLE IF NOT EXISTS run_potions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id INTEGER NOT NULL REFERENCES runs(id),
                potion_id TEXT NOT NULL,
                was_picked INTEGER NOT NULL,
                was_used INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_run_potions_potion ON run_potions(potion_id);
            CREATE INDEX IF NOT EXISTS idx_run_potions_run ON run_potions(run_id);
        """)

        # Migrations — add columns to existing tables
        for col, coltype in [
            ("was_abandoned", "INTEGER NOT NULL DEFAULT 0"),
            ("player_count", "INTEGER NOT NULL DEFAULT 1"),
            ("username", "TEXT"),
            ("build_id", "TEXT"),
        ]:
            try:
                conn.execute(f"ALTER TABLE runs ADD COLUMN {col} {coltype}")
            except Exception:
                pass  # column already exists
        try:
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_runs_player_count ON runs(player_count)"
            )
        except Exception:
            pass
        try:
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_runs_build_id ON runs(build_id)"
            )
        except Exception:
            pass


def clean_id(raw_id: str) -> str:
    """Strip prefixes like CARD., RELIC., etc."""
    for prefix in (
        "CARD.",
        "RELIC.",
        "ENCHANTMENT.",
        "MONSTER.",
        "ENCOUNTER.",
        "CHARACTER.",
        "ACT.",
        "POTION.",
    ):
        if raw_id.startswith(prefix):
            return raw_id[len(prefix) :]
    return raw_id


def submit_run(data: dict, username: str | None = None) -> dict:
    """Parse and store a run. Returns status dict."""
    # Validate structure. Errors call out the specific field so failed
    # batch uploads (issue #151) can be triaged without re-running with
    # a debugger — previously every rejection collapsed to the same
    # "missing required fields" message regardless of which field was
    # actually the problem.
    missing: list[str] = []
    if not data.get("players"):
        missing.append("players")
    if not data.get("map_point_history"):
        missing.append("map_point_history")
    if not isinstance(data.get("acts"), list):
        missing.append("acts")
    if missing:
        return {
            "error": (
                f"Invalid run data — missing or empty fields: {', '.join(missing)}"
            )
        }

    was_abandoned = int(data.get("was_abandoned", False))
    total_floors = sum(len(act) for act in data.get("map_point_history", []))
    killed_by_raw = data.get("killed_by_encounter", "")
    killed_by = (
        clean_id(killed_by_raw)
        if killed_by_raw and killed_by_raw != "NONE.NONE"
        else None
    )
    player_count = len(data.get("players", []))

    # Process each player as a separate run entry (multiplayer support)
    results = []
    for player_idx, player in enumerate(data["players"]):
        result = _submit_player_run(
            data,
            player,
            player_idx,
            was_abandoned,
            total_floors,
            killed_by,
            player_count,
            username,
        )
        results.append(result)

    # Save full run JSON for sharing (for every player's hash, so multiplayer detail pages work)
    runs_dir = _data_dir / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    for result in results:
        if result.get("success") or result.get("duplicate"):
            run_hash = result.get("run_hash", "")
            if run_hash:
                run_file = runs_dir / f"{run_hash}.json"
                if not run_file.exists():
                    try:
                        with open(run_file, "w", encoding="utf-8") as f:
                            json.dump(data, f, ensure_ascii=False)
                    except Exception as e:
                        print(f"Warning: failed to save run {run_hash}: {e}")

    # Return first player's result (for hash/sharing)
    return results[0]


def _submit_player_run(
    data: dict,
    player: dict,
    player_idx: int,
    was_abandoned: int,
    total_floors: int,
    killed_by: str | None,
    player_count: int,
    username: str | None,
) -> dict:
    """Submit a single player's data from a run."""
    # Hash includes player index for multiplayer dedup
    seed = data.get("seed", "")
    char = player["character"]
    start = data.get("start_time", "")
    run_time = data.get("run_time", 0)
    deck_size = len(player.get("deck", []))
    key = f"{seed}:{char}:{start}:{run_time}:{deck_size}:{player_idx}"
    run_hash = hashlib.sha256(key.encode()).hexdigest()[:16]

    character = clean_id(player["character"])

    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id FROM runs WHERE run_hash = ?", (run_hash,)
        ).fetchone()
        if existing:
            return {
                "error": "This run has already been submitted",
                "duplicate": True,
                "run_hash": run_hash,
            }

        cursor = conn.execute(
            """
            INSERT INTO runs (run_hash, seed, character, win, was_abandoned, ascension, game_mode,
                              player_count, run_time, floors_reached, acts_completed, killed_by,
                              deck_size, relic_count, username, build_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                run_hash,
                data.get("seed", ""),
                character,
                int(data.get("win", False)),
                was_abandoned,
                data.get("ascension", 0),
                data.get("game_mode", "standard"),
                player_count,
                data.get("run_time", 0),
                total_floors,
                len(data.get("acts", [])),
                killed_by,
                len(player["deck"]),
                len(player["relics"]),
                username,
                data.get("build_id"),
            ),
        )
        run_id = cursor.lastrowid

        # Insert cards
        for card in player["deck"]:
            card_id = clean_id(card["id"])
            upgraded = card.get("current_upgrade_level", 0)
            enchantment = (
                clean_id(card["enchantment"]["id"]) if card.get("enchantment") else None
            )
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

        # Insert card choices and potion data — match player_id to this player
        potion_used_set: set[str] = set()
        potion_seen: dict[str, bool] = {}
        player_id = player.get("id", player_idx + 1)
        for act_idx, act_floors in enumerate(data.get("map_point_history", [])):
            for floor_idx, floor in enumerate(act_floors):
                floor_num = floor_idx + 1
                for ps in floor.get("player_stats", []):
                    # Only process stats for this player
                    if ps.get("player_id") and ps["player_id"] != player_id:
                        continue
                    for choice in ps.get("card_choices", []):
                        card_id = clean_id(choice["card"]["id"])
                        was_picked = int(choice.get("was_picked", False))
                        conn.execute(
                            "INSERT INTO run_card_choices (run_id, card_id, was_picked, floor) VALUES (?, ?, ?, ?)",
                            (run_id, card_id, was_picked, floor_num),
                        )
                    for pc in ps.get("potion_choices", []):
                        pid = clean_id(pc.get("choice", ""))
                        if pid:
                            picked = int(pc.get("was_picked", False))
                            potion_seen[pid] = potion_seen.get(pid, False) or bool(
                                picked
                            )
                    for pu in ps.get("potion_used", []):
                        pid = clean_id(pu)
                        if pid:
                            potion_used_set.add(pid)

        for pid, was_picked in potion_seen.items():
            was_used = 1 if pid in potion_used_set else 0
            conn.execute(
                "INSERT INTO run_potions (run_id, potion_id, was_picked, was_used) VALUES (?, ?, ?, ?)",
                (run_id, pid, int(was_picked), was_used),
            )

    return {"success": True, "run_id": run_id, "run_hash": run_hash}


def claim_runs(username: str, hashes: list[str]) -> dict:
    """Attach `username` to any run rows whose hash matches and whose
    current username is NULL/empty. Rows already claimed by any user
    (including the same one) are left untouched so this can't overwrite.

    Returns a summary: how many rows were updated, how many hashes
    matched a row but were skipped (already claimed), and how many
    hashes didn't match any row at all.
    """
    if not hashes:
        return {"claimed": 0, "already_claimed": 0, "unknown": 0}

    with get_conn() as conn:
        placeholders = ",".join("?" for _ in hashes)
        existing = conn.execute(
            f"SELECT run_hash, username FROM runs WHERE run_hash IN ({placeholders})",
            hashes,
        ).fetchall()
        by_hash = {r["run_hash"]: r["username"] for r in existing}

        unclaimed = [h for h, u in by_hash.items() if not u]
        already_claimed = len(by_hash) - len(unclaimed)
        unknown = len(hashes) - len(by_hash)

        if unclaimed:
            unclaimed_placeholders = ",".join("?" for _ in unclaimed)
            conn.execute(
                f"UPDATE runs SET username = ? "
                f"WHERE run_hash IN ({unclaimed_placeholders}) "
                f"AND (username IS NULL OR username = '')",
                [username, *unclaimed],
            )

    return {
        "claimed": len(unclaimed),
        "already_claimed": already_claimed,
        "unknown": unknown,
    }


def get_stats(
    character: str | None = None,
    win: str | None = None,
    ascension: str | None = None,
    game_mode: str | None = None,
    players: str | None = None,
    username: str | None = None,
) -> dict:
    """Compute aggregate community stats with optional filters.

    `username` narrows the aggregation to a single uploader — the
    Spire Compendium desktop app uses this for its per-user Stats
    tab (top cards / relics / potions by the player's own runs).
    Exact match on the sanitized username the run was submitted with.
    """
    with get_conn() as conn:
        # Build WHERE clause. Track non-character conditions separately so the
        # per-character breakdown (`char_stats`) can drop the character filter
        # while still respecting everything else (username, win, ascension,
        # game_mode, players). Without this, /api/runs/stats?username=peter
        # returns the global per-character breakdown — every uploader's runs.
        non_char_conditions: list[str] = []
        non_char_params: list = []
        if win == "true":
            non_char_conditions.append("r.win = 1")
        elif win == "false":
            non_char_conditions.append("r.win = 0 AND r.was_abandoned = 0")
        elif win == "abandoned":
            non_char_conditions.append("r.was_abandoned = 1")
        if ascension is not None and ascension != "":
            non_char_conditions.append("r.ascension = ?")
            non_char_params.append(int(ascension))
        if game_mode:
            non_char_conditions.append("r.game_mode = ?")
            non_char_params.append(game_mode)
        if players == "single":
            non_char_conditions.append("r.player_count = 1")
        elif players == "multi":
            non_char_conditions.append("r.player_count > 1")
        if username:
            non_char_conditions.append("r.username = ?")
            non_char_params.append(username)

        conditions: list[str] = list(non_char_conditions)
        params: list = list(non_char_params)
        if character:
            conditions.insert(0, "r.character = ?")
            params.insert(0, character.upper())
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        where_no_char = (
            "WHERE " + " AND ".join(non_char_conditions) if non_char_conditions else ""
        )

        total = conn.execute(
            f"SELECT COUNT(*) as c FROM runs r {where}", params
        ).fetchone()["c"]
        if total == 0:
            return {
                "total_runs": 0,
                "filters": {
                    "character": character,
                    "win": win,
                    "ascension": ascension,
                    "game_mode": game_mode,
                    "players": players,
                    "username": username,
                },
            }

        win_where = where + (" AND " if where else "WHERE ") + "r.win = 1"
        wins = conn.execute(
            f"SELECT COUNT(*) as c FROM runs r {win_where}", params
        ).fetchone()["c"]
        abandoned_where = (
            where + (" AND " if where else "WHERE ") + "r.was_abandoned = 1"
        )
        abandoned = conn.execute(
            f"SELECT COUNT(*) as c FROM runs r {abandoned_where}", params
        ).fetchone()["c"]

        # Win rate by character. Always unfiltered by character (the breakdown
        # has one row per character) but respects all other filters — most
        # importantly `username`, so the per-user Stats tab in the desktop app
        # gets that user's runs, not the global pool.
        char_stats = conn.execute(
            f"""
            SELECT r.character, COUNT(*) as total, SUM(r.win) as wins
            FROM runs r {where_no_char}
            GROUP BY r.character ORDER BY total DESC
        """,
            non_char_params,
        ).fetchall()

        # Card pick rates — ALL cards, not just top N
        pick_rates = conn.execute(
            f"""
            SELECT cc.card_id,
                   COUNT(*) as offered,
                   SUM(cc.was_picked) as picked,
                   ROUND(100.0 * SUM(cc.was_picked) / COUNT(*), 1) as pick_rate
            FROM run_card_choices cc
            JOIN runs r ON cc.run_id = r.id
            {where}
            GROUP BY cc.card_id
            ORDER BY pick_rate DESC
        """,
            params,
        ).fetchall()

        # Cards in winning decks (filtered)
        win_params = list(params)
        win_where = where + (" AND " if where else "WHERE ") + "r.win = 1"
        win_cards = conn.execute(
            f"""
            SELECT rc.card_id, COUNT(*) as count
            FROM run_cards rc JOIN runs r ON rc.run_id = r.id
            {win_where}
            GROUP BY rc.card_id ORDER BY count DESC
        """,
            win_params,
        ).fetchall()

        # Cards in losing decks (filtered)
        loss_where = where + (" AND " if where else "WHERE ") + "r.win = 0"
        loss_cards = conn.execute(
            f"""
            SELECT rc.card_id, COUNT(*) as count
            FROM run_cards rc JOIN runs r ON rc.run_id = r.id
            {loss_where}
            GROUP BY rc.card_id ORDER BY count DESC
        """,
            params,
        ).fetchall()

        # All cards in decks (filtered)
        all_cards = conn.execute(
            f"""
            SELECT rc.card_id, COUNT(*) as count
            FROM run_cards rc JOIN runs r ON rc.run_id = r.id
            {where}
            GROUP BY rc.card_id ORDER BY count DESC
        """,
            params,
        ).fetchall()

        # Relic stats (filtered) — all relics, not just top 20
        top_relics = conn.execute(
            f"""
            SELECT rr.relic_id,
                   COUNT(*) as count,
                   COUNT(DISTINCT rr.run_id) as total_runs_with,
                   COUNT(DISTINCT CASE WHEN r.win = 1 THEN rr.run_id END) as win_runs
            FROM run_relics rr JOIN runs r ON rr.run_id = r.id
            {where}
            GROUP BY rr.relic_id ORDER BY count DESC
        """,
            params,
        ).fetchall()

        # Most deadly encounters (filtered, losses only)
        death_where = (
            where
            + (" AND " if where else "WHERE ")
            + "r.win = 0 AND r.killed_by IS NOT NULL"
        )
        deaths = conn.execute(
            f"""
            SELECT r.killed_by, COUNT(*) as count
            FROM runs r
            {death_where}
            GROUP BY r.killed_by ORDER BY count DESC LIMIT 10
        """,
            params,
        ).fetchall()

        # Ascension distribution (filtered)
        asc_stats = conn.execute(
            f"""
            SELECT r.ascension, COUNT(*) as total, SUM(r.win) as wins
            FROM runs r {where} GROUP BY r.ascension ORDER BY r.ascension
        """,
            params,
        ).fetchall()

        # Win runs per card (distinct runs, not copies)
        win_runs_query = conn.execute(
            f"""
            SELECT rc.card_id, COUNT(DISTINCT rc.run_id) as run_count
            FROM run_cards rc JOIN runs r ON rc.run_id = r.id
            {win_where}
            GROUP BY rc.card_id
        """,
            win_params,
        ).fetchall()
        win_runs_map = {r["card_id"]: r["run_count"] for r in win_runs_query}

        # Total runs per card (distinct)
        all_runs_query = conn.execute(
            f"""
            SELECT rc.card_id, COUNT(DISTINCT rc.run_id) as run_count
            FROM run_cards rc JOIN runs r ON rc.run_id = r.id
            {where}
            GROUP BY rc.card_id
        """,
            params,
        ).fetchall()
        all_runs_map = {r["card_id"]: r["run_count"] for r in all_runs_query}

        win_card_map = {r["card_id"]: r["count"] for r in win_cards}
        loss_card_map = {r["card_id"]: r["count"] for r in loss_cards}

        # Potion stats (filtered)
        try:
            potion_stats = conn.execute(
                f"""
                SELECT rp.potion_id,
                       SUM(rp.was_picked) as picked,
                       COUNT(*) as offered,
                       SUM(rp.was_used) as used,
                       COUNT(DISTINCT rp.run_id) as total_runs_with,
                       COUNT(DISTINCT CASE WHEN r.win = 1 THEN rp.run_id END) as win_runs
                FROM run_potions rp JOIN runs r ON rp.run_id = r.id
                {where}
                GROUP BY rp.potion_id ORDER BY offered DESC
            """,
                params,
            ).fetchall()
        except Exception:
            potion_stats = []

        return {
            "total_runs": total,
            "total_wins": wins,
            "total_abandoned": abandoned,
            "win_rate": round(wins / total * 100, 1) if total > 0 else 0,
            "filters": {
                "character": character,
                "win": win,
                "ascension": ascension,
                "game_mode": game_mode,
                "players": players,
                "username": username,
            },
            "characters": [
                {
                    "character": r["character"],
                    "total": r["total"],
                    "wins": r["wins"],
                    "win_rate": round(r["wins"] / r["total"] * 100, 1)
                    if r["total"] > 0
                    else 0,
                }
                for r in char_stats
            ],
            "ascensions": [
                {
                    "level": r["ascension"],
                    "total": r["total"],
                    "wins": r["wins"],
                    "win_rate": round(r["wins"] / r["total"] * 100, 1)
                    if r["total"] > 0
                    else 0,
                }
                for r in asc_stats
            ],
            "top_cards": [
                {
                    "card_id": r["card_id"],
                    "count": r["count"],
                    "in_wins": win_card_map.get(r["card_id"], 0),
                    "in_losses": loss_card_map.get(r["card_id"], 0),
                    "win_runs": win_runs_map.get(r["card_id"], 0),
                    "total_runs_with": all_runs_map.get(r["card_id"], 0),
                }
                for r in all_cards
            ],
            "pick_rates": [
                {
                    "card_id": r["card_id"],
                    "offered": r["offered"],
                    "picked": r["picked"],
                    "pick_rate": r["pick_rate"],
                }
                for r in pick_rates
            ],
            "top_relics": [
                {
                    "relic_id": r["relic_id"],
                    "count": r["count"],
                    "total_runs_with": r["total_runs_with"],
                    "win_runs": r["win_runs"],
                }
                for r in top_relics
            ],
            "top_potions": [
                {
                    "potion_id": r["potion_id"],
                    "offered": r["offered"],
                    "picked": r["picked"],
                    "used": r["used"],
                    "total_runs_with": r["total_runs_with"],
                    "win_runs": r["win_runs"],
                    "pick_rate": round(r["picked"] / r["offered"] * 100, 1)
                    if r["offered"] > 0
                    else 0,
                }
                for r in potion_stats
            ],
            "deadliest": [
                {"encounter": r["killed_by"], "count": r["count"]} for r in deaths
            ],
        }


# Initialize on import
init_db()
