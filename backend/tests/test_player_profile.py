"""The profile lookup the /players page uses to tell a real player from a made-up URL."""

import pytest
from fastapi.testclient import TestClient

from app import main as m
from app.dependencies import shared_limiter
from app.services import users_db

client = TestClient(m.app, raise_server_exceptions=False)

USERS = {
    "ada": {"_id": "1", "username": "Ada"},
    "ghost": {"_id": "2", "username": "Ghost", "profile_private": True},
}


@pytest.fixture(autouse=True)
def _users(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://unused")
    monkeypatch.setattr(
        users_db,
        "get_user_by_username",
        lambda name: USERS.get(name.strip().lower()),
    )
    shared_limiter.reset()


def test_known_player_returns_the_stored_spelling():
    r = client.get("/api/players/ADA/profile")
    assert r.status_code == 200
    assert r.json() == {"username": "Ada"}


def test_unknown_and_private_players_are_the_same_404():
    for name in ("nobody", "ghost"):
        r = client.get(f"/api/players/{name}/profile")
        assert r.status_code == 404, name
        assert r.json() == {"detail": "Player not found"}


def test_no_database_means_no_profiles(monkeypatch):
    monkeypatch.delenv("MONGO_URL")
    assert client.get("/api/players/ada/profile").status_code == 404
