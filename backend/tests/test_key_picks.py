"""Run-list rows show the rarest picks and the deepest boss fight."""

from app.services import key_picks as kp


def _ranks(monkeypatch):
    monkeypatch.setattr(
        kp,
        "_ranks",
        lambda: (
            {
                "BASH": 0,
                "STRIKE_IRONCLAD": 0,
                "ANGER": 1,
                "OFFERING": 4,
                "FEED": 4,
                "SHRUG": 3,
            },
            {"BURNING_BLOOD": 0, "AKABEKO": 3, "VAJRA": 1, "NEOWS_TORMENT": 5},
        ),
    )


def test_rarest_first_newest_breaks_ties_no_basics(monkeypatch):
    _ranks(monkeypatch)
    deck = [
        {"id": "STRIKE_IRONCLAD", "floor_added": 1},
        {"id": "BASH", "floor_added": 1},
        {"id": "ANGER", "floor_added": 3},
        {"id": "OFFERING", "floor_added": 10},
        {"id": "FEED", "floor_added": 20, "upgraded": False},
        {"id": "FEED", "floor_added": 22, "upgraded": True},
        {"id": "SHRUG", "floor_added": 5},
    ]
    relics = [
        {"id": "BURNING_BLOOD", "floor_added": 1},
        {"id": "VAJRA", "floor_added": 4},
        {"id": "AKABEKO", "floor_added": 9},
        {"id": "NEOWS_TORMENT", "floor_added": 1},
    ]
    cards, rel = kp.key_picks(deck, relics, n=3)
    assert cards == [
        {"id": "FEED", "upgraded": True},
        {"id": "OFFERING", "upgraded": False},
        {"id": "SHRUG", "upgraded": False},
    ]
    assert rel == ["NEOWS_TORMENT", "AKABEKO", "VAJRA"]


def test_last_bosses(monkeypatch):
    monkeypatch.setattr(kp, "_boss_monsters", lambda: {"QUEEN_BOSS": "QUEEN"})
    rooms = [["ENCOUNTER.A_BOSS"], [], ["ENCOUNTER.QUEEN_BOSS", "ENCOUNTER.B_BOSS"]]
    assert kp.last_bosses(rooms) == [
        {"id": "QUEEN_BOSS", "monster": "QUEEN"},
        {"id": "B_BOSS", "monster": "B"},
    ]
    assert kp.last_bosses([["ENCOUNTER.A_BOSS"], []]) == [
        {"id": "A_BOSS", "monster": "A"}
    ]
    assert kp.last_bosses(None) == [] and kp.last_bosses([[], "x"]) == []
