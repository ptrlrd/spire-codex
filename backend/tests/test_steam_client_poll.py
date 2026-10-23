"""The overlay's Steam sign-in: /start makes a client session, the browser
callback writes the identity without consuming it, /poll hands the token to
the overlay and keeps answering for a short replay window, while the
website's own /redirect flow still pops its session and redirects."""

import re

import pytest
from fastapi.testclient import TestClient

from app.dependencies import shared_limiter
from app.main import app
from app.routers import auth_steam
from app.services import auth_session_store, users_db

client = TestClient(app, raise_server_exceptions=False)
STEAMID = "76561198000000001"


class _Resp:
    text = "ns:http://specs.openid.net/auth/2.0\nis_valid:true\n"


class _FakeAsync:
    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, *a, **k):
        return _Resp()


@pytest.fixture
def env(monkeypatch):
    monkeypatch.delenv("MONGO_URL", raising=False)
    monkeypatch.setattr(shared_limiter, "enabled", False)
    monkeypatch.setattr(auth_steam.httpx, "AsyncClient", _FakeAsync)

    async def persona(steamid):
        return "Dobo"

    monkeypatch.setattr(auth_steam, "_fetch_persona_name", persona)
    monkeypatch.setattr(
        users_db,
        "find_or_create_by_steam",
        lambda steamid, persona: {
            "_id": "u1",
            "steam_id": steamid,
            "username": "Dobo",
            "email": "d@e.com",
        },
    )
    monkeypatch.setattr(
        auth_steam, "create_token", lambda **k: "jwt.for.u1", raising=False
    )
    from app.services import auth_jwt

    monkeypatch.setattr(auth_jwt, "create_token", lambda **k: "jwt.for.u1")
    auth_session_store._mem.clear()
    return None


def _callback(sid):
    return client.get(
        "/api/auth/steam/callback",
        params={
            "session": sid,
            "openid.mode": "id_res",
            "openid.claimed_id": f"https://steamcommunity.com/openid/id/{STEAMID}",
        },
        follow_redirects=False,
    )


def test_web_flag_is_stored(env):
    sid = auth_session_store.create_session()
    assert auth_session_store.get_session(sid)["web"] is False
    auth_session_store.update_session(sid, web=True)
    assert auth_session_store.get_session(sid)["web"] is True


def test_client_session_survives_the_callback_and_poll_returns_the_token(
    env, monkeypatch
):
    sid = client.post("/api/auth/steam/start").json()["session_id"]
    assert client.get(f"/api/auth/steam/poll/{sid}").json() == {"status": "pending"}
    r = _callback(sid)
    assert r.status_code == 200 and "Dobo" in r.text
    first = client.get(f"/api/auth/steam/poll/{sid}").json()
    assert first["status"] == "ok" and first["steamid"] == STEAMID
    assert first["token"] == "jwt.for.u1" and first["user_id"] == "u1"
    again = client.get(f"/api/auth/steam/poll/{sid}").json()
    assert again["token"] == "jwt.for.u1"
    monkeypatch.setattr(auth_steam, "POLL_REPLAY_SECONDS", 0.0)
    assert client.get(f"/api/auth/steam/poll/{sid}").status_code == 404
    assert client.get(f"/api/auth/steam/poll/{sid}").status_code == 404


def test_web_session_still_redirects_and_pops(env, monkeypatch):
    monkeypatch.setattr(auth_steam, "web_flow_bound", lambda sid, cookie: True)
    from app.services import auth_jwt

    monkeypatch.setattr(auth_jwt, "get_current_user", lambda request: None)
    r = client.get("/api/auth/steam/redirect", follow_redirects=False)
    from urllib.parse import unquote

    sid = re.search(r"session=([A-Za-z0-9_-]+)", unquote(r.headers["location"])).group(
        1
    )
    assert auth_session_store.get_session(sid)["web"] is True
    r = _callback(sid)
    assert r.status_code in (302, 307)
    assert r.headers["location"].endswith("/profile?auth=steam")
    assert "token=" not in r.headers["location"]
    assert "spire_session=jwt.for.u1" in r.headers.get("set-cookie", "")
    assert client.get(f"/api/auth/steam/poll/{sid}").status_code == 404


def test_split_origin_dev_still_hands_the_token_over_the_url(env, monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:3000")
    monkeypatch.setattr(auth_steam, "web_flow_bound", lambda sid, cookie: True)
    from app.services import auth_jwt

    monkeypatch.setattr(auth_jwt, "get_current_user", lambda request: None)
    r = client.get("/api/auth/steam/redirect", follow_redirects=False)
    from urllib.parse import unquote

    sid = re.search(r"session=([A-Za-z0-9_-]+)", unquote(r.headers["location"])).group(
        1
    )
    r = _callback(sid)
    assert r.headers["location"] == (
        "http://localhost:3000/profile?auth=steam&token=jwt.for.u1"
    )
    assert "spire_session" not in r.headers.get("set-cookie", "")


def test_poll_hands_the_token_in_json_without_a_cookie(env, monkeypatch):
    sid = client.post("/api/auth/steam/start").json()["session_id"]
    _callback(sid)
    r = client.get(f"/api/auth/steam/poll/{sid}")
    assert r.json()["token"] == "jwt.for.u1"
    assert "spire_session" not in r.headers.get("set-cookie", "")
