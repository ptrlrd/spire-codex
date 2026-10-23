"""Keyword filter counts keywords an upgrade adds, not only base keywords."""

from fastapi.testclient import TestClient

from app.main import app
from app.routers.cards import has_keyword

client = TestClient(app)


def test_has_keyword_reads_base_localized_and_upgrade_flags():
    tyranny = {
        "keywords": ["Erschöpft"],
        "keywords_key": ["Exhaust"],
        "upgrade": {"add_innate": True},
    }
    assert has_keyword(tyranny, "Exhaust", "Erschöpft")
    assert has_keyword(tyranny, "exhaust")
    assert has_keyword(tyranny, "Innate")
    assert not has_keyword(tyranny, "Retain")
    assert not has_keyword({"keywords": None, "upgrade": None}, "Innate")
    assert not has_keyword({"keywords": ["Innate"]}, "")


def test_innate_filter_includes_cards_that_gain_it_on_upgrade():
    ids = {c["id"] for c in client.get("/api/cards?keyword=Innate").json()}
    assert {"AGGRESSION", "TYRANNY"} <= ids
    exhaust = {c["id"] for c in client.get("/api/cards?keyword=Exhaust").json()}
    assert "TYRANNY" in exhaust
    assert "AGGRESSION" not in exhaust


def test_localized_keyword_filter_still_matches_translated_names():
    ids = {c["id"] for c in client.get("/api/cards?keyword=Exhaust&lang=deu").json()}
    assert "TYRANNY" in ids
