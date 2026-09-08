"""Bulk delete removes only the caller's own runs and reports the rest."""

import os

import pytest
from fastapi.testclient import TestClient

from app import main as m
from app.routers import auth as auth_router

client = TestClient(m.app, raise_server_exceptions=False)
URL = "/api/auth/runs/bulk-delete"


@pytest.fixture
def signed_in(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://test")
    monkeypatch.setattr(auth_router, "require_user", lambda request: {"_id": "user-1"})
    calls: list[tuple[str, str]] = []

    def fake_delete(run_hash: str, user_id: str) -> dict:
        calls.append((run_hash, user_id))
        if run_hash == "not-mine":
            return {"error": "You do not own this run"}
        if run_hash == "missing":
            return {"error": "Run not found"}
        return {"success": True}

    monkeypatch.setattr(
        "app.services.runs_db_mongo.soft_delete_run", fake_delete, raising=False
    )
    return calls


def test_deletes_each_owned_run(signed_in):
    r = client.post(URL, json={"run_hashes": ["a", "b"]})
    assert r.status_code == 200
    assert r.json() == {"deleted": ["a", "b"], "failed": {}, "requested": 2}
    assert signed_in == [("a", "user-1"), ("b", "user-1")]


def test_one_bad_hash_does_not_sink_the_others(signed_in):
    r = client.post(URL, json={"run_hashes": ["a", "not-mine", "missing"]})
    assert r.status_code == 200
    body = r.json()
    assert body["deleted"] == ["a"]
    assert body["failed"] == {
        "not-mine": "You do not own this run",
        "missing": "Run not found",
    }


def test_duplicates_and_blanks_are_collapsed(signed_in):
    r = client.post(URL, json={"run_hashes": [" a ", "a", "", 7, None]})
    assert r.status_code == 200
    assert r.json()["deleted"] == ["a"]
    assert signed_in == [("a", "user-1")]


def test_rejects_a_missing_or_empty_list(signed_in):
    assert client.post(URL, json={}).status_code == 400
    assert client.post(URL, json={"run_hashes": "a"}).status_code == 400
    assert client.post(URL, json={"run_hashes": []}).status_code == 400
    assert signed_in == []


def test_caps_the_batch(signed_in):
    too_many = [f"h{i}" for i in range(auth_router.MAX_BULK_DELETE + 1)]
    r = client.post(URL, json={"run_hashes": too_many})
    assert r.status_code == 400
    assert str(auth_router.MAX_BULK_DELETE) in r.json()["detail"]
    assert signed_in == []


def test_needs_mongo(monkeypatch):
    monkeypatch.setattr(auth_router, "require_user", lambda request: {"_id": "user-1"})
    monkeypatch.setenv("MONGO_URL", "")
    assert client.post(URL, json={"run_hashes": ["a"]}).status_code == 404


def test_requires_a_signed_in_user(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://test")
    os.environ.pop("SPIRE_TEST_USER", None)
    assert client.post(URL, json={"run_hashes": ["a"]}).status_code in (401, 403)
