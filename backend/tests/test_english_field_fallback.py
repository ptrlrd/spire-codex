"""Text a language leaves blank is filled from English per field, and rows a
language lacks altogether are served in English."""

from fastapi.testclient import TestClient

from app.main import app
from app.services import data_service

client = TestClient(app, raise_server_exceptions=False)


def test_blank_fields_and_missing_dict_keys_are_filled():
    rows = [
        {"id": "A", "description": "", "quotes": {"x": "ก", "y": ""}, "name": ""},
        {"id": "B", "description": "ข", "quotes": None},
    ]
    english = [
        {
            "id": "A",
            "description": "Alpha",
            "quotes": {"x": "X", "y": "Y", "z": "Z"},
            "name": "A",
        },
        {"id": "B", "description": "Beta", "quotes": {"x": "X"}},
        {"id": "C", "description": "Gamma"},
    ]
    out = data_service._fill_from_english(rows, english, ("description", "quotes"))
    assert out == [
        {
            "id": "A",
            "description": "Alpha",
            "quotes": {"x": "ก", "y": "Y", "z": "Z"},
            "name": "",
        },
        {"id": "B", "description": "ข", "quotes": {"x": "X"}},
        {"id": "C", "description": "Gamma"},
    ]
    assert rows[0]["description"] == ""


def test_complete_rows_are_returned_as_they_are():
    rows = [{"id": "A", "description": "ก"}]
    out = data_service._fill_from_english(
        rows, [{"id": "A", "description": "Alpha"}], ("description",)
    )
    assert out[0] is rows[0]


def _by_id(path):
    r = client.get(path)
    assert r.status_code == 200
    return {row["id"]: row for row in r.json()}


def test_thai_characters_and_events_have_no_blank_descriptions():
    for entity in ("characters", "events"):
        eng = _by_id(f"/api/{entity}?lang=eng")
        tha = _by_id(f"/api/{entity}?lang=tha")
        assert tha.keys() == eng.keys()
        assert all(tha[i]["description"] for i in eng if eng[i]["description"])


def test_thai_epochs_have_english_descriptions_where_the_game_has_none():
    eng = _by_id("/api/epochs?lang=eng")
    tha = _by_id("/api/epochs?lang=tha")
    assert all(tha[i]["description"] for i in eng if eng[i]["description"])


def test_thai_badges_include_the_ones_the_game_left_untranslated():
    assert (
        _by_id("/api/badges?lang=tha").keys() == _by_id("/api/badges?lang=eng").keys()
    )


def test_translated_text_is_left_alone():
    deu = _by_id("/api/characters?lang=deu")
    eng = _by_id("/api/characters?lang=eng")
    assert all(deu[i]["description"] != eng[i]["description"] for i in eng)
