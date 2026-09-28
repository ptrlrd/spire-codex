"""Supporter status: Patreon, a monthly Ko-fi membership matched by email
hash, and a server-verified Overwolf subscription each turn the flag on,
each lapses on its own, the Thank You listing is opt-in, and the routes
never trust the overlay's word without a verified token."""

from datetime import datetime, timedelta, timezone

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from app.dependencies import shared_limiter
from app.main import app
from app.routers import auth as auth_router
from app.services import auth_jwt, supporters, thanks, users_db

client = TestClient(app, raise_server_exceptions=False)
NOW = datetime(2026, 9, 27, 12, 0, tzinfo=timezone.utc)
UID = "5f1d7f9a3b2c4d5e6f708192"


class _Coll:
    def __init__(self, docs=None):
        self.docs = {d["_id"]: d for d in (docs or [])}

    def find_one(self, flt, proj=None):
        d = self.docs.get(flt.get("_id"))
        return dict(d) if d else None

    def find(self, flt=None, proj=None):
        flt = flt or {}
        out = []
        for d in self.docs.values():
            ok = True
            for k, v in flt.items():
                if isinstance(v, dict) and "$ne" in v:
                    ok = ok and d.get(k) != v["$ne"]
                else:
                    ok = ok and d.get(k) == v
            if ok:
                out.append(dict(d))
        return out

    def update_one(self, flt, update, upsert=False):
        created = flt["_id"] not in self.docs
        d = self.docs.setdefault(flt["_id"], {"_id": flt["_id"]})
        for k, v in update.get("$set", {}).items():
            d[k] = v
        for k, v in update.get("$setOnInsert", {}).items():
            if created:
                d[k] = v
        for k in update.get("$unset", {}):
            d.pop(k, None)
        return _Res(flt["_id"] if created else None)


class _Res:
    def __init__(self, upserted_id):
        self.upserted_id = upserted_id


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://test/testdb")
    monkeypatch.setenv("JWT_SECRET", "salt")
    from app.services import user_insights

    monkeypatch.setattr(user_insights, "prewarm_user_insights", lambda *a, **k: None)
    users = _Coll(
        [{"_id": ObjectId(UID), "username": "Dobo", "email": "dobo@example.com"}]
    )
    kofi = _Coll()
    monkeypatch.setattr(users_db, "_get_collection", lambda: users)
    monkeypatch.setattr(thanks, "_supporters", lambda: kofi)
    monkeypatch.setattr(thanks, "_enabled", lambda: True)
    monkeypatch.setattr(shared_limiter, "enabled", False)
    return users, kofi


def _user(users):
    return users.docs[ObjectId(UID)]


def _session_user(users):
    return {**_user(users), "_id": UID}


def test_nobody_is_a_supporter_by_default(env):
    users, _ = env
    st = supporters.status(_user(users), NOW)
    assert st == {
        "active": False,
        "sources": [],
        "since": None,
        "expires_at": None,
        "listed": False,
    }


def test_patreon_counts(env):
    users, _ = env
    _user(users)["is_paid"] = True
    st = supporters.status(_user(users), NOW)
    assert st["active"] and [s["source"] for s in st["sources"]] == ["patreon"]
    assert st["expires_at"] is None


def test_kofi_monthly_matches_by_email_hash_and_lapses(env):
    users, kofi = env
    payload = {
        "type": "Subscription",
        "from_name": "Dobo",
        "email": "Dobo@Example.com",
        "amount": "3.00",
        "timestamp": (NOW - timedelta(days=10)).isoformat(),
        "kofi_transaction_id": "tx1",
    }
    thanks.record_supporter(payload)
    stored = kofi.docs["tx1"]
    assert "email" not in stored and stored[
        "member_fingerprint"
    ] == supporters.email_hash("dobo@example.com")
    st = supporters.status(_user(users), NOW)
    assert [s["source"] for s in st["sources"]] == ["kofi"]
    assert supporters.status(_user(users), NOW + timedelta(days=60))["active"] is False
    thanks.record_supporter(
        {**payload, "type": "Donation", "kofi_transaction_id": "tx2"}
    )
    assert supporters.status(_user(users), NOW + timedelta(days=60))["active"] is False


def test_overwolf_link_verifies_token_and_sets_grace(env, monkeypatch):
    users, _ = env
    monkeypatch.setattr(
        supporters, "verify_overwolf_token", lambda t: {"overwolf_user_id": "ow-1"}
    )
    monkeypatch.setattr(
        supporters,
        "fetch_overwolf_subscription",
        lambda t: {"state": "active", "package_id": 7},
    )
    out = supporters.link_overwolf(UID, "a.b.c")
    assert out == {"overwolf_id": "ow-1", "active": True, "state": "active"}
    u = _user(users)
    assert u["overwolf_id"] == "ow-1"
    st = supporters.status(u, datetime.now(timezone.utc))
    assert [s["source"] for s in st["sources"]] == ["overwolf"]
    assert (
        supporters.status(u, datetime.now(timezone.utc) + timedelta(days=36))["active"]
        is False
    )
    monkeypatch.setattr(
        supporters,
        "fetch_overwolf_subscription",
        lambda t: {"state": "expired", "package_id": 7},
    )
    assert supporters.link_overwolf(UID, "a.b.c")["active"] is False
    assert (
        supporters.status(_user(users), datetime.now(timezone.utc))["active"] is False
    )


def test_overwolf_without_store_records_identity_but_no_flag(env, monkeypatch):
    users, _ = env
    monkeypatch.delenv("OVERWOLF_STORE_ID", raising=False)
    monkeypatch.setattr(
        supporters, "verify_overwolf_token", lambda t: {"overwolf_user_id": "ow-2"}
    )
    out = supporters.link_overwolf(UID, "a.b.c")
    assert out["active"] is False and out["state"] == "unconfigured"
    assert _user(users)["overwolf_id"] == "ow-2"


def test_bad_overwolf_token_is_rejected(env):
    with pytest.raises(supporters.OverwolfError):
        supporters.verify_overwolf_token("not-a-jwt")


def test_routes_require_login_and_verified_token(env, monkeypatch):
    users, _ = env
    assert (
        client.post("/api/auth/overwolf/link", json={"token": "x.y.z"}).status_code
        == 401
    )
    monkeypatch.setattr(
        auth_jwt, "get_current_user", lambda request: _session_user(users)
    )
    monkeypatch.setattr(
        auth_router, "get_current_user", lambda request: _session_user(users)
    )
    monkeypatch.setattr(
        auth_router, "require_user", lambda request: _session_user(users)
    )
    assert client.post("/api/auth/overwolf/link", json={}).status_code == 400
    monkeypatch.setattr(
        supporters,
        "verify_overwolf_token",
        lambda t: (_ for _ in ()).throw(supporters.OverwolfError("invalid token")),
    )
    assert (
        client.post("/api/auth/overwolf/link", json={"token": "x.y.z"}).status_code
        == 401
    )
    monkeypatch.setattr(
        supporters, "verify_overwolf_token", lambda t: {"overwolf_user_id": "ow-9"}
    )
    monkeypatch.setattr(
        supporters,
        "fetch_overwolf_subscription",
        lambda t: {"state": "active", "package_id": 1},
    )
    r = client.post("/api/auth/overwolf/link", json={"token": "x.y.z"})
    assert r.status_code == 200 and r.json()["supporter"]["active"] is True
    me = client.get("/api/auth/me").json()
    assert me["supporter"]["active"] is True and me["overwolf_id"] == "ow-9"
    assert (
        client.patch("/api/auth/thanks-listing", json={"listed": "yes"}).status_code
        == 400
    )
    assert client.patch("/api/auth/thanks-listing", json={"listed": True}).json() == {
        "thanks_listed": True
    }
    assert client.delete("/api/auth/overwolf").json() == {
        "overwolf_id": None,
        "active": False,
    }
    assert client.get("/api/auth/me").json()["supporter"]["active"] is False


def test_thank_you_lists_only_active_opted_in_supporters(env, monkeypatch):
    users, _ = env
    users.docs[ObjectId("5f1d7f9a3b2c4d5e6f708193")] = {
        "_id": ObjectId("5f1d7f9a3b2c4d5e6f708193"),
        "username": "Quiet",
        "is_paid": True,
    }
    users.docs[ObjectId("5f1d7f9a3b2c4d5e6f708194")] = {
        "_id": ObjectId("5f1d7f9a3b2c4d5e6f708194"),
        "username": "Lapsed",
        "thanks_listed": True,
    }
    _user(users).update({"is_paid": True, "thanks_listed": True})
    rows = supporters.public_subscribers()
    assert rows == [{"name": "Dobo", "sources": ["patreon"], "since": None}]
    monkeypatch.setattr(thanks, "contributors", lambda: [])
    monkeypatch.setattr(thanks, "list_special", lambda: [])
    monkeypatch.setattr(thanks, "public_supporters", lambda: [])
    assert thanks.payload()["subscribers"] == rows
    assert "email" not in str(rows)
