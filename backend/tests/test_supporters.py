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
        flt = dict(flt or {})
        alts = flt.pop("$or", None)
        out = []
        for d in self.docs.values():
            ok = not alts or any(self.find_match(d, a) for a in alts)
            for k, v in flt.items():
                if isinstance(v, dict) and "$ne" in v:
                    ok = ok and d.get(k) != v["$ne"]
                elif isinstance(v, dict) and "$in" in v:
                    ok = ok and d.get(k) in v["$in"]
                elif isinstance(v, dict) and "$exists" in v:
                    ok = ok and ((k in d) == bool(v["$exists"]))
                else:
                    ok = ok and d.get(k) == v
            if ok:
                out.append(dict(d))
        return out

    def find_match(self, d, flt):
        return all(d.get(k) == v for k, v in flt.items())

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
        [
            {
                "_id": ObjectId(UID),
                "username": "Dobo",
                "username_lower": "dobo",
                "email": "dobo@example.com",
            }
        ]
    )
    supporters._flair_cache.clear()
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
        "thanks_eligible": False,
        "listed": False,
        "theme": None,
        "theme_public": False,
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
        lambda t: {"state": "active", "package_id": 7700984, "tier": "rare"},
    )
    out = supporters.link_overwolf(UID, "a.b.c")
    assert out == {
        "overwolf_id": "ow-1",
        "active": True,
        "ad_free": True,
        "state": "active",
        "tier": "rare",
    }
    u = _user(users)
    assert u["overwolf_id"] == "ow-1"
    st = supporters.status(u, datetime.now(timezone.utc))
    assert [s["source"] for s in st["sources"]] == ["overwolf"]
    assert (
        supporters.status(u, datetime.now(timezone.utc) + timedelta(days=8))["active"]
        is False
    )
    monkeypatch.setattr(
        supporters,
        "fetch_overwolf_subscription",
        lambda t: {"state": "expired", "package_id": 7700984, "tier": "rare"},
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
        lambda t: {"state": "active", "package_id": 7700985, "tier": "ancient"},
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


def test_theme_values_are_presets_or_hex():
    assert supporters.normalize_theme("Ironclad") == "ironclad"
    assert supporters.normalize_theme("#FF8800") == "#ff8800"
    assert supporters.normalize_theme("#ff8") is None
    assert supporters.normalize_theme("red") is None
    assert supporters.normalize_theme(12) is None


def _login(users, monkeypatch):
    monkeypatch.setattr(
        auth_jwt, "get_current_user", lambda request: _session_user(users)
    )
    monkeypatch.setattr(
        auth_router, "get_current_user", lambda request: _session_user(users)
    )
    monkeypatch.setattr(
        auth_router, "require_user", lambda request: _session_user(users)
    )


def test_only_supporters_can_save_a_theme(env, monkeypatch):
    users, _ = env
    assert client.patch("/api/auth/theme", json={"theme": "silent"}).status_code == 401
    _login(users, monkeypatch)
    assert client.patch("/api/auth/theme", json={}).status_code == 400
    assert client.patch("/api/auth/theme", json={"theme": "silent"}).status_code == 403
    assert client.patch("/api/auth/theme", json={"public": "yes"}).status_code == 400
    assert client.patch("/api/auth/theme", json={"public": True}).json() == {
        "theme_public": True
    }
    _user(users)["is_paid"] = True
    assert client.patch("/api/auth/theme", json={"theme": "mauve"}).status_code == 400
    assert client.patch("/api/auth/theme", json={"theme": "#AbCdEf"}).json() == {
        "theme": "#abcdef"
    }
    me = client.get("/api/auth/me").json()
    assert me["supporter"]["theme"] == "#abcdef"
    assert me["supporter"]["theme_public"] is True
    assert client.patch("/api/auth/theme", json={"theme": None}).json() == {
        "theme": None
    }
    assert "theme" not in _user(users)


def test_flair_shows_active_public_supporters_only(env):
    users, _ = env
    doc = _user(users)
    doc.update({"is_paid": True, "theme": "regent", "theme_public": True})
    users.docs[ObjectId("5f1d7f9a3b2c4d5e6f708193")] = {
        "_id": ObjectId("5f1d7f9a3b2c4d5e6f708193"),
        "username": "Quiet",
        "username_lower": "quiet",
        "is_paid": True,
        "theme": "silent",
        "theme_public": False,
    }
    users.docs[ObjectId("5f1d7f9a3b2c4d5e6f708194")] = {
        "_id": ObjectId("5f1d7f9a3b2c4d5e6f708194"),
        "username": "Lapsed",
        "username_lower": "lapsed",
        "theme": "defect",
        "theme_public": True,
    }
    out = supporters.flair(["DOBO", "quiet", "Lapsed", "nobody", ""], NOW)
    assert out == {"dobo": {"theme": "regent"}}
    doc["theme"] = "#123456"
    assert supporters.flair(["dobo"], NOW) == {"dobo": {"theme": "regent"}}
    supporters.invalidate_flair("Dobo")
    assert supporters.flair(["dobo"], NOW) == {"dobo": {"theme": "#123456"}}
    r = client.get("/api/players/flair?u=dobo&u=quiet")
    assert r.status_code == 200 and r.json() == {"dobo": {"theme": "#123456"}}
    assert r.headers["cache-control"] == "public, max-age=30"
    assert client.get("/api/players/flair").json() == {}


class _Resp:
    def __init__(self, rows):
        self.rows = rows
        self.status_code = 200

    def raise_for_status(self):
        pass

    def json(self):
        return self.rows


def _subscriptions(monkeypatch, rows):
    import httpx

    monkeypatch.setenv("OVERWOLF_STORE_ID", "13blc")
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _Resp(rows))
    return supporters.fetch_overwolf_subscription("a.b.c")


def test_package_tiers_and_entitled_states(monkeypatch):
    common = _subscriptions(monkeypatch, [{"packageId": 7721358, "state": "ACTIVE"}])
    assert common["tier"] == "common" and not supporters._overwolf_perks(common)
    rare = _subscriptions(
        monkeypatch, [{"packageId": 7700984, "state": "PENDING_CANCELLATION"}]
    )
    assert rare["tier"] == "rare" and supporters._overwolf_perks(rare)
    for gone in ("EXPIRED", "CANCELLED"):
        sub = _subscriptions(monkeypatch, [{"packageId": 7700985, "state": gone}])
        assert not supporters._overwolf_perks(sub)
    best = _subscriptions(
        monkeypatch,
        [
            {"packageId": 7700985, "state": "EXPIRED"},
            {"packageId": 7721358, "state": "ACTIVE"},
            {"packageId": 7700984, "state": "ACTIVE"},
        ],
    )
    assert best["tier"] == "rare" and supporters._overwolf_perks(best)


def test_common_link_keeps_ads(env, monkeypatch):
    users, _ = env
    monkeypatch.setattr(
        supporters, "verify_overwolf_token", lambda t: {"overwolf_user_id": "ow-c"}
    )
    monkeypatch.setattr(
        supporters,
        "fetch_overwolf_subscription",
        lambda t: {"state": "active", "package_id": 7721358, "tier": "common"},
    )
    out = supporters.link_overwolf(UID, "a.b.c")
    assert out["tier"] == "common" and out["ad_free"] is False
    st = supporters.status(_user(users), datetime.now(timezone.utc))
    assert st["active"] is False and st["thanks_eligible"] is True
    later = datetime.now(timezone.utc) + timedelta(days=8)
    assert supporters.status(_user(users), later)["thanks_eligible"] is False


def test_supporter_keys_get_the_paid_bucket(monkeypatch):
    from app.services import api_key_service, users_db as udb

    owner = {"_id": ObjectId(UID), "is_paid": True}
    monkeypatch.setattr(udb, "_get_collection", lambda: _Coll([owner]))
    assert api_key_service._supporter_tier("registered", UID) == "paid"
    assert api_key_service._supporter_tier("academia", UID) == "academia"
    owner["is_paid"] = False
    assert api_key_service._supporter_tier("registered", UID) == "registered"


def test_flair_shows_the_overwolf_tier_only_when_opted_in(env):
    users, _ = env
    doc = _user(users)
    doc.update(
        {
            "overwolf_subscription": {
                "state": "active",
                "tier": "rare",
                "expires_at": NOW + timedelta(days=3),
            },
        }
    )
    supporters.invalidate_flair("dobo")
    assert supporters.flair(["dobo"], NOW) == {}
    doc["thanks_listed"] = True
    supporters.invalidate_flair("dobo")
    assert supporters.flair(["dobo"], NOW) == {"dobo": {"tier": "rare"}}
    doc["overwolf_subscription"]["state"] = "expired"
    supporters.invalidate_flair("dobo")
    assert supporters.flair(["dobo"], NOW) == {}
    doc["overwolf_subscription"].update({"state": "active", "tier": "common"})
    supporters.invalidate_flair("dobo")
    assert supporters.flair(["dobo"], NOW) == {"dobo": {"tier": "common"}}
    assert supporters.flair(["dobo"], NOW + timedelta(days=4)) == {
        "dobo": {"tier": "common"}
    }
    supporters.invalidate_flair("dobo")
    assert supporters.flair(["dobo"], NOW + timedelta(days=4)) == {}


def test_owner_sees_their_overwolf_tier_without_opt_in():
    user = {
        "overwolf_subscription": {
            "state": "active",
            "tier": "common",
            "expires_at": NOW + timedelta(days=2),
        }
    }
    assert supporters.linked_overwolf_tier(user, NOW) == "common"
    assert supporters.linked_overwolf_tier(user, NOW + timedelta(days=3)) is None
    user["overwolf_subscription"]["state"] = "expired"
    assert supporters.linked_overwolf_tier(user, NOW) is None
    assert supporters.linked_overwolf_tier({}, NOW) is None


def _rsa_jwk():
    import json as _json

    import jwt
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = _json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key()))
    jwk.update({"kid": "gBdaS-G8RLax2qgObTD94w", "alg": "RS256", "use": "sig"})
    return key, jwt.PyJWK(jwk)


class _FakeJwks:
    def __init__(self, keys):
        self.keys = keys

    def get_signing_keys(self):
        return self.keys

    def get_signing_key(self, kid):
        for k in self.keys:
            if k.key_id == kid:
                return k
        raise LookupError(kid)


def test_overwolf_token_without_kid_verifies(monkeypatch):
    import time

    import jwt

    key, jwk = _rsa_jwk()
    other_key, other_jwk = _rsa_jwk()
    monkeypatch.setattr(supporters, "_jwks_client", _FakeJwks([other_jwk, jwk]))
    now = int(time.time())
    claims = {
        "sub": "b779116f-e976-4f95-8809-22fcd33b4c1a",
        "iat": now,
        "exp": now + 900,
    }
    token = jwt.encode(claims, key, algorithm="RS256")
    assert "kid" not in jwt.get_unverified_header(token)
    out = supporters.verify_overwolf_token(token)
    assert out["overwolf_user_id"] == "b779116f-e976-4f95-8809-22fcd33b4c1a"

    forged = jwt.encode(claims, _rsa_jwk()[0], algorithm="RS256")
    with pytest.raises(supporters.OverwolfError):
        supporters.verify_overwolf_token(forged)
    expired = jwt.encode({**claims, "exp": now - 120}, key, algorithm="RS256")
    with pytest.raises(supporters.OverwolfError):
        supporters.verify_overwolf_token(expired)
    with_kid = jwt.encode(
        claims, key, algorithm="RS256", headers={"kid": "gBdaS-G8RLax2qgObTD94w"}
    )
    assert supporters.verify_overwolf_token(with_kid)["overwolf_user_id"]


def test_overwolf_token_other_algorithms(monkeypatch):
    import time

    import jwt

    key, jwk = _rsa_jwk()
    monkeypatch.setattr(supporters, "_jwks_client", _FakeJwks([jwk]))
    now = int(time.time())
    claims = {"sub": "b779116f-uuid", "iat": now, "exp": now + 900}
    rs512 = jwt.encode(claims, key, algorithm="RS512")
    assert (
        supporters.verify_overwolf_token(rs512)["overwolf_user_id"] == "b779116f-uuid"
    )

    hs = jwt.encode(claims, "overwolf-only-secret-0123456789abcdef", algorithm="HS256")
    out = supporters.verify_overwolf_token(hs)
    assert out["overwolf_user_id"] == "b779116f-uuid" and out["confirm_with_overwolf"]
    expired = jwt.encode(
        {**claims, "exp": now - 120}, "overwolf-only-secret-0123456789abcdef"
    )
    with pytest.raises(supporters.OverwolfError):
        supporters.verify_overwolf_token(expired)


class _HttpResp:
    def __init__(self, code, body):
        self.status_code, self.body = code, body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(self.status_code)

    def json(self):
        return self.body


def test_secret_signed_token_links_only_when_overwolf_accepts_it(env, monkeypatch):
    import time

    import httpx
    import jwt

    users, _ = env
    now = int(time.time())
    hs = jwt.encode(
        {"sub": "b779116f-uuid", "iat": now, "exp": now + 900},
        "overwolf-only-secret-0123456789abcdef",
    )
    monkeypatch.setenv("OVERWOLF_STORE_ID", "13blc")
    monkeypatch.setattr(
        httpx,
        "get",
        lambda *a, **k: _HttpResp(200, [{"packageId": 7700984, "state": "ACTIVE"}]),
    )
    out = supporters.link_overwolf(UID, hs)
    assert out["tier"] == "rare" and out["ad_free"] is True
    assert _user(users)["overwolf_id"] == "b779116f-uuid"

    monkeypatch.setattr(
        httpx, "get", lambda *a, **k: _HttpResp(400, {"message": "Unauthorized"})
    )
    with pytest.raises(supporters.OverwolfError):
        supporters.link_overwolf(UID, hs)

    monkeypatch.delenv("OVERWOLF_STORE_ID", raising=False)
    with pytest.raises(supporters.OverwolfError):
        supporters.link_overwolf(UID, hs)
