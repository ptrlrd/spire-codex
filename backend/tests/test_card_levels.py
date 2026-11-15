"""A card's base and upgraded holders each get their own win rate, per
bracket, next to the merged row."""

from app.services.run_entity_stats import _levels_block, _upgraded_row


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


def test_upgraded_copies_get_their_own_row():
    upg = _levels_block([10, 4, 5, 4])["upgraded"]
    row = _upgraded_row("ECHO_FORM", upg, 0.3, None, 200)
    assert row["id"] == "ECHO_FORM"
    assert row["upgraded"] is True
    assert (row["picks"], row["wins"], row["losses"]) == (5, 4, 1)
    assert row["win_rate"] == 80.0
    assert row["hold_rate"] == 2.5
    assert row["pick_rate"] is None and row["lift"] is None and row["elo"] is None


def test_a_card_nobody_upgraded_gets_no_extra_row():
    assert _upgraded_row("BASH", None, 0.3, None, 200) is None
    assert (
        _upgraded_row("BASH", _levels_block([7, 2, 0, 0])["upgraded"], 0.3, None, 200)
        is None
    )
