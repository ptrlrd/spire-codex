"""From v0.113.0 the game has no Custom mode: a custom run keeps its real
game_mode and says is_custom_game, so custom is a flag on the run rather
than a mode of its own. A custom Blitz run is both."""

from types import SimpleNamespace

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


def _matches(doc, query):
    for key, want in query.items():
        have = doc.get(key)
        if isinstance(want, dict):
            if "$ne" in want and have == want["$ne"]:
                return False
            if "$in" in want and have not in want["$in"]:
                return False
            if "$gt" in want and not (have is not None and have > want["$gt"]):
                return False
        elif have != want:
            return False
    return True


class FakeCursor(list):
    def sort(self, key, direction):
        return FakeCursor(sorted(self, key=lambda d: d[key], reverse=direction < 0))

    def limit(self, n):
        return FakeCursor(self[:n])


class FakeColl:
    def __init__(self, docs):
        self.docs = {d["_id"]: d for d in docs}
        self.finds = 0

    def find(self, query, projection=None):
        self.finds += 1
        return FakeCursor(dict(d) for d in self.docs.values() if _matches(d, query))

    def update_many(self, query, update):
        hit = [d for d in self.docs.values() if _matches(d, query)]
        for d in hit:
            d.update(update["$set"])
        return SimpleNamespace(modified_count=len(hit))


def test_backfill_reads_the_flag_from_run_blobs(monkeypatch):
    # Run docs don't carry the save; v0.113+ custom runs look standard there.
    runs = FakeColl(
        [
            {"_id": "c1", "game_mode": "standard"},
            {"_id": "c2", "game_mode": "blitz"},
            {"_id": "c3", "game_mode": "standard", "is_custom": True},
            {"_id": "legacy", "game_mode": "custom"},
            {"_id": "plain", "game_mode": "standard"},
            {"_id": "stringy", "game_mode": "standard"},
        ]
    )
    blobs = FakeColl(
        [
            {"_id": "c1", "blob": {"is_custom_game": True}},
            {"_id": "c2", "blob": {"is_custom_game": True}},
            {"_id": "c3", "blob": {"is_custom_game": True}},
            {"_id": "legacy", "blob": {"game_mode": "custom"}},
            {"_id": "plain", "blob": {"is_custom_game": False}},
            {"_id": "stringy", "blob": {"is_custom_game": "true"}},
            {"_id": "orphan", "blob": {"is_custom_game": True}},
            {"_id": "empty"},
        ]
    )
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: runs)
    monkeypatch.setattr(runs_db_mongo, "_blob_collection", lambda: blobs)

    assert runs_db_mongo.backfill_is_custom(batch=3) == 3
    flagged = {h for h, d in runs.docs.items() if d.get("is_custom")}
    assert flagged == {"c1", "c2", "c3", "legacy"}
    # Walked in batches of 3 over 8 blobs: 3 full pages and one empty.
    assert blobs.finds == 4
    # The mode is left as the save gave it.
    assert runs.docs["c2"]["game_mode"] == "blitz"

    assert runs_db_mongo.backfill_is_custom(batch=3) == 0
