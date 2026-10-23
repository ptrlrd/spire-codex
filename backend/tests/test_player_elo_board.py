"""The nightly Elo board keeps only named accounts, ranks by Elo with
lifetime as the tiebreak, and the public endpoint serves the lake file
with the min-runs gate and rank numbers, or an empty board when the file
is missing."""

import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "lab"))

import player_elo_board  # noqa: E402

from app.dependencies import shared_limiter  # noqa: E402
from app.main import app  # noqa: E402
from app.routers import leaderboards  # noqa: E402

client = TestClient(app)


def _rec(name, elo, runs, wins, lifetime=None, chars=None):
    return {
        "username": name,
        "user_id": "x",
        "elo": elo,
        "lifetime": lifetime if lifetime is not None else elo - 50,
        "runs": runs,
        "wins": wins,
        "by_character": chars or {"ironclad": {"elo": elo, "runs": runs, "wins": wins}},
    }


def test_build_board_drops_anonymous_and_ranks_by_elo_then_lifetime():
    records = [
        _rec("Low", 1050, 40, 20),
        _rec(None, 1500, 90, 80),
        _rec("Tie", 1200, 30, 20, lifetime=1100),
        _rec("TieBetter", 1200, 30, 20, lifetime=1150),
        _rec(
            "Multi",
            1300,
            60,
            40,
            chars={
                "silent": {"elo": 1290, "runs": 45, "wins": 30},
                "defect": {"elo": 1320, "runs": 15, "wins": 10},
            },
        ),
    ]
    board = player_elo_board.build_board(records, keep=3)
    names = [p["username"] for p in board["players"]]
    assert board["min_runs"] == 10
    assert names == ["Multi", "TieBetter", "Tie"]
    assert board["total_rated"] == 5
    assert board["total_named"] == 4
    multi = board["players"][0]
    assert multi["main_character"] == "SILENT"
    assert multi["win_rate"] == 66.7
    assert "user_id" not in multi
    assert board["computed_at"].endswith("Z")


def test_public_row_handles_empty_records():
    assert player_elo_board.public_row({"username": " "}) is None
    row = player_elo_board.public_row({"username": "Solo", "runs": 0, "wins": 0})
    assert row["win_rate"] == 0.0 and row["main_character"] is None


def test_build_writes_the_lake_file_atomically(tmp_path, monkeypatch):
    monkeypatch.setattr(player_elo_board, "LAKE", tmp_path)
    monkeypatch.setattr(
        "app.services.player_elo.compute_player_elos",
        lambda persist=True: [_rec("A", 1100, 12, 7)],
    )
    out = player_elo_board.build()
    saved = json.loads((tmp_path / "player_elo.json").read_text())
    assert saved["players"][0]["username"] == "A"
    assert out["build_seconds"] >= 0
    assert not (tmp_path / "player_elo.json.tmp").exists()


@pytest.fixture
def served(tmp_path, monkeypatch):
    monkeypatch.setattr(shared_limiter, "enabled", False)
    monkeypatch.setattr(leaderboards, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(leaderboards, "_cache", None)
    board = player_elo_board.build_board(
        [
            _rec("Vet", 1400, 80, 60),
            _rec("Fresh", 1450, 3, 3),
            _rec("Mid", 1300, 25, 12),
        ],
        min_runs=1,
    )
    (tmp_path / "player_elo.json").write_text(json.dumps(board))
    return tmp_path


def test_endpoint_ranks_and_gates_on_min_runs(served):
    body = client.get("/api/leaderboards/elo").json()
    assert [(p["rank"], p["username"]) for p in body["players"]] == [
        (1, "Vet"),
        (2, "Mid"),
    ]
    assert body["min_runs"] == 10
    assert body["total_rated"] == 3
    assert body["computed_at"]
    loose = client.get(
        "/api/leaderboards/elo", params={"min_runs": 1, "limit": 2}
    ).json()
    assert [p["username"] for p in loose["players"]] == ["Fresh", "Vet"]
    assert client.get("/api/leaderboards/elo", params={"limit": 500}).status_code == 422


def test_endpoint_reloads_when_the_file_changes(served):
    assert client.get("/api/leaderboards/elo").json()["players"][0]["username"] == "Vet"
    import os
    import time

    board = player_elo_board.build_board([_rec("New", 1600, 50, 40)])
    path = served / "player_elo.json"
    path.write_text(json.dumps(board))
    os.utime(path, (time.time() + 5, time.time() + 5))
    assert client.get("/api/leaderboards/elo").json()["players"][0]["username"] == "New"


def test_endpoint_is_empty_without_the_file(tmp_path, monkeypatch):
    monkeypatch.setattr(shared_limiter, "enabled", False)
    monkeypatch.setattr(leaderboards, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(leaderboards, "_cache", None)
    body = client.get("/api/leaderboards/elo").json()
    assert body == {
        "players": [],
        "total_rated": 0,
        "min_runs": 10,
        "computed_at": None,
    }
