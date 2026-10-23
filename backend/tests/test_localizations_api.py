"""/api/localizations serves the per-language message pack: whole, by
table, or a named subset, with eng fallback and 404s for unknown tables."""

import json

import pytest
from fastapi.testclient import TestClient

from app.dependencies import shared_limiter
from app.main import app
from app.services import data_service

client = TestClient(app, raise_server_exceptions=False)
PACK = {
    "cards": {"STRIKE": {"title": "Strike", "description": "Deal {Damage} damage."}},
    "relics": {"ANCHOR": {"title": "Anchor"}},
}


@pytest.fixture
def packs(tmp_path, monkeypatch):
    (tmp_path / "eng").mkdir()
    (tmp_path / "eng" / "messages.json").write_text(json.dumps(PACK))
    (tmp_path / "deu").mkdir()
    (tmp_path / "deu" / "messages.json").write_text(
        json.dumps({"cards": {"STRIKE": {"title": "Schlag"}}})
    )
    monkeypatch.setattr(data_service, "DATA_DIR", tmp_path)
    monkeypatch.setattr(shared_limiter, "enabled", False)
    data_service._load_json_versioned.cache_clear()
    yield tmp_path
    data_service._load_json_versioned.cache_clear()


def test_whole_pack_and_table_names(packs):
    r = client.get("/api/localizations?lang=eng")
    assert r.status_code == 200 and r.json() == PACK
    assert r.headers["cache-control"] == "public, max-age=3600"
    assert client.get("/api/localizations/tables?lang=eng").json() == [
        "cards",
        "relics",
    ]


def test_single_table_and_subset(packs):
    assert client.get("/api/localizations/relics?lang=eng").json() == PACK["relics"]
    r = client.get("/api/localizations?lang=eng&tables=cards")
    assert r.json() == {"cards": PACK["cards"]}
    assert client.get("/api/localizations/nope?lang=eng").status_code == 404
    r = client.get("/api/localizations?lang=eng&tables=cards,cards,relics")
    assert list(r.json()) == ["cards", "relics"]
    too_many = ",".join(f"t{i}" for i in range(51))
    assert (
        client.get(f"/api/localizations?lang=eng&tables={too_many}").status_code == 400
    )
    assert (
        client.get("/api/localizations?lang=eng&tables=cards,nope").status_code == 404
    )


def test_language_and_eng_fallback(packs):
    assert client.get("/api/localizations/cards?lang=deu").json() == {
        "STRIKE": {"title": "Schlag"}
    }
    assert client.get("/api/localizations/cards?lang=fra").json() == PACK["cards"]


def test_missing_pack_is_empty_not_500(packs, monkeypatch):
    monkeypatch.setattr(data_service, "DATA_DIR", packs / "nowhere")
    data_service._load_json_versioned.cache_clear()
    r = client.get("/api/localizations?lang=eng")
    assert r.json() == {} and r.headers["cache-control"] == "no-store"
    assert client.get("/api/localizations/cards?lang=eng").status_code == 404
