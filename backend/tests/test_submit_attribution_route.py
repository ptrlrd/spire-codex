"""POST /api/runs: a bearer token is the only thing that attributes a run;
a bare ?steam_id reaches storage as a hint."""

import pytest
from fastapi.testclient import TestClient

from app.dependencies import shared_limiter
from app.main import app
from app.routers import runs as runs_router
from app.services import auth_jwt

client = TestClient(app, raise_server_exceptions=False)
BODY = {
    "players": [{"character": "CHARACTER.IRONCLAD"}],
    "map_point_history": [[]],
    "acts": [],
}


@pytest.fixture
def seen(monkeypatch):
    monkeypatch.setattr(shared_limiter, "enabled", False)
    monkeypatch.delenv("DISABLE_RUN_SUBMISSIONS", raising=False)
    calls = {}

    def fake_submit(data, **kw):
        calls.update(kw)
        return {"success": True, "run_hash": "abc", "player_idx": 0}

    monkeypatch.setattr(runs_router, "submit_run", fake_submit)
    monkeypatch.setattr(
        auth_jwt,
        "decode_token",
        lambda t: {"steam_id": "76561198000000001"} if t == "good" else None,
    )
    return calls


def test_bare_steam_id_is_only_a_hint(seen):
    r = client.post("/api/runs?steam_id=76561198000000009&username=Victim", json=BODY)
    assert r.status_code == 200
    assert seen["steam_id"] is None and seen["verified"] is False
    assert seen["steam_id_hint"] == "76561198000000009"
    assert seen["username"] == "Victim" and seen["discord_id"] is None


def test_bearer_token_attributes_and_outranks_the_param(seen):
    r = client.post(
        "/api/runs?steam_id=76561198000000009",
        json=BODY,
        headers={"Authorization": "Bearer good"},
    )
    assert r.status_code == 200
    assert seen["steam_id"] == "76561198000000001" and seen["verified"] is True
    assert seen["steam_id_hint"] is None


def test_bad_token_falls_back_to_a_hint(seen):
    client.post(
        "/api/runs?steam_id=76561198000000009",
        json=BODY,
        headers={"Authorization": "Bearer nope"},
    )
    assert seen["verified"] is False and seen["steam_id_hint"] == "76561198000000009"
