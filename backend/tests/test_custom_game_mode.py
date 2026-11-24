"""From v0.113.0 the game has no Custom mode: a custom run keeps its real
game_mode and says is_custom_game, so custom is a flag on the run rather
than a mode of its own. A custom Blitz run is both."""

import pytest

from app.services import runs_db, runs_db_mongo
from app.services.game_modes import is_custom_run


@pytest.mark.parametrize(
    "data, custom",
    [
        ({"game_mode": "standard", "is_custom_game": True}, True),
        ({"game_mode": "blitz", "is_custom_game": True}, True),
        ({"is_custom_game": True}, True),
        ({"game_mode": "custom"}, True),
        ({"game_mode": "Custom"}, True),
        ({"game_mode": "standard", "is_custom_game": False}, False),
        ({"game_mode": "blitz"}, False),
        ({"game_mode": "standard"}, False),
        ({}, False),
        ({"game_mode": "standard", "is_custom_game": "true"}, False),
    ],
)
def test_is_custom_run(data, custom):
    assert is_custom_run(data) is custom


def _run_file(**extra):
    return {
        "seed": "SEED",
        "build_id": "v0.113.1",
        "ascension": 3,
        "win": False,
        "acts": [],
        "players": [
            {"id": 1, "character": "CHARACTER.IRONCLAD", "deck": [], "relics": []}
        ],
        "map_point_history": [[{"player_stats": []}]],
        **extra,
    }


def test_sqlite_ingest_keeps_the_mode_and_flags_custom(tmp_path, monkeypatch):
    monkeypatch.setattr(runs_db, "DB_PATH", tmp_path / "runs.db")
    monkeypatch.setattr(runs_db, "get_db_path", lambda: tmp_path / "runs.db")
    runs_db.init_db()
    runs_db.submit_run(_run_file(game_mode="blitz", is_custom_game=True, seed="A"))
    runs_db.submit_run(_run_file(game_mode="standard", is_custom_game=False, seed="B"))
    with runs_db.get_conn() as conn:
        rows = conn.execute(
            "SELECT seed, game_mode, is_custom FROM runs ORDER BY seed"
        ).fetchall()
    assert [tuple(r) for r in rows] == [("A", "blitz", 1), ("B", "standard", 0)]


def test_backfill_stamps_only_custom_runs(monkeypatch):
    calls = []

    class FakeColl:
        def update_many(self, flt, update):
            calls.append((flt, update))
            return type("R", (), {"modified_count": 3})()

    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: FakeColl())

    assert runs_db_mongo.backfill_is_custom() == 3
    ((flt, update),) = calls
    assert flt == {
        "$or": [{"raw.is_custom_game": True}, {"game_mode": "custom"}],
        "is_custom": {"$ne": True},
    }
    assert update == {"$set": {"is_custom": True}}
