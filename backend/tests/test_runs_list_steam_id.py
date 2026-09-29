import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import shared_limiter
from app.services import cache as app_cache
from app.services import runs_db_mongo
from app.services import users_db

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://test")
    monkeypatch.setattr(shared_limiter, "enabled", False)
    monkeypatch.setattr(app_cache, "get_json", lambda k: None)
    monkeypatch.setattr(app_cache, "set_json", lambda k, v, ttl_seconds: None)


def _fake_list(seen):
    def fake_list(**kw):
        seen.update(kw)
        return {"runs": [], "total": 0, "page": 1, "per_page": 50, "total_pages": 0}

    return fake_list


def test_steam_id_resolves_to_the_linked_username(env, monkeypatch):
    seen = {}
    monkeypatch.setattr(runs_db_mongo, "list_runs", _fake_list(seen))
    monkeypatch.setattr(
        users_db,
        "get_user_by_steam_id",
        lambda sid: (
            {"_id": "u1", "username": "Dobo"} if sid == "76561198036543687" else None
        ),
    )
    r = client.get("/api/runs/list", params={"steam_id": "76561198036543687"})
    assert r.status_code == 200
    assert seen["username"] == "dobo"


def test_unknown_steam_id_lists_nothing_not_everything(env, monkeypatch):
    seen = {}
    monkeypatch.setattr(runs_db_mongo, "list_runs", _fake_list(seen))
    monkeypatch.setattr(users_db, "get_user_by_steam_id", lambda sid: None)
    r = client.get("/api/runs/list", params={"steam_id": "76561198000000001"})
    assert r.status_code == 200
    assert r.json()["total"] == 0 and r.json()["runs"] == []
    assert seen == {}


def test_username_wins_over_steam_id(env, monkeypatch):
    seen = {}
    monkeypatch.setattr(runs_db_mongo, "list_runs", _fake_list(seen))
    monkeypatch.setattr(
        users_db, "get_user_by_steam_id", lambda sid: {"_id": "u1", "username": "Other"}
    )
    client.get(
        "/api/runs/list", params={"steam_id": "76561198036543687", "username": "Peter"}
    )
    assert seen["username"] == "peter"
