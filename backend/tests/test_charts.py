"""Saved charts (chart builder): create/read/public/private flows, the
100-per-owner cap, and strict spec validation. Ownership only ever comes
from the bearer token's verified steam_id."""

import pytest
from fastapi.testclient import TestClient

from app.dependencies import shared_limiter
from app.main import app
from app.services import auth_jwt, run_entity_stats, runs_db_mongo, users_db

client = TestClient(app, raise_server_exceptions=False)
OWNER = "76561198000000001"
OTHER = "76561198000000002"
AUTH = {"Authorization": "Bearer good"}
OTHER_AUTH = {"Authorization": "Bearer other"}

SPEC = {
    "source": "cards",
    "bracket": "all",
    "chart": "bar",
    "x": "Strike",
    "y": "win_rate",
    "top": 25,
    "sort": "desc",
}


def _doc(chart_id, owner=OWNER, public=False, created_ms=0):
    from datetime import datetime, timedelta, timezone

    ts = datetime.now(timezone.utc) + timedelta(milliseconds=created_ms)
    return {
        "_id": chart_id,
        "owner_steam_id": owner,
        "title": "T",
        "spec": dict(SPEC),
        "public": public,
        "created_at": ts,
        "updated_at": ts,
        "views": 0,
    }


class FakeColl:
    def __init__(self):
        self.docs = {}

    def _match(self, doc, q):
        return all(doc.get(k) == v for k, v in q.items())

    def insert_one(self, doc):
        if doc["_id"] in self.docs:
            from pymongo.errors import DuplicateKeyError

            raise DuplicateKeyError("dup")
        self.docs[doc["_id"]] = dict(doc)

    def find_one(self, q):
        for doc in self.docs.values():
            if self._match(doc, q):
                return dict(doc)
        return None

    def count_documents(self, q):
        return sum(1 for doc in self.docs.values() if self._match(doc, q))

    def find(self, q):
        return FakeCursor([dict(d) for d in self.docs.values() if self._match(d, q)])

    def find_one_and_update(self, q, update, return_document=None):
        doc = self.find_one(q)
        if doc is None:
            return None
        doc.update(update["$set"])
        self.docs[doc["_id"]] = doc
        return dict(doc)

    def delete_one(self, q):
        target = self.find_one(q)
        if target is None:
            return type("R", (), {"deleted_count": 0})()
        del self.docs[target["_id"]]
        return type("R", (), {"deleted_count": 1})()

    def update_one(self, q, update):
        doc = self.find_one(q)
        if doc is not None:
            for field, delta in update.get("$inc", {}).items():
                doc[field] = doc.get(field, 0) + delta
            self.docs[doc["_id"]] = doc


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, key=None, direction=1, **kwargs):
        if isinstance(key, list):
            for field, dirn in reversed(key):
                self.docs.sort(key=lambda d, f=field: d.get(f, 0), reverse=dirn < 0)
        elif key is not None:
            self.docs.sort(key=lambda d: d.get(key, 0), reverse=direction < 0)
        return self

    def limit(self, n):
        self.docs = self.docs[:n]
        return self

    def __iter__(self):
        return iter(self.docs)


@pytest.fixture
def coll(monkeypatch):
    fake = FakeColl()
    monkeypatch.setattr(runs_db_mongo, "_saved_charts_coll", fake)
    monkeypatch.setattr(shared_limiter, "enabled", False)
    monkeypatch.setattr(
        auth_jwt,
        "decode_token",
        lambda t: (
            {"steam_id": OWNER if t == "good" else OTHER}
            if t in ("good", "other")
            else None
        ),
    )
    monkeypatch.setattr(
        run_entity_stats,
        "is_valid_stat_bracket",
        lambda b: b in ("all", "solo"),
    )
    monkeypatch.setattr(
        users_db,
        "get_user_by_steam_id",
        lambda sid: {"username": "Owner"} if sid == OWNER else None,
    )
    return fake


def _chart_id(r):
    return r.json()["id"]


def test_create_returns_doc_with_short_id(coll):
    r = client.post(
        "/api/charts", json={"title": "My chart", "spec": SPEC}, headers=AUTH
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["id"]) == 10
    assert body["public"] is False
    assert body["spec"]["source"] == "cards"
    assert body["views"] == 0


def test_create_requires_bearer(coll):
    r = client.post("/api/charts", json={"title": "x", "spec": SPEC})
    assert r.status_code == 401


def test_public_read_visible_and_counts_views(coll):
    cid = _chart_id(
        client.post("/api/charts", json={"title": "T", "spec": SPEC}, headers=AUTH)
    )
    assert client.get(f"/api/charts/{cid}").status_code == 404
    client.patch(f"/api/charts/{cid}", json={"public": True}, headers=AUTH)
    r = client.get(f"/api/charts/{cid}")
    assert r.status_code == 200
    assert r.headers["Cache-Control"] == "no-store"
    r2 = client.get(f"/api/charts/{cid}")
    assert r2.json()["views"] == 2


def test_private_read_allowed_for_owner_only(coll):
    cid = _chart_id(
        client.post("/api/charts", json={"title": "T", "spec": SPEC}, headers=AUTH)
    )
    assert client.get(f"/api/charts/{cid}", headers=OTHER_AUTH).status_code == 404
    r = client.get(f"/api/charts/{cid}", headers=AUTH)
    assert r.status_code == 200
    assert r.json()["owner_view"] is True


def test_patch_and_delete_are_owner_only(coll):
    cid = _chart_id(
        client.post("/api/charts", json={"title": "T", "spec": SPEC}, headers=AUTH)
    )
    assert (
        client.patch(
            f"/api/charts/{cid}", json={"title": "X"}, headers=OTHER_AUTH
        ).status_code
        == 404
    )
    assert client.delete(f"/api/charts/{cid}", headers=OTHER_AUTH).status_code == 404
    r = client.patch(
        f"/api/charts/{cid}", json={"title": "X", "public": True}, headers=AUTH
    )
    assert r.status_code == 200
    assert r.json()["title"] == "X"
    solo_spec = dict(SPEC, bracket="solo")
    r = client.patch(f"/api/charts/{cid}", json={"spec": solo_spec}, headers=AUTH)
    assert r.json()["spec"]["bracket"] == "solo"
    assert client.delete(f"/api/charts/{cid}", headers=AUTH).status_code == 200
    assert client.get(f"/api/charts/{cid}", headers=AUTH).status_code == 404


def test_spec_validation_rejects_bad_payloads(coll):
    bad = [
        {"title": "T", "spec": dict(SPEC, source="pets")},
        {"title": "T", "spec": dict(SPEC, bracket="nope")},
        {"title": "T", "spec": dict(SPEC, chart="pie")},
        {"title": "T", "spec": dict(SPEC, y="damage")},
        {"title": "T", "spec": dict(SPEC, top=4)},
        {"title": "T", "spec": dict(SPEC, top=101)},
        {"title": "T", "spec": dict(SPEC, sort="sideways")},
        {"title": "T", "spec": dict(SPEC, character="CRUSHER")},
        {"title": "T", "spec": dict(SPEC, extra=1)},
        {"title": "", "spec": SPEC},
        {"title": "x" * 81, "spec": SPEC},
        {"title": "T", "spec": dict(SPEC, filters={"min_sample": -1})},
        {"title": "T", "spec": dict(SPEC, filters={"nope": 1})},
    ]
    for body in bad:
        r = client.post("/api/charts", json=body, headers=AUTH)
        assert r.status_code == 400, body


def test_cap_of_100_per_owner(coll):
    for i in range(100):
        coll.docs[f"id{i:07d}x"] = _doc(f"id{i:07d}x")
    r = client.post("/api/charts", json={"title": "over", "spec": SPEC}, headers=AUTH)
    assert r.status_code == 409


def test_mine_lists_newest_first_and_needs_auth(coll):
    assert client.get("/api/charts/mine").status_code == 401
    coll.docs["aaa1111111"] = _doc("aaa1111111", created_ms=1)
    coll.docs["ccc3333333"] = _doc("ccc3333333", created_ms=3)
    coll.docs["bbb2222222"] = _doc("bbb2222222", created_ms=2)
    coll.docs["zzz9999999"] = _doc("zzz9999999", owner=OTHER, created_ms=9)
    r = client.get("/api/charts/mine", headers=AUTH)
    assert [d["id"] for d in r.json()] == ["ccc3333333", "bbb2222222", "aaa1111111"]


def test_public_lists_only_public_with_owner_name(coll):
    a = _chart_id(
        client.post("/api/charts", json={"title": "pub", "spec": SPEC}, headers=AUTH)
    )
    client.post("/api/charts", json={"title": "priv", "spec": SPEC}, headers=AUTH)
    client.patch(f"/api/charts/{a}", json={"public": True}, headers=AUTH)
    coll.docs["otherchart"] = _doc("otherchart", owner=OTHER, public=True)
    coll.docs["otherchart"]["title"] = "otherpub"
    r = client.get("/api/charts/public")
    titles = {d["title"]: d for d in r.json()}
    assert "priv" not in titles
    assert titles["pub"]["owner_name"] == "Owner"
    assert titles["otherpub"]["owner_name"] is None
