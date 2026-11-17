"""A character part in a scores bracket serves that character's seats."""

import pytest

from app.services import lake_stats
from app.services import run_entity_stats as res

FOLD = {
    "entries": {"BASH": (1000, 300), "DREDGE": (800, 400)},
    "total_runs": 5000,
    "total_seats": 5000,
    "parsed": ("standard", "1", None, None),
}
CHARS = {
    "BASH": {"IRONCLAD": (900, 280, 0, 0, 0)},
    "DREDGE": {"FOOL": (400, 240, 0, 0, 0), "IRONCLAD": (0, 0, 0, 0, 0)},
    "NOSTALGIA": {"FOOL": (100, 40, 0, 0, 0)},
}


@pytest.fixture
def lake(monkeypatch):
    monkeypatch.setattr(res, "_maybe_rebuild", lambda: None)
    monkeypatch.setattr(res, "_official_entity_ids", lambda _t: frozenset())
    monkeypatch.setattr(res, "_non_reward_card_ids", lambda: frozenset())
    monkeypatch.setattr(lake_stats, "entity_bracket_fold", lambda _t, _b: FOLD)
    monkeypatch.setattr(lake_stats, "entity_character_fold", lambda _t, _b: CHARS)
    monkeypatch.setattr(
        lake_stats,
        "bracket_elo_for",
        lambda *_a: {"DREDGE": 1500.0} if _a[2:] else None,
    )


def test_split_bracket_character(monkeypatch):
    monkeypatch.setattr(
        lake_stats, "_CHARACTER_KEYS", frozenset({"fool", "ironclad", "silent"})
    )
    assert res.split_bracket_character("solo:standard:fool:v0.113.1") == (
        "solo:standard:v0.113.1",
        "FOOL",
    )
    assert res.split_bracket_character("fool") == ("all", "FOOL")
    assert res.split_bracket_character("solo:a10") == ("solo:a10", None)
    assert res.split_bracket_character(None) == (None, None)
    with pytest.raises(res.UnknownBracket):
        res.split_bracket_character("fool:ironclad")


def test_character_bracket_serves_only_that_characters_seats(lake):
    out = res.get_all_entity_scores(
        "cards", bracket="solo:standard", bracket_character="FOOL"
    )
    assert set(out) == {"DREDGE", "NOSTALGIA"}
    assert out["DREDGE"]["picks"] == 400 and out["DREDGE"]["wins"] == 240
    assert out["DREDGE"]["win_rate"] == 60.0
    assert out["DREDGE"]["pick_rate"] == 8.0
    assert out["DREDGE"]["elo"] == 1500.0
    assert out["NOSTALGIA"]["elo"] is None
    assert out["DREDGE"]["score"] > out["NOSTALGIA"]["score"]


def test_character_alone_folds_every_run(lake):
    out = res.get_all_entity_scores("cards", bracket_character="ironclad")
    assert set(out) == {"BASH"}


def test_character_without_a_cube_is_empty_not_all_runs(lake, monkeypatch):
    monkeypatch.setattr(lake_stats, "entity_bracket_fold", lambda _t, _b: None)
    assert res.get_all_entity_scores("cards", bracket_character="FOOL") == {}


def test_plain_bracket_is_unchanged(lake):
    out = res.get_all_entity_scores("cards", bracket="solo:standard")
    assert out["BASH"]["picks"] == 1000 and out["BASH"]["pick_rate"] == 20.0
