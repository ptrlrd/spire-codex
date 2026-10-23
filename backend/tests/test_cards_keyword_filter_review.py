"""A translated keyword value must resolve to the English key so upgrade
flags match; base keywords still match by translated name."""

from fastapi.testclient import TestClient

from app.main import app
from app.routers.cards import canonical_keyword

client = TestClient(app)


def test_localized_keyword_filter_matches_translated_upgrade_keyword():
    response = client.get("/api/cards?keyword=Angeboren&lang=deu")
    assert response.status_code == 200
    ids = {c["id"] for c in response.json()}
    assert {"AGGRESSION", "TYRANNY"} <= ids


def test_localized_keyword_filter_matches_translated_base_keyword():
    response = client.get("/api/cards?keyword=Erschöpft&lang=deu")
    assert response.status_code == 200
    ids = {c["id"] for c in response.json()}
    assert "TYRANNY" in ids


def test_canonical_keyword_maps_names_both_ways():
    names = {"INNATE": "Angeboren", "EXHAUST": "Erschöpft"}
    assert canonical_keyword("angeboren", names) == "innate"
    assert canonical_keyword("Innate", names) == "innate"
    assert canonical_keyword("Retain", {}) == "retain"
