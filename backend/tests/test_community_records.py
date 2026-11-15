"""Community records (fastest win / longest run / biggest deck) must come
from standard, modifier-free runs: a custom game stacked with Sealed Deck /
Hoarder produces a multi-thousand-card deck that would hold the record
forever and read as modded data on /community-stats."""

from app.services import community_stats


def _fold(acc, blob, *, is_win=True, run_hash="r1"):
    community_stats._accumulate_one(
        acc,
        blob,
        run_hash=run_hash,
        is_win=is_win,
        character="ironclad",
        ascension=10,
    )


def test_custom_mode_runs_set_no_records():
    acc = community_stats._new_acc_one()
    _fold(
        acc,
        {
            "game_mode": "custom",
            "modifiers": [{"id": "MODIFIER.HOARDER"}],
            "run_time": 100,
            "players": [{"deck": [{}] * 2364}],
        },
    )
    assert acc["fastest_win"] is None
    assert acc["longest_run"] is None
    assert acc["biggest_deck"] is None


def test_modifiers_disqualify_even_standard_mode():
    acc = community_stats._new_acc_one()
    _fold(
        acc,
        {
            "game_mode": "standard",
            "modifiers": [{"id": "MODIFIER.SEALED_DECK"}],
            "run_time": 100,
            "players": [{"deck": [{}] * 999}],
        },
    )
    assert acc["biggest_deck"] is None


def test_standard_runs_still_hold_records():
    acc = community_stats._new_acc_one()
    _fold(
        acc,
        {"game_mode": "standard", "run_time": 1200, "players": [{"deck": [{}] * 40}]},
    )
    # Missing game_mode counts as standard (old blobs predate the field).
    _fold(
        acc,
        {"run_time": 900, "players": [{"deck": [{}] * 55}]},
        run_hash="r2",
    )
    assert acc["fastest_win"] == (900, "r2")
    assert acc["longest_run"] == (1200, "r1")
    assert acc["biggest_deck"] == (55, "r2")


def test_custom_run_cannot_beat_a_standard_record():
    acc = community_stats._new_acc_one()
    _fold(
        acc,
        {"game_mode": "standard", "run_time": 1200, "players": [{"deck": [{}] * 40}]},
    )
    _fold(
        acc,
        {"game_mode": "custom", "run_time": 60, "players": [{"deck": [{}] * 500}]},
        run_hash="r2",
    )
    assert acc["fastest_win"] == (1200, "r1")
    assert acc["biggest_deck"] == (40, "r1")


def _record_rows(tmp_path):
    import duckdb

    from app.services import lake_stats as ls

    con = duckdb.connect()
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('s1', 'IRONCLAD', true, 10, 'standard', 1, 'a', 'v1', 3000, false),
        ('b1', 'FOOL', true, 5, 'blitz', 1, 'a', 'v1', 700, false),
        ('b2', 'FOOL', true, 5, 'Blitz', 1, 'b', 'v1', 900, false),
        ('x1', 'FOOL', false, 10, 'dread', 1, 'a', 'v1', 500, false),
        ('c1', 'FOOL', true, 0, 'custom', 1, 'a', 'v1', 60, true),
        ('d1', 'FOOL', true, 0, 'daily', 1, 'a', 'v1', 90, true))
        t(run_hash, character, win, ascension, game_mode, player_count,
          username, build_id, run_time, has_modifiers))
        TO '{tmp_path}/runs.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('s1', 40), ('b1', 22), ('b2', 30), ('x1', 18), ('c1', 900), ('d1', 70))
        t(run_hash, deck_size))
        TO '{tmp_path}/players.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"COPY (SELECT 'none' AS run_hash) TO '{tmp_path}/excluded.parquet'"
        " (FORMAT parquet)"
    )
    con.execute(ls._eligible_sql(tmp_path))
    con.execute(ls._cells_sql(tmp_path))
    rows = con.execute(ls._records_sql(tmp_path)).fetchall()
    con.close()
    return {row[0].split("|", 1)[0]: row for row in rows}, ls


def test_blitz_and_dread_hold_their_own_records(tmp_path):
    by_mode, _ = _record_rows(tmp_path)
    assert set(by_mode) == {"standard", "blitz", "dread"}
    blitz = by_mode["blitz"]
    assert (blitz[2], blitz[3]) == (700, "b1")
    assert (blitz[4], blitz[5]) == (900, "b2")
    assert (blitz[6], blitz[7]) == (30, "b2")
    dread = by_mode["dread"]
    assert dread[2] is None
    assert (dread[4], dread[5]) == (500, "x1")


def test_an_all_modes_bracket_keeps_only_the_standard_records(tmp_path):
    _, ls = _record_rows(tmp_path)
    blitz = {"fastest_win": (700, "b1"), "longest_run": (900, "b2"), "total_runs": 2}
    kept = ls._scope_records("blitz|1|1|0|v1", blitz, "blitz")
    assert kept["fastest_win"] == (700, "b1")
    dropped = ls._scope_records("blitz|1|1|0|v1", blitz, None)
    assert dropped["fastest_win"] is None and dropped["longest_run"] is None
    assert dropped["total_runs"] == 2
    standard = {"fastest_win": (3000, "s1")}
    assert ls._scope_records("standard|1|1|0|v1", standard, None) == standard
