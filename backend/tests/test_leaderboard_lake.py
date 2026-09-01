"""Lake-built leaderboard boards mirror the legacy shape."""

import duckdb
import pytest

from app.services import lake_stats as ls


@pytest.fixture()
def lb_lake(tmp_path, monkeypatch):
    con = duckdb.connect()
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('w1', 'IRONCLAD', true, 10, 'standard', 1, 900,
         TIMESTAMP '2026-08-30 05:00:00', false, '0.111.0', false),
        ('w2', 'IRONCLAD', true, 10, 'standard', 2, 600,
         TIMESTAMP '2026-08-30 06:00:00', false, '0.111.0', false),
        ('w3', 'SILENT', true, 4, 'standard', 1, 500,
         TIMESTAMP '2026-08-30 07:00:00', false, '0.111.0', false),
        ('l1', 'IRONCLAD', false, 10, 'standard', 1, 100,
         TIMESTAMP '2026-08-30 08:00:00', false, '0.111.0', false),
        ('h1', 'IRONCLAD', true, 10, 'standard', 1, 100,
         TIMESTAMP '2026-08-30 09:00:00', false, '0.111.0', false),
        ('m1', 'MODDED_GUY', true, 10, 'standard', 1, 50,
         TIMESTAMP '2026-08-30 10:00:00', false, '0.111.0', false))
        t(run_hash, character, win, ascension, game_mode, player_count,
          run_time, submitted_at, was_abandoned, build_id, hidden))
        TO '{tmp_path}/runs.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES ('h1'))
        t(run_hash)) TO '{tmp_path}/excluded.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('w1', 45, 30, 12, 'yitsy'), ('w2', 40, 25, 10, 'other'),
        ('w3', 50, 20, 8, 'sneak'), ('m1', 9, 9, 9, 'moddy'))
        t(run_hash, floors_reached, deck_size, relic_count, username))
        TO '{tmp_path}/run_scalars.parquet' (FORMAT parquet)"""
    )
    con.close()
    monkeypatch.setattr(ls, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(ls, "available", lambda *a: True)
    yield tmp_path


def test_boards_shape_and_filters(lb_lake):
    boards = ls.leaderboard_boards()
    assert boards is not None

    fastest_all = boards["fastest|_|_|_"]
    # Modded character and the hidden run are out; sorted by run_time asc.
    hashes = [r["run_hash"] for r in fastest_all["runs"]]
    assert hashes == ["w3", "w2", "w1"]
    assert fastest_all["total"] == 3
    assert fastest_all["category"] == "fastest"
    row = fastest_all["runs"][0]
    assert row["win"] == 1
    assert row["username"] == "sneak"
    assert row["floors_reached"] == 50
    assert row["submitted_at"].startswith("2026-08-30T07:00")

    solo = boards["fastest|_|single|standard"]
    assert [r["run_hash"] for r in solo["runs"]] == ["w3", "w1"]

    iron = boards["fastest|IRONCLAD|_|_"]
    assert [r["run_hash"] for r in iron["runs"]] == ["w2", "w1"]

    high = boards["highest_ascension|IRONCLAD|_|_"]
    assert [r["run_hash"] for r in high["runs"]] == ["w2", "w1"]
