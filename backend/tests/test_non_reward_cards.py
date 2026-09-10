"""Cards that never come from a card-reward screen must not be ranked: not
in the metrics table, not in the tier list, not in the Elo pair walk. An
Ancient-rarity card offered once by an event sat at the top of the solo A10
metrics table with an Elo built on that one sighting."""

from app.services import lake_stats
from app.services import run_entity_stats as res

CARDS = [
    {"id": "ADRENALINE", "rarity": "Rare", "color": "silent"},
    {"id": "SUPPRESS", "rarity": "Ancient", "color": "silent"},
    {"id": "STRIKE_IRONCLAD", "rarity": "Basic", "color": "red"},
    {"id": "SHIV", "rarity": "Common", "color": "token"},
    {"id": "DOUBT", "rarity": "Curse", "color": "curse"},
]


def _catalog(monkeypatch):
    monkeypatch.setattr(res, "_cards_both_channels", lambda: CARDS)
    for name in (
        "_excluded_card_ids_cache",
        "_starter_card_ids_cache",
        "_token_card_ids_cache",
        "_ancient_card_ids_cache",
        "_multiplayer_card_ids_cache",
    ):
        monkeypatch.setattr(res, name, None)


def test_non_reward_set_covers_every_unpickable_kind(monkeypatch):
    _catalog(monkeypatch)
    ids = res._non_reward_card_ids()
    assert {"SUPPRESS", "STRIKE_IRONCLAD", "SHIV", "DOUBT"} <= ids
    assert "ADRENALINE" not in ids


def test_metrics_table_drops_ancient_and_starter_rows_on_the_lake_path(monkeypatch):
    _catalog(monkeypatch)
    monkeypatch.setattr(res, "_maybe_rebuild", lambda: None)
    monkeypatch.setattr(res, "_official_entity_ids", lambda _t: frozenset())
    fold = {
        "entries": {
            "SUPPRESS": (2417, 801),
            "STRIKE_IRONCLAD": (5000, 1500),
            "ADRENALINE": (7690, 3211),
        },
        "offers": {"ADRENALINE": {"offered": 9761, "picked": 7205}},
        "total_runs": 247991,
        "parsed": ("solo", "1", 0, None),
    }
    monkeypatch.setattr(lake_stats, "entity_bracket_fold", lambda _t, _b: fold)
    monkeypatch.setattr(
        lake_stats,
        "bracket_elo_for",
        lambda _b: {"SUPPRESS": 2322.4, "ADRENALINE": 2236.8},
    )
    out = res.get_entity_metrics_table("cards", "solo:a10")
    assert [r["id"] for r in out["rows"]] == ["ADRENALINE"]


def test_reward_screen_walk_skips_ancient_cards(monkeypatch):
    _catalog(monkeypatch)
    blob = {
        "map_point_history": [
            [
                {
                    "player_stats": [
                        {
                            "card_choices": [
                                {"card": {"id": "CARD.SUPPRESS"}, "was_picked": True},
                                {
                                    "card": {"id": "CARD.ADRENALINE"},
                                    "was_picked": False,
                                },
                                {
                                    "card": {"id": "CARD.STRIKE_IRONCLAD"},
                                    "was_picked": False,
                                },
                            ]
                        }
                    ]
                }
            ]
        ]
    }
    screens = list(res._walk_card_reward_screens(blob))
    assert screens == [(0, [], ["ADRENALINE"])]
