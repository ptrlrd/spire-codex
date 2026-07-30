"""The per-card history endpoint serves the wiki-scraped update tables in
data/card_history.json; unknown cards 404 so the frontend can fall back to
the site-changelog timeline."""

import pytest
from fastapi import HTTPException

from app.routers.cards import _card_histories, get_card_history


def test_history_file_loads_and_is_well_formed():
    histories = _card_histories()
    assert len(histories) > 400
    for card_id, entries in list(histories.items())[:50]:
        assert card_id == card_id.upper()
        assert entries
        for entry in entries:
            assert set(entry) == {"version", "type", "date", "changes"}
            assert isinstance(entry["changes"], list)
            assert all(isinstance(c, str) and c for c in entry["changes"])


def test_dated_entries_are_newest_first():
    histories = _card_histories()
    checked = 0
    for entries in histories.values():
        dates = [e["date"] for e in entries if e["date"]]
        if len(dates) > 1:
            assert dates == sorted(dates, reverse=True)
            checked += 1
    assert checked > 50


def test_known_card_returns_its_entries():
    histories = _card_histories()
    card_id = next(iter(histories))
    assert get_card_history(card_id.lower()) == histories[card_id]


def test_unknown_card_404s():
    with pytest.raises(HTTPException) as exc:
        get_card_history("NOT_A_REAL_CARD")
    assert exc.value.status_code == 404


def test_starter_variants_have_history():
    # Duplicate-named starters resolve to per-character wiki pages
    # (e.g. "Strike (Ironclad)"), which regressed once already.
    histories = _card_histories()
    assert "STRIKE_IRONCLAD" in histories
    assert "DEFEND_IRONCLAD" in histories
