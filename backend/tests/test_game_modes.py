"""Blitz and Dread are their own modes, like the daily climb: they get a
bracket and a filter of their own and never count as standard runs."""

import duckdb
import pytest

from app.services import lake_stats as ls
from app.services import user_insights
from app.services.game_modes import (
    GAME_MODES,
    SEPARATE_MODES,
    is_game_mode_filter,
    normalize_game_mode,
)
from app.services.run_entity_stats import _run_extra_brackets, ensure_known_bracket


def test_the_filter_accepts_every_mode_and_nothing_else():
    for mode in ("standard", "daily", "custom", "blitz", "dread", None, ""):
        assert is_game_mode_filter(mode)
    for bad in ("Blitz", "endless", "standard ", "all"):
        assert not is_game_mode_filter(bad)
    assert set(SEPARATE_MODES) == set(GAME_MODES) - {"standard"}


def test_a_missing_mode_is_a_standard_run():
    assert normalize_game_mode(None) == "standard"
    assert normalize_game_mode("") == "standard"
    assert normalize_game_mode(" Blitz ") == "blitz"


@pytest.mark.parametrize("mode", ["blitz", "dread", "BLITZ", "some_future_mode"])
def test_only_standard_runs_land_in_the_standard_bracket(mode):
    assert "standard" not in _run_extra_brackets(1, 10, mode)


def test_new_modes_parse_as_lake_brackets():
    assert ls._parse_lake_bracket("blitz") == ("blitz", None, None, None)
    assert ls._parse_lake_bracket("dread:solo:a10") == ("dread", "1", 0, None)
    assert ls._parse_lake_bracket("blitz:v0.113.0") == (
        "blitz",
        None,
        None,
        "v0.113.0",
    )
    assert ls._parse_lake_bracket("blitz:dread") is None
    assert ls._parse_lake_bracket("endless") is None
    assert ensure_known_bracket("dread") == "dread"


@pytest.fixture()
def cells(tmp_path):
    con = duckdb.connect()
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('s1', 'IRONCLAD', true, 10, 'standard', 1, 'a', 'v0.113.0'),
        ('s2', 'IRONCLAD', false, 0, NULL, 1, 'b', 'v0.113.0'),
        ('d1', 'SILENT', true, 0, 'daily', 1, 'a', 'v0.113.0'),
        ('b1', 'IRONCLAD', true, 0, 'blitz', 1, 'a', 'v0.113.0'),
        ('b2', 'SILENT', true, 10, 'Blitz', 2, 'b', 'v0.113.0'),
        ('x1', 'IRONCLAD', false, 10, 'dread', 1, 'a', 'v0.113.0'))
        t(run_hash, character, win, ascension, game_mode, player_count,
          username, build_id))
        TO '{tmp_path}/runs.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"COPY (SELECT 'none' AS run_hash) TO '{tmp_path}/excluded.parquet'"
        " (FORMAT parquet)"
    )
    con.execute(ls._eligible_sql(tmp_path))
    con.execute(ls._cells_sql(tmp_path))
    rows = con.execute("SELECT run_hash, cell FROM cells").fetchall()
    con.close()
    return rows


def _runs_in(cells, bracket):
    mode, player, skill, version = ls._parse_lake_bracket(bracket)
    return sorted(
        run
        for run, cell in cells
        if ls._cell_matches(cell, mode, player, skill, version)
    )


def test_standard_bracket_leaves_the_other_modes_out(cells):
    assert _runs_in(cells, "standard") == ["s1", "s2"]
    assert _runs_in(cells, "standard:solo") == ["s1", "s2"]


def test_each_mode_has_its_own_bracket(cells):
    assert _runs_in(cells, "daily") == ["d1"]
    assert _runs_in(cells, "blitz") == ["b1", "b2"]
    assert _runs_in(cells, "blitz:solo") == ["b1"]
    assert _runs_in(cells, "dread") == ["x1"]
    assert _runs_in(cells, "dread:v0.113.0") == ["x1"]


def test_the_unfiltered_view_spans_every_mode_like_it_does_for_daily(cells):
    assert _runs_in(cells, "all") == ["b1", "b2", "d1", "s1", "s2", "x1"]


def test_profile_activity_counts_each_mode_apart():
    rows = [
        {"win": True, "submitted_at": "2026-11-10T10:00:00"},
        {"win": True, "submitted_at": "2026-11-10T11:00:00", "game_mode": "blitz"},
        {
            "win": False,
            "submitted_at": "2026-11-10T12:00:00",
            "game_mode": "dread",
            "player_count": 2,
        },
        {"win": False, "submitted_at": "2026-11-10T13:00:00", "game_mode": "daily"},
    ]
    (week,) = user_insights._activity(rows)
    assert week["runs"] == 4
    assert (week["solo"], week["coop"]) == (1, 0)
    assert (week["daily"], week["blitz"], week["dread"]) == (1, 1, 1)
