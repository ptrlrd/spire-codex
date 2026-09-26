"""Review cases for the nightly Elo board: None ladders and zero-run
characters, None Elo sorting last, the kept slice honouring the run gate,
non-ASCII usernames round-tripping, and no public caching while the lake
file is missing."""

import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "lab"))

import player_elo_board  # noqa: E402

from app.dependencies import shared_limiter  # noqa: E402
from app.main import app  # noqa: E402
from app.routers import leaderboards  # noqa: E402
from tests.test_player_elo_board import _rec, served  # noqa: E402, F401

client = TestClient(app)


def test_public_row_handles_none_character_values_and_zero_character_runs():
    rec = {
        "username": "ZeroPlayer",
        "runs": 0,
        "wins": 0,
        "elo": 1200,
        "by_character": {
            "defect": None,
            "ironclad": {"runs": 0, "wins": 0, "elo": 1200},
        },
    }
    row = player_elo_board.public_row(rec)
    assert row is not None
    assert row["main_character"] is None
    assert row["by_character"] == {"ironclad": {"elo": 1200, "runs": 0, "wins": 0}}


def test_build_board_sorts_none_elo_below_negative_elo():
    records = [
        {"username": "Negative", "elo": -50, "lifetime": -100, "runs": 10, "wins": 1},
        {"username": "Unrated", "elo": None, "lifetime": None, "runs": 10, "wins": 0},
        {"username": "Zero", "elo": 0, "lifetime": 0, "runs": 10, "wins": 0},
    ]
    board = player_elo_board.build_board(records)
    usernames = [p["username"] for p in board["players"]]
    assert usernames == ["Zero", "Negative", "Unrated"]


def test_kept_slice_only_holds_accounts_the_board_can_serve():
    records = [
        {
            "username": f"Fresh{i}",
            "elo": 1500 - i,
            "lifetime": 1000,
            "runs": 2,
            "wins": 2,
        }
        for i in range(5)
    ] + [{"username": "Vet", "elo": 1100, "lifetime": 1050, "runs": 40, "wins": 20}]
    board = player_elo_board.build_board(records, keep=3)
    assert [p["username"] for p in board["players"]] == ["Vet"]


def test_utf8_usernames_preserved_in_read_and_write(tmp_path, monkeypatch):
    monkeypatch.setattr(leaderboards, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(leaderboards, "_cache", None)
    monkeypatch.setattr(shared_limiter, "enabled", False)

    board = player_elo_board.build_board(
        [
            {
                "username": "🗡️ 勇者 néo",
                "elo": 1500,
                "lifetime": 1400,
                "runs": 20,
                "wins": 15,
                "by_character": {"ironclad": {"runs": 20, "wins": 15, "elo": 1500}},
            }
        ]
    )
    path = tmp_path / "player_elo.json"
    path.write_text(json.dumps(board), encoding="utf-8")

    res = client.get("/api/leaderboards/elo")
    assert res.status_code == 200
    assert res.json()["players"][0]["username"] == "🗡️ 勇者 néo"


def test_missing_lake_file_does_not_set_public_cache_control(tmp_path, monkeypatch):
    monkeypatch.setattr(leaderboards, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(leaderboards, "_cache", None)
    monkeypatch.setattr(shared_limiter, "enabled", False)

    res = client.get("/api/leaderboards/elo")
    assert res.status_code == 200
    assert "public, max-age=300" not in res.headers.get("Cache-Control", "")


def test_endpoint_finds_eligible_players_beyond_artifact_cutoff(tmp_path, monkeypatch):
    monkeypatch.setattr(shared_limiter, "enabled", False)
    monkeypatch.setattr(leaderboards, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(leaderboards, "_cache", None)

    provisional = [
        _rec(f"Provisional{i:03}", 2000 - i, 9, 9) for i in range(player_elo_board.KEEP)
    ]
    eligible = [_rec(f"Eligible{i:03}", 1000 - i, 10, 5) for i in range(100)]
    board = player_elo_board.build_board(provisional + eligible)
    (tmp_path / "player_elo.json").write_text(json.dumps(board))

    response = client.get("/api/leaderboards/elo")
    assert response.status_code == 200
    assert [p["username"] for p in response.json()["players"]] == [
        f"Eligible{i:03}" for i in range(100)
    ]


def test_endpoint_reloads_atomic_replacement_with_same_mtime(served):
    import os

    path = served / "player_elo.json"
    assert client.get("/api/leaderboards/elo").json()["players"][0]["username"] == "Vet"
    previous = path.stat()

    replacement = served / "replacement.json"
    replacement.write_text(
        json.dumps(player_elo_board.build_board([_rec("New", 1600, 50, 40)]))
    )
    os.utime(
        replacement,
        ns=(previous.st_atime_ns, previous.st_mtime_ns),
    )
    replacement.replace(path)

    assert client.get("/api/leaderboards/elo").json()["players"][0]["username"] == "New"
