from fastapi.testclient import TestClient

from app.dependencies import shared_limiter
from app.main import app
from app.services import users_db

client = TestClient(app)


class _Users:
    def __init__(self, docs):
        self.docs = docs
        self.queries = []

    def find(self, query, projection=None):
        self.queries.append(query)
        names = set(query["username_lower"]["$in"])
        return [
            d
            for d in self.docs
            if d["username_lower"] in names and not d.get("profile_private")
        ]


def _users(monkeypatch):
    users = _Users(
        [
            {"username_lower": "dobo"},
            {"username_lower": "hermit", "profile_private": True},
        ]
    )
    monkeypatch.setattr(users_db, "_get_collection", lambda: users)
    return users


def test_public_profile_names_skip_private_and_unknown(monkeypatch):
    users = _users(monkeypatch)
    out = users_db.public_profile_names(["Dobo", " HERMIT ", "nobody", "", "dobo"])
    assert out == ["dobo"]
    assert users.queries == [
        {
            "username_lower": {"$in": ["dobo", "hermit", "nobody"]},
            "profile_private": {"$ne": True},
        }
    ]
    assert users_db.public_profile_names([]) == []
    assert len(users.queries) == 1


def test_profiles_endpoint(monkeypatch):
    _users(monkeypatch)
    monkeypatch.setattr(shared_limiter, "enabled", False)
    monkeypatch.setenv("MONGO_URL", "mongodb://test/testdb")
    r = client.get("/api/players/profiles?u=Dobo&u=hermit&u=nobody")
    assert r.status_code == 200
    assert r.json() == {"profiles": ["dobo"]}
    assert r.headers["cache-control"] == "public, max-age=300"
    too_many = "&".join(f"u=n{i}" for i in range(101))
    assert client.get(f"/api/players/profiles?{too_many}").status_code == 400


def test_profiles_endpoint_without_a_database(monkeypatch):
    monkeypatch.setattr(shared_limiter, "enabled", False)
    monkeypatch.delenv("MONGO_URL", raising=False)
    r = client.get("/api/players/profiles?u=dobo")
    assert r.json() == {"profiles": []}
