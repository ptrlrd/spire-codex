"""Bulk hide touches only the caller's own runs and reports the rest."""

import pytest
from fastapi.testclient import TestClient

from app import main as m
from app.routers import auth as auth_router
from app.routers import runs as runs_router

client = TestClient(m.app, raise_server_exceptions=False)
URL = "/api/auth/runs/bulk-hide"


class _FakeCache:
    cleared = 0

    def cache_clear(self):
        self.cleared += 1


@pytest.fixture
def signed_in(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://test")
    monkeypatch.setattr(
        auth_router, "require_user", lambda request: {"_id": "user-1", "steam_id": "1"}
    )
    monkeypatch.setattr(runs_router, "_load_run_blob_cached", _FakeCache())
    calls: list[tuple[str, str, bool]] = []

    def fake_hide(run_hash: str, user: dict, hidden: bool) -> dict:
        calls.append((run_hash, user["_id"], hidden))
        if run_hash == "not-mine":
            return {"error": "You do not own this run"}
        if run_hash == "flagged":
            return {"error": "This run was hidden by a moderator"}
        return {"success": True, "hidden": hidden}

    monkeypatch.setattr(
        "app.services.runs_db_mongo.set_run_hidden_by_owner", fake_hide, raising=False
    )
    return calls


def test_hides_each_owned_run(signed_in):
    r = client.post(URL, json={"run_hashes": ["a", "b"]})
    assert r.status_code == 200
    assert r.json() == {
        "updated": ["a", "b"],
        "failed": {},
        "requested": 2,
        "hidden": True,
    }
    assert signed_in == [("a", "user-1", True), ("b", "user-1", True)]


def test_unhide_passes_hidden_false_through(signed_in):
    r = client.post(URL, json={"run_hashes": ["a"], "hidden": False})
    assert r.status_code == 200
    assert r.json()["hidden"] is False
    assert signed_in == [("a", "user-1", False)]


def test_moderator_hidden_and_foreign_runs_are_reported(signed_in):
    r = client.post(URL, json={"run_hashes": ["a", "not-mine", "flagged"]})
    assert r.status_code == 200
    body = r.json()
    assert body["updated"] == ["a"]
    assert body["failed"] == {
        "not-mine": "You do not own this run",
        "flagged": "This run was hidden by a moderator",
    }


def test_empty_and_oversized_batches_are_rejected(signed_in):
    assert client.post(URL, json={"run_hashes": []}).status_code == 422
    assert client.post(URL, json={"run_hashes": ["x"] * 51}).status_code == 422
    assert signed_in == []
