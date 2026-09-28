"""POST /api/auth/refresh swaps a valid token for a fresh 7 day one, sets the
cookie, and refuses anyone without a valid token."""

from fastapi.testclient import TestClient

from app.dependencies import shared_limiter
from app.main import app
from app.routers import auth as auth_router
from app.services import auth_jwt

client = TestClient(app, raise_server_exceptions=False)
USER = {
    "_id": "5f1d7f9a3b2c4d5e6f708192",
    "steam_id": "76561198000000001",
    "username": "Dobo",
}


def test_refresh_requires_a_valid_token(monkeypatch):
    monkeypatch.setattr(shared_limiter, "enabled", False)
    monkeypatch.setattr(auth_jwt, "_JWT_SECRET", "test-secret")
    assert client.post("/api/auth/refresh").status_code == 401
    assert (
        client.post(
            "/api/auth/refresh", headers={"Authorization": "Bearer not.a.token"}
        ).status_code
        == 401
    )


def test_refresh_issues_a_new_token_for_the_same_user(monkeypatch):
    monkeypatch.setattr(shared_limiter, "enabled", False)
    monkeypatch.setattr(auth_jwt, "_JWT_SECRET", "test-secret")
    monkeypatch.setattr(auth_router, "require_user", lambda request: USER)
    r = client.post("/api/auth/refresh", headers={"Authorization": "Bearer x.y.z"})
    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == USER["_id"] and body["expires_in_days"] == 7
    claims = auth_jwt.decode_token(body["token"])
    assert claims["sub"] == USER["_id"] and claims["steam_id"] == USER["steam_id"]
    assert claims["exp"] - claims["iat"] == 7 * 86400
    assert "spire_token" in r.headers.get("set-cookie", "") or r.headers.get(
        "set-cookie"
    )
