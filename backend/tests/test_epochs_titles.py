"""Languages whose epoch titles the game leaves partly untranslated still
serve a valid /api/epochs response with a title on every row."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, raise_server_exceptions=False)


def test_thai_epochs_validate_with_a_title_on_every_row():
    r = client.get("/api/epochs?lang=tha")
    assert r.status_code == 200
    rows = r.json()
    assert rows and all(row["title"] for row in rows)
    eng = {row["id"] for row in client.get("/api/epochs?lang=eng").json()}
    assert {row["id"] for row in rows} == eng
