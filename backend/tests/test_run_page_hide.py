"""Hiding a run from its own page must not depend on the edge login that
guards /api/admin: the site's own admin check gates it, and anyone else sees
a 404 rather than a hint that the route exists."""

from fastapi.testclient import TestClient

from app.main import app
from app.routers import runs as runs_router
from app.services import auth_jwt, runs_db_mongo

client = TestClient(app, raise_server_exceptions=False)

ADMIN = {"_id": "admin1", "steam_id": "7656119", "username": "yitsy"}
PLAYER = {"_id": "u2", "steam_id": "111", "username": "someone"}


def _env(monkeypatch, user):
    monkeypatch.setenv("MONGO_URL", "mongodb://test")
    monkeypatch.setattr(auth_jwt, "get_current_user", lambda request: user)
    monkeypatch.setattr(auth_jwt, "_admin_ids", lambda: {"7656119"})
    calls = []
    monkeypatch.setattr(
        runs_db_mongo,
        "set_run_hidden",
        lambda h, hidden, reason=None: calls.append((h, hidden)) or {"changed": 1},
    )
    monkeypatch.setattr(runs_router, "_load_run_blob_cached", _FakeCache())
    from app.dependencies import shared_limiter

    monkeypatch.setattr(shared_limiter, "enabled", False)
    return calls


class _FakeCache:
    cleared = 0

    def cache_clear(self):
        self.cleared += 1


def test_admin_can_unhide_from_the_run_page(monkeypatch):
    calls = _env(monkeypatch, ADMIN)
    r = client.post("/api/runs/abc123/hidden", json={"hidden": False})
    assert r.status_code == 200, r.text
    assert r.json() == {"run_hash": "abc123", "hidden": False, "changed": 1}
    assert calls == [("abc123", False)]


def test_hidden_defaults_to_true(monkeypatch):
    calls = _env(monkeypatch, ADMIN)
    assert client.post("/api/runs/abc123/hidden").status_code == 200
    assert calls == [("abc123", True)]


def _owner_env(monkeypatch, result):
    calls = _env(monkeypatch, PLAYER)
    owner_calls = []
    monkeypatch.setattr(
        runs_db_mongo,
        "set_run_hidden_by_owner",
        lambda h, user, hidden: owner_calls.append((h, user["_id"], hidden)) or result,
    )
    return calls, owner_calls


def test_owner_hides_and_unhides_their_own_run(monkeypatch):
    admin_calls, owner_calls = _owner_env(
        monkeypatch, {"success": True, "hidden": True}
    )
    r = client.post("/api/runs/abc123/hidden", json={"hidden": True})
    assert r.status_code == 200, r.text
    assert r.json()["hidden"] is True
    assert owner_calls == [("abc123", "u2", True)]
    assert admin_calls == []


def test_owner_cannot_touch_a_moderator_hidden_run(monkeypatch):
    _owner_env(monkeypatch, {"error": "This run was hidden by a moderator"})
    r = client.post("/api/runs/abc123/hidden", json={"hidden": False})
    assert r.status_code == 409


def test_someone_else_gets_a_403(monkeypatch):
    _owner_env(monkeypatch, {"error": "You do not own this run"})
    assert client.post("/api/runs/abc123/hidden").status_code == 403


def test_anonymous_gets_a_401(monkeypatch):
    calls = _env(monkeypatch, None)
    assert (
        client.post("/api/runs/abc123/hidden", json={"hidden": False}).status_code
        == 401
    )
    assert calls == []
