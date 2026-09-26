"""Public replay browser: /api/replays forces has_replay on the run list,
passes the run-browser filters through, tags rows with replay_url, and the
summary counts only visible replay-carrying runs. Also the has_replay filter
on the shared list query."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import shared_limiter
from app.services import cache as app_cache
from app.services import runs_db_mongo

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://test")
    monkeypatch.setattr(shared_limiter, "enabled", False)
    monkeypatch.setattr(app_cache, "get_json", lambda k: None)
    monkeypatch.setattr(app_cache, "set_json", lambda k, v, ttl_seconds: None)


def test_browse_forces_has_replay_and_adds_replay_url(env, monkeypatch):
    seen = {}

    def fake_list(**kw):
        seen.update(kw)
        return {
            "runs": [{"run_hash": "abc", "character": "SILENT"}, {"character": "x"}],
            "total": 1,
            "page": kw["page"],
            "per_page": kw["limit"],
            "total_pages": 1,
        }

    monkeypatch.setattr(runs_db_mongo, "list_runs", fake_list)
    r = client.get(
        "/api/replays",
        params={
            "character": "silent",
            "username": " Reviver ",
            "win": "true",
            "page": 2,
        },
    )
    assert r.status_code == 200
    assert seen["has_replay"] is True
    assert seen["character"] == "SILENT"
    assert seen["username"] == "reviver"
    assert seen["win"] == "true"
    assert seen["page"] == 2
    body = r.json()
    assert body["runs"][0]["replay_url"] == "/runs/abc/replay"
    assert "replay_url" not in body["runs"][1]
    assert r.headers["cache-control"].startswith("public, max-age=30")


def test_browse_without_mongo_is_empty(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "")
    monkeypatch.setattr(shared_limiter, "enabled", False)
    body = client.get("/api/replays").json()
    assert body == {"runs": [], "total": 0, "page": 1, "per_page": 50, "total_pages": 0}


class FakeColl:
    def __init__(self, docs):
        self.docs = docs
        self.queries = []

    def _ok(self, d, q):
        for k, v in q.items():
            if isinstance(v, dict) and "$ne" in v:
                if d.get(k) == v["$ne"]:
                    return False
            elif d.get(k) != v:
                return False
        return True

    def count_documents(self, q, limit=None):
        self.queries.append(q)
        return sum(1 for d in self.docs if self._ok(d, q))


def test_summary_counts_visible_replay_runs(env, monkeypatch):
    coll = FakeColl(
        [
            {"has_replay": True, "character": "IRONCLAD"},
            {"has_replay": True, "character": "IRONCLAD", "hidden": True},
            {"has_replay": True, "character": "REGENT"},
            {"character": "REGENT"},
        ]
    )
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    body = client.get("/api/replays/summary").json()
    assert body["total"] == 2
    assert body["by_character"]["IRONCLAD"] == 1
    assert body["by_character"]["REGENT"] == 1
    assert body["by_character"]["DEFECT"] == 0


class RecordingColl:
    def __init__(self):
        self.query = None

    def count_documents(self, q, limit=None):
        return 0

    def estimated_document_count(self):
        return 0

    def find(self, q, proj=None):
        self.query = q
        return self

    def sort(self, spec):
        return self

    def skip(self, n):
        return self

    def limit(self, n):
        return self

    def __iter__(self):
        return iter([])


def test_list_runs_has_replay_filter(monkeypatch):
    coll = RecordingColl()
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    runs_db_mongo.list_runs(has_replay=True, character="defect")
    assert coll.query["has_replay"] is True
    assert coll.query["character"] == "DEFECT"
    assert coll.query["hidden"] == {"$ne": True}
    runs_db_mongo.list_runs(has_replay=None)
    assert "has_replay" not in coll.query
    runs_db_mongo.list_runs(has_replay=False)
    assert coll.query["has_replay"] == {"$ne": True}


def test_runs_list_route_passes_has_replay(env, monkeypatch):
    seen = {}

    def fake_list(**kw):
        seen.update(kw)
        return {"runs": [], "total": 0, "page": 1, "per_page": 50, "total_pages": 0}

    monkeypatch.setattr(runs_db_mongo, "list_runs", fake_list)
    assert (
        client.get("/api/runs/list", params={"has_replay": "true"}).status_code == 200
    )
    assert seen["has_replay"] is True
