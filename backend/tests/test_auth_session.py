"""/api/auth/session answers anonymous visitors with null instead of 401."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_session_is_null_when_signed_out():
    res = client.get("/api/auth/session")
    assert res.status_code == 200
    assert res.json() == {"user": None}
    assert client.get("/api/auth/me").status_code == 401
