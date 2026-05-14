"""SQLite database for community run data."""

import json
import hashlib
import sqlite3
from pathlib import Path
from contextlib import contextmanager

import os

# Use DATA_DIR env var (Docker) or fall back to project data/
_data_dir = Path(
    os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data")
)
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

            CREATE TABLE IF NOT EXISTS run_potions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id INTEGER NOT NULL REFERENCES runs(id),
                potion_id TEXT NOT NULL,
                was_picked INTEGER NOT NULL,
                was_used INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_run_potions_potion ON run_potions(potion_id);
            CREATE INDEX IF NOT EXISTS idx_run_potions_run ON run_potions(run_id);

            -- Per-encounter rows for "win rate vs monster X" / "deadliest
            -- encounter" / "damage taken vs Y" queries. Populated at
            -- submit_run() time from map_point_history.rooms[]. Backfill
            -- script: tools/backfill_run_encounters.py for runs landed
            -- before this table existed.
            CREATE TABLE IF NOT EXISTS run_encounters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id INTEGER NOT NULL REFERENCES runs(id),
                encounter_id TEXT NOT NULL,
                act_id TEXT,
                room_type TEXT,
                floor INTEGER,
                damage_taken INTEGER NOT NULL DEFAULT 0,
                turns_taken INTEGER NOT NULL DEFAULT 0,
                won_fight INTEGER NOT NULL DEFAULT 1
            );

            -- monster_ids is a list per encounter (encounters can host
            -- multiple monsters). Normalized into its own table so
            -- "win rate vs MONSTER" doesn't need json_each() and stays
            -- indexable. PRIMARY KEY collapses duplicate refs within
            -- the same encounter row to a single entry.
            CREATE TABLE IF NOT EXISTS run_encounter_monsters (
                encounter_row_id INTEGER NOT NULL REFERENCES run_encounters(id),
                monster_id TEXT NOT NULL,
                PRIMARY KEY (encounter_row_id, monster_id)
            );

            CREATE INDEX IF NOT EXISTS idx_run_encounters_encounter ON run_encounters(encounter_id);
            CREATE INDEX IF NOT EXISTS idx_run_encounters_run ON run_encounters(run_id);
            CREATE INDEX IF NOT EXISTS idx_run_encounter_monsters_monster
                ON run_encounter_monsters(monster_id);
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


def extract_run_encounters(
    data: dict,
    player_id: int,
    is_win: bool,
    is_abandoned: bool,
) -> list[dict]:
    """Walk map_point_history and yield per-encounter rows.

    Each combat room becomes one row: (encounter_id, monster_ids,
    act_id, room_type, floor, damage_taken, turns_taken, won_fight).

    Won-fight heuristic: every combat encounter is a win except the
    *last* combat room of a non-win, non-abandoned run whose encounter
    id matches `killed_by_encounter`. Abandoned runs leave the final
    encounter as won_fight=1 since the player quit out rather than
    losing the fight.

    Exported so tools/backfill_run_encounters.py can replay archived
    run JSONs through the same logic without going through submit_run.
    """
    acts = data.get("acts", [])
    map_history = data.get("map_point_history", [])
    killed_by = clean_id(data.get("killed_by_encounter", "")) or None

    # Pass 1: collect every combat room scoped to this player.
    combat_rooms: list[tuple[int, int, dict, dict]] = []
    for act_idx, act_floors in enumerate(map_history):
        for floor_idx, floor in enumerate(act_floors):
            for ps in floor.get("player_stats", []):
                if ps.get("player_id") and ps["player_id"] != player_id:
                    continue
                for room in floor.get("rooms", []):
                    if room.get("room_type") in {"monster", "elite", "boss"}:
                        combat_rooms.append((act_idx, floor_idx, room, ps))

    if not combat_rooms:
        return []

    encounters: list[dict] = []
    last_idx = len(combat_rooms) - 1
    for i, (act_idx, floor_idx, room, ps) in enumerate(combat_rooms):
        encounter_id = clean_id(room.get("model_id", "")) or ""
        if not encounter_id:
            continue
        monster_ids = sorted({clean_id(m) for m in room.get("monster_ids", []) if m})
        act_raw = acts[act_idx] if act_idx < len(acts) else None
        won = 1
        if (
            i == last_idx
            and not is_win
            and not is_abandoned
            and killed_by
            and encounter_id == killed_by
        ):
            won = 0
        encounters.append(
            {
                "encounter_id": encounter_id,
                "monster_ids": monster_ids,
                "act_id": clean_id(act_raw) if act_raw else None,
                "room_type": room.get("room_type"),
                "floor": floor_idx + 1,
                "damage_taken": int(ps.get("damage_taken", 0) or 0),
                "turns_taken": int(room.get("turns_taken", 0) or 0),
                "won_fight": won,
            }
        )
    return encounters


def _insert_run_encounters(conn, run_id: int, encounters: list[dict]) -> None:
    """Write parsed encounter rows + their monster join entries."""
    for enc in encounters:
        cursor = conn.execute(
            """INSERT INTO run_encounters
               (run_id, encounter_id, act_id, room_type, floor,
                damage_taken, turns_taken, won_fight)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                run_id,
                enc["encounter_id"],
                enc["act_id"],
                enc["room_type"],
                enc["floor"],
                enc["damage_taken"],
                enc["turns_taken"],
                enc["won_fight"],
            ),
        )
        enc_row_id = cursor.lastrowid
        for monster_id in enc["monster_ids"]:
            conn.execute(
                """INSERT OR IGNORE INTO run_encounter_monsters
                   (encounter_row_id, monster_id) VALUES (?, ?)""",
                (enc_row_id, monster_id),
            )


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

        # Per-encounter rows for /api/runs/monster-stats and the
        # forthcoming Stats tab on /monsters/[id]. Failures here must
        # not roll back the run row — the encounters table is a
        # downstream analytics surface, not a primary record. Backfill
        # script picks up anything that fails to parse here.
        try:
            encounters = extract_run_encounters(
                data,
                player_id=player_id,
                is_win=bool(data.get("win", False)),
                is_abandoned=bool(was_abandoned),
            )
            _insert_run_encounters(conn, run_id, encounters)
        except Exception:
            pass

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
