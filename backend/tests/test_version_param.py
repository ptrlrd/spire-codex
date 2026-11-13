"""?version= on the game data endpoints serves that version's catalog, an
unknown version is a 404 instead of today's data, and /api/versions lists
what can be asked for."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _ids(url: str) -> set[str]:
    return {c["id"] for c in client.get(url).json()}


def test_versions_endpoint_lists_servable_versions():
    rows = client.get("/api/versions").json()
    versions = [r["version"] for r in rows]
    assert {"v0.109.1", "v0.110.0", "v0.113.0"} <= set(versions)
    assert versions.index("v0.113.0") < versions.index("v0.110.0")
    assert sum(r["is_beta"] for r in rows) == 1
    assert all(set(r) == {"version", "is_latest", "is_beta"} for r in rows)


def test_a_listed_version_serves_its_own_catalog():
    assert "SCARE" in _ids("/api/cards?version=v0.109.1")
    assert "SCARE" not in _ids("/api/cards?version=v0.110.0")
    assert client.get("/api/cards/SCARE?version=v0.109.1").status_code == 200


def test_an_unknown_version_is_a_404_on_data_endpoints():
    for url in (
        "/api/cards?version=bogus",
        "/api/cards?version=v9.9.9",
        "/api/relics/ANCHOR?version=v9.9.9",
        "/api/stats?version=v9.9.9",
    ):
        res = client.get(url)
        assert res.status_code == 404, url
        assert "/api/versions" in res.json()["detail"]


def test_latest_and_no_version_still_work():
    assert client.get("/api/cards?version=latest").status_code == 200
    assert client.get("/api/cards").status_code == 200


def test_version_keeps_its_other_meanings_elsewhere():
    assert client.get("/api/runs/versions?version=v9.9.9").status_code == 200
