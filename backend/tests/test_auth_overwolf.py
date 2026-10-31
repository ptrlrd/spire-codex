"""Login with Overwolf: the start route sends a PKCE challenge and pins the
state to the browser, the callback only trusts what Overwolf's userinfo
endpoint says, links to the signed-in account or signs in an account that
already carries the id, and never creates accounts."""

import urllib.parse

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from app.dependencies import shared_limiter
from app.main import app
from app.routers import auth_overwolf
from app.services import auth_jwt, supporters, users_db

client = TestClient(app, raise_server_exceptions=False)
UID = "5f1d7f9a3b2c4d5e6f708192"
OTHER = "5f1d7f9a3b2c4d5e6f708193"


class _Coll:
    def __init__(self, docs):
        self.docs = {d["_id"]: d for d in docs}

    def find_one(self, flt, proj=None):
        for d in self.docs.values():
            ok = True
            for k, v in flt.items():
                if isinstance(v, dict) and "$ne" in v:
                    ok = ok and d.get(k) != v["$ne"]
                else:
                    ok = ok and d.get(k) == v
            if ok:
                return dict(d)
        return None

    def update_one(self, flt, update, upsert=False):
        d = self.docs[flt["_id"]]
        d.update(update.get("$set", {}))
        for k in update.get("$unset", {}):
            d.pop(k, None)


class _Resp:
    def __init__(self, status, body):
        self.status_code = status
        self._body = body
        self.text = str(body)

    def json(self):
        return self._body


class _FakeHttp:
    calls: list = []
    userinfo: dict = {}
    token_status = 200

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, data=None, headers=None):
        _FakeHttp.calls.append(("post", url, data))
        return _Resp(_FakeHttp.token_status, {"access_token": "at-1"})

    async def get(self, url, headers=None):
        _FakeHttp.calls.append(("get", url, headers))
        return _Resp(200, _FakeHttp.userinfo)


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://test/testdb")
    monkeypatch.setenv("JWT_SECRET", "salt")
    monkeypatch.setattr(auth_jwt, "_JWT_SECRET", "salt")
    monkeypatch.setenv("OVERWOLF_CLIENT_ID", "cid")
    monkeypatch.setenv("OVERWOLF_CLIENT_SECRET", "csecret")
    monkeypatch.delenv("OVERWOLF_STORE_ID", raising=False)
    monkeypatch.setattr(shared_limiter, "enabled", False)
    users = _Coll(
        [
            {"_id": ObjectId(UID), "username": "Dobo", "steam_id": "7656"},
            {"_id": ObjectId(OTHER), "username": "Rex", "overwolf_id": "ow-rex"},
        ]
    )
    monkeypatch.setattr(users_db, "_get_collection", lambda: users)
    _FakeHttp.calls = []
    _FakeHttp.userinfo = {"sub": "ow-1", "nickname": "Dobo", "subscriptions": []}
    _FakeHttp.token_status = 200
    monkeypatch.setattr(auth_overwolf.httpx, "AsyncClient", _FakeHttp)
    client.cookies.clear()
    return users


def _start():
    r = client.get("/api/auth/overwolf/start", follow_redirects=False)
    assert r.status_code == 307
    q = urllib.parse.parse_qs(urllib.parse.urlparse(r.headers["location"]).query)
    return q


def _sign_in(monkeypatch, users, uid=UID):
    doc = dict(users.docs[ObjectId(uid)])
    doc["_id"] = str(doc["_id"])
    monkeypatch.setattr(auth_jwt, "get_current_user", lambda request: doc)


def test_start_without_a_client_bounces_to_settings(env, monkeypatch):
    monkeypatch.delenv("OVERWOLF_CLIENT_ID")
    r = client.get("/api/auth/overwolf/start", follow_redirects=False)
    assert r.headers["location"].endswith("/settings?error=overwolf_unconfigured")


def test_start_sends_pkce_and_pins_state(env):
    q = _start()
    assert q["code_challenge_method"] == ["S256"]
    assert q["scope"] == ["openid profile subscriptions"]
    assert q["client_id"] == ["cid"]
    assert q["redirect_uri"][0].endswith("/api/auth/overwolf/callback")
    assert client.cookies.get("spire_ow_verifier")
    assert len(q["code_challenge"][0]) == 43


def test_callback_rejects_a_foreign_state(env):
    _start()
    r = client.get(
        "/api/auth/overwolf/callback?code=c&state=forged", follow_redirects=False
    )
    assert r.headers["location"].endswith("/settings?error=invalid_session")


def test_callback_links_the_signed_in_account(env, monkeypatch):
    users = env
    _sign_in(monkeypatch, users)
    q = _start()
    verifier = client.cookies.get("spire_ow_verifier")
    _FakeHttp.userinfo = {
        "sub": "ow-1",
        "nickname": "Dobo",
        "subscriptions": [{"packageId": 7700985, "state": "ACTIVE"}],
    }
    r = client.get(
        f"/api/auth/overwolf/callback?code=c&state={q['state'][0]}",
        follow_redirects=False,
    )
    assert r.headers["location"].endswith("/settings?linked=overwolf")
    kind, url, form = _FakeHttp.calls[0]
    assert url == auth_overwolf._OVERWOLF_TOKEN
    assert form["code_verifier"] == verifier and form["client_secret"] == "csecret"
    assert _FakeHttp.calls[1][2]["Authorization"] == "Bearer at-1"
    doc = users.docs[ObjectId(UID)]
    assert doc["overwolf_id"] == "ow-1" and doc["overwolf_nickname"] == "Dobo"
    assert doc["overwolf_subscription"]["tier"] == "ancient"
    assert "spire_auth" in r.headers.get("set-cookie", "") or r.cookies


def test_callback_signs_in_an_account_that_carries_the_id(env):
    users = env
    q = _start()
    _FakeHttp.userinfo = {"sub": "ow-rex", "username": "Rex"}
    r = client.get(
        f"/api/auth/overwolf/callback?code=c&state={q['state'][0]}",
        follow_redirects=False,
    )
    assert r.headers["location"].endswith("/settings?linked=overwolf")
    assert users.docs[ObjectId(OTHER)]["overwolf_nickname"] == "Rex"
    assert (
        users.docs[ObjectId(OTHER)]["overwolf_subscription"]["state"] == "unconfigured"
    )


def test_callback_never_creates_an_account(env):
    q = _start()
    _FakeHttp.userinfo = {"sub": "ow-new"}
    r = client.get(
        f"/api/auth/overwolf/callback?code=c&state={q['state'][0]}",
        follow_redirects=False,
    )
    assert r.headers["location"].endswith("/?auth=steam_required")


def test_callback_refuses_an_id_linked_elsewhere(env, monkeypatch):
    users = env
    _sign_in(monkeypatch, users)
    q = _start()
    _FakeHttp.userinfo = {"sub": "ow-rex"}
    r = client.get(
        f"/api/auth/overwolf/callback?code=c&state={q['state'][0]}",
        follow_redirects=False,
    )
    assert "already%20linked" in r.headers["location"]
    assert "overwolf_id" not in users.docs[ObjectId(UID)]


def test_failed_token_exchange_bounces(env):
    q = _start()
    _FakeHttp.token_status = 400
    r = client.get(
        f"/api/auth/overwolf/callback?code=c&state={q['state'][0]}",
        follow_redirects=False,
    )
    assert r.headers["location"].endswith("/settings?error=overwolf_failed")


def test_only_sign_in_method_cannot_be_unlinked(env):
    users = env
    assert supporters.unlink_overwolf(OTHER)["error"].startswith("Cannot disconnect")
    assert users.docs[ObjectId(OTHER)]["overwolf_id"] == "ow-rex"
    users.docs[ObjectId(UID)]["overwolf_id"] = "ow-1"
    assert supporters.unlink_overwolf(UID) == {"overwolf_id": None, "active": False}
    assert "overwolf_id" not in users.docs[ObjectId(UID)]
