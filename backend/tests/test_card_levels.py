"""A card's base and upgraded holders each get their own win rate, per
bracket, next to the merged row."""

from app.services.run_entity_stats import _levels_block


def test_no_counts_means_no_block():
    assert _levels_block(None) is None
    assert _levels_block([]) is None
    assert _levels_block([0, 0, 0, 0]) is None


def test_each_side_carries_its_own_win_rate():
    block = _levels_block([10, 4, 5, 4])
    assert block["base"]["picks"] == 10
    assert block["base"]["win_rate"] == 40.0
    assert block["upgraded"]["picks"] == 5
    assert block["upgraded"]["win_rate"] == 80.0
    assert block["upgraded"]["win_rate_ci"] is not None


def test_a_card_nobody_upgraded_has_only_the_base_side():
    block = _levels_block([7, 2, 0, 0])
    assert block["base"]["wins"] == 2
    assert block["upgraded"] is None
