"""Admin replay surface: listing filters and paging, username join through
the runs collection, stats, and the operator actions (requeue, soft delete,
restore, raw blob), all behind require_admin."""

import gzip
from datetime import datetime, timedelta, timezone

import pytest
from bson import Binary, ObjectId
from fastapi.testclient import TestClient

from app.main import app
from app.services import auth_jwt, replay_admin, replays_db

client = TestClient(app, raise_server_exceptions=False)
ADMIN = {"_id": "a" * 24, "username": "Admin", "steam_id": "76561198000000001"}
UID = ObjectId("6" * 24)
UID2 = ObjectId("7" * 24)
NOW = datetime(2026, 9, 25, 20, 0, tzinfo=timezone.utc)


def _match(doc, flt):
    for k, v in flt.items():
        if k == "$or":
            if not any(_match(doc, sub) for sub in v):
                return False
            continue
        actual = doc.get(k)
        if isinstance(v, dict):
            for op, arg in v.items():
                if op == "$in" and actual not in arg:
                    return False
                if op == "$ne" and actual == arg:
                    return False
                if op == "$gte" and (actual is None or actual < arg):
                    return False
                if op == "$lte" and (actual is None or actual > arg):
                    return False
                if op == "$lt" and (actual is None or actual >= arg):
                    return False
                if op == "$gt" and (actual is None or actual <= arg):
                    return False
                if op == "$regex":
                    import re

                    flags = re.I if "i" in v.get("$options", "") else 0
                    if not isinstance(actual, str) or not re.search(arg, actual, flags):
                        return False
        elif actual != v:
            return False
    return True


class Cursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, spec):
        for key, direction in reversed(spec):
            self.docs.sort(
                key=lambda d: (d.get(key) is not None, d.get(key)),
                reverse=direction < 0,
            )
        return self

    def skip(self, n):
        self.docs = self.docs[n:]
        return self

    def limit(self, n):
        self.docs = self.docs[:n]
        return self

    def __iter__(self):
        return iter(self.docs)


class Fake:
    def __init__(self, docs):
        self.docs = {d["_id"]: d for d in docs}

    def find(self, flt=None, proj=None):
        return Cursor([dict(d) for d in self.docs.values() if _match(d, flt or {})])

    def find_one(self, flt, proj=None):
        for d in self.docs.values():
            if _match(d, flt):
                return dict(d)
        return None

    def count_documents(self, flt):
        return sum(1 for d in self.docs.values() if _match(d, flt))

    def update_one(self, flt, update):
        for d in self.docs.values():
            if _match(d, flt):
                for k, v in update.get("$set", {}).items():
                    d[k] = v
                for k in update.get("$unset", {}):
                    d.pop(k, None)
                return type("R", (), {"modified_count": 1})()
        return type("R", (), {"modified_count": 0})()

    def update_many(self, flt, update):
        n = 0
        for d in self.docs.values():
            if _match(d, flt):
                n += 1
                for k, v in update.get("$set", {}).items():
                    d[k] = v
                for k in update.get("$unset", {}):
                    d.pop(k, None)
        return type("R", (), {"modified_count": n})()


def _replay(h, **over):
    doc = {
        "_id": h,
        "blob": Binary(gzip.compress(b'{"t":"h"}\n')),
        "sha256": "s" + h,
        "gz_bytes": 40,
        "raw_bytes": 10,
        "lines": 1,
        "replay_version": 3,
        "mod_version": "1.0.12",
        "character": "IRONCLAD",
        "ascension": 5,
        "win": True,
        "game_mode": "standard",
        "build_id": "24724944",
        "player_count": 1,
        "player_idx": 0,
        "seed": "SEED",
        "played_at": NOW - timedelta(hours=1),
        "steam_id": "76561198000000002",
        "user_id": UID,
        "submitted_at": NOW,
        "deleted_at": None,
        "ingest_state": "done",
        "attempts": 1,
        "error": None,
        "ingested_at": NOW,
        "exploder_version": 2,
        "batch_id": "b1",
        "published": {"2": "b1"},
    }
    doc.update(over)
    return doc


def _run(h, username, uid, **over):
    doc = {
        "_id": h,
        "username": username,
        "username_lower": username.lower(),
        "user_id": uid,
    }
    doc.update(over)
    return doc


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://test")
    replays = Fake(
        [
            _replay("h1"),
            _replay(
                "h2", ingest_state=None, submitted_at=NOW - timedelta(days=1), win=False
            ),
            _replay(
                "h3",
                ingest_state="quarantined",
                error="bad line 7",
                attempts=3,
                character="SILENT",
                user_id=UID2,
                steam_id="76561198000000003",
                submitted_at=NOW - timedelta(days=3),
                replay_version=4,
            ),
            _replay("h4", deleted_at=NOW, submitted_at=NOW - timedelta(days=20)),
        ]
    )
    runs = Fake(
        [
            _run("h1", "Reviver", UID, has_replay=True),
            _run("h2", "Reviver", UID, has_replay=True),
            _run("h3", "Ghost", UID2, hidden=True),
            _run("h4", "Reviver", UID),
        ]
    )
    monkeypatch.setattr(replays_db, "_coll", lambda: replays)
    monkeypatch.setattr(replays_db, "_runs", lambda: runs)
    app.dependency_overrides[auth_jwt.require_admin] = lambda: ADMIN
    yield replays, runs
    app.dependency_overrides.pop(auth_jwt.require_admin, None)


def _hashes(**q):
    body = client.get("/api/admin/replays", params=q).json()
    return [r["run_hash"] for r in body["replays"]]


def test_requires_admin(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://test")
    monkeypatch.setattr(auth_jwt, "get_current_user", lambda request: None)
    assert client.get("/api/admin/replays").status_code == 404


def test_list_defaults_exclude_deleted_newest_first(env):
    body = client.get("/api/admin/replays").json()
    assert [r["run_hash"] for r in body["replays"]] == ["h1", "h2", "h3"]
    assert body["total"] == 3
    first = body["replays"][0]
    assert first["username"] == "Reviver"
    assert first["state"] == "done"
    assert first["viewer_url"] == "/runs/h1/replay"
    assert first["user_id"] == str(UID)
    assert first["published_versions"] == ["2"]
    assert "blob" not in first


def test_state_filters(env):
    assert _hashes(state="pending") == ["h2"]
    assert _hashes(state="quarantined") == ["h3"]
    assert _hashes(state="deleted") == ["h4"]
    assert _hashes(state="all") == ["h1", "h2", "h3", "h4"]
    assert (
        client.get("/api/admin/replays", params={"state": "bogus"}).status_code == 400
    )


def test_user_character_version_and_date_filters(env):
    assert _hashes(user="reviver") == ["h1", "h2"]
    assert _hashes(user="76561198000000003") == ["h3"]
    assert _hashes(user=str(UID2)) == ["h3"]
    assert _hashes(user="nobody") == []
    assert _hashes(user="REVIVER") == ["h1", "h2"]
    assert _hashes(character="silent") == ["h3"]
    assert _hashes(replay_version=4) == ["h3"]
    assert _hashes(win="false") == ["h2"]
    assert _hashes(since=(NOW - timedelta(hours=2)).isoformat()) == ["h1"]
    assert _hashes(until=(NOW - timedelta(days=2)).isoformat()) == ["h3"]
    assert (
        client.get("/api/admin/replays", params={"since": "yesterday"}).status_code
        == 400
    )


def test_paging(env):
    p1 = client.get("/api/admin/replays", params={"limit": 2, "page": 1}).json()
    p2 = client.get("/api/admin/replays", params={"limit": 2, "page": 2}).json()
    assert [r["run_hash"] for r in p1["replays"]] == ["h1", "h2"]
    assert [r["run_hash"] for r in p2["replays"]] == ["h3"]
    assert p1["total"] == p2["total"] == 3
    assert (
        client.get("/api/admin/replays", params={"limit": 999}).json()["limit"] == 100
    )


def test_detail_and_quarantine_reason(env):
    body = client.get("/api/admin/replays/h3").json()
    assert body["state"] == "quarantined"
    assert body["error"] == "bad line 7"
    assert body["attempts"] == 3
    assert body["username"] == "Ghost"
    assert body["run_hidden"] is True
    assert client.get("/api/admin/replays/nope").status_code == 404


def test_stats(env):
    body = client.get("/api/admin/replays/stats", params={"days": 7}).json()
    assert body["total"] == 4
    assert body["by_state"] == {
        "pending": 1,
        "claimed": 0,
        "retry": 0,
        "quarantined": 1,
        "done": 1,
        "deleted": 1,
    }
    assert body["by_replay_version"] == {"3": 2, "4": 1}
    assert body["by_character"] == {"IRONCLAD": 2, "SILENT": 1}
    assert sum(d["uploads"] for d in body["per_day"]) == 3
    assert body["stored_gz_bytes"] == 160


def test_requeue_resets_ingest_fields(env):
    replays, _ = env
    body = client.post("/api/admin/replays/h3/requeue").json()
    assert body["state"] == "pending"
    assert body["attempts"] == 0 and body["error"] is None
    assert replays.docs["h3"]["batch_id"] is None
    replays.docs["h1"]["ingest_state"] = "claimed"
    replays.docs["h1"]["owner"] = "worker-1"
    replays.docs["h1"]["lease_expires_at"] = NOW + timedelta(days=3650)
    assert client.post("/api/admin/replays/h1/requeue").status_code == 409
    assert client.post("/api/admin/replays/h4/requeue").status_code == 409
    replays.docs["h1"]["lease_expires_at"] = NOW - timedelta(days=1)
    body = client.post("/api/admin/replays/h1/requeue").json()
    assert body["state"] == "pending"
    assert "owner" not in replays.docs["h1"]


def test_delete_and_restore_toggle_has_replay(env):
    replays, runs = env
    body = client.delete("/api/admin/replays/h1").json()
    assert body["state"] == "deleted" and body["deleted_at"]
    assert "has_replay" not in runs.docs["h1"]
    assert [
        r["run_hash"] for r in client.get("/api/admin/replays").json()["replays"]
    ] == ["h2", "h3"]
    body = client.post("/api/admin/replays/h1/restore").json()
    assert body["state"] == "done" and body["deleted_at"] is None
    assert runs.docs["h1"]["has_replay"] is True
    assert client.delete("/api/admin/replays/nope").status_code == 404


def test_blob_serves_deleted_and_hidden(env):
    for h in ("h3", "h4"):
        r = client.get(f"/api/admin/replays/{h}/blob")
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/gzip"
        assert r.headers["x-replay-sha256"] == "s" + h
        assert gzip.decompress(r.content) == b'{"t":"h"}\n'
    assert client.get("/api/admin/replays/nope/blob").status_code == 404


def test_without_mongo_is_503(env, monkeypatch):
    monkeypatch.setenv("MONGO_URL", "")
    assert client.get("/api/admin/replays").status_code == 503


def test_state_of():
    assert (
        replay_admin.state_of({"deleted_at": NOW, "ingest_state": "done"}) == "deleted"
    )
    assert (
        replay_admin.state_of({"deleted_at": None, "ingest_state": None}) == "pending"
    )
    assert replay_admin.state_of({"ingest_state": "retry"}) == "retry"
