"""Identity comes from the verified session: /api/runs/claim ignores any
username in the body and refuses anonymous callers, and /api/auth/set-cookie
only installs a session for a browser on this site."""

import pytest
from fastapi.testclient import TestClient

from app.dependencies import shared_limiter
from app.main import app
from app.routers import auth as auth_router
from app.routers import runs as runs_router
from app.services import auth_jwt

client = TestClient(app, raise_server_exceptions=False)
USER = {"_id": "5f1d7f9a3b2c4d5e6f708192", "username": "Dobo", "steam_id": "7656"}


@pytest.fixture(autouse=True)
def quiet(monkeypatch):
    monkeypatch.setattr(shared_limiter, "enabled", False)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)


def test_claim_requires_a_session_and_uses_its_username(monkeypatch):
    seen = {}
    monkeypatch.setattr(
        runs_router,
        "claim_runs",
        lambda username, hashes: (
            seen.update(username=username, hashes=hashes)
            or {"claimed": len(hashes), "already_claimed": 0, "unknown": 0}
        ),
    )
    body = {"username": "Victim", "hashes": ["abcdef1234"]}
    monkeypatch.setattr(auth_jwt, "get_current_user", lambda request: None)
    assert client.post("/api/runs/claim", json=body).status_code == 401

    monkeypatch.setattr(auth_jwt, "get_current_user", lambda request: USER)
    r = client.post("/api/runs/claim", json=body)
    assert r.status_code == 200 and r.json()["claimed"] == 1
    assert seen == {"username": "Dobo", "hashes": ["abcdef1234"]}
    assert client.post("/api/runs/claim", json={"hashes": "x"}).status_code == 400


def test_set_cookie_only_for_same_site_browser_origins(monkeypatch):
    monkeypatch.setattr(
        auth_router, "decode_token", lambda t: {"sub": "u1"}, raising=False
    )
    monkeypatch.setattr(auth_jwt, "decode_token", lambda t: {"sub": "u1"})
    body = {"token": "x.y.z"}
    assert client.post("/api/auth/set-cookie", json=body).status_code == 403
    r = client.post(
        "/api/auth/set-cookie", json=body, headers={"Origin": "https://evil.example"}
    )
    assert r.status_code == 403
    r = client.post(
        "/api/auth/set-cookie",
        json=body,
        headers={"Origin": "http://testserver"},
    )
    assert r.status_code == 200 and "spire_session=x.y.z" in r.headers["set-cookie"]
    r = client.post(
        "/api/auth/set-cookie",
        content='{"token":"x.y.z"}',
        headers={"Origin": "http://testserver", "Content-Type": "text/plain"},
    )
    assert r.status_code == 415
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000,https://spire-codex.com")
    r = client.post(
        "/api/auth/set-cookie",
        json=body,
        headers={"Origin": "http://localhost:3000"},
    )
    assert r.status_code == 200
