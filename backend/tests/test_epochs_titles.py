"""Languages whose epoch titles the game leaves untranslated still serve a
valid /api/epochs response, with English titles filled in."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, raise_server_exceptions=False)


def test_thai_epochs_validate_with_english_titles():
    r = client.get("/api/epochs?lang=tha")
    assert r.status_code == 200
    rows = r.json()
    assert rows and all(row["title"] for row in rows)
    eng = {row["id"]: row["title"] for row in client.get("/api/epochs?lang=eng").json()}
    assert all(row["title"] == eng.get(row["id"], row["id"]) for row in rows)
