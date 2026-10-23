"""The player token groups a player's attributed runs without exposing who
they are, and gives anonymous runs nothing."""

from bson import ObjectId

from app.services import player_token as pt
from app.services.runs_db_mongo import _row_to_dict


def test_token_is_stable_per_account_and_not_reversible(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    uid = ObjectId()
    a = pt.player_token({"username": "Yitsy", "user_id": uid, "steam_id": "7656119"})
    b = pt.player_token(
        {"username": "yitsy-renamed", "user_id": uid, "steam_id": "7656119"}
    )
    other = pt.player_token({"username": "Someone", "user_id": ObjectId()})
    assert a == b
    assert a != other
    assert len(a) == 16 and str(uid) not in a and "7656119" not in a


def test_anonymous_and_unknown_runs_get_no_token(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    assert pt.player_token({"username": None, "user_id": ObjectId()}) is None
    assert pt.player_token({"username": "", "steam_id": "7656119"}) is None
    assert pt.player_token({"username": "Tagged only"}) is None
    assert pt.player_token(None) is None


def test_dedicated_secret_wins_and_no_secret_means_no_token(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    doc = {"username": "Yitsy", "user_id": "abc"}
    derived = pt.player_token(doc)
    monkeypatch.setenv("PLAYER_TOKEN_SECRET", "other")
    assert pt.player_token(doc) != derived
    monkeypatch.delenv("PLAYER_TOKEN_SECRET")
    monkeypatch.setenv("JWT_SECRET", "")
    assert pt.player_token(doc) is None


def test_list_rows_carry_the_token_and_never_the_ids(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    uid = ObjectId()
    row = _row_to_dict(
        {
            "_id": "h1",
            "username": "Yitsy",
            "user_id": uid,
            "steam_id": "7656119",
            "win": True,
        }
    )
    assert row["run_hash"] == "h1"
    assert row["player_token"] == pt.player_token({"username": "Yitsy", "user_id": uid})
    assert "user_id" not in row and "steam_id" not in row
    anon = _row_to_dict(
        {"_id": "h2", "username": None, "steam_id": "7656119", "win": False}
    )
    assert anon["player_token"] is None and "steam_id" not in anon
