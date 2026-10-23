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


def test_every_party_size_the_page_sends_has_a_board(lb_lake):
    from app.services.runs_db_mongo import _leaderboard_key

    boards = ls.leaderboard_boards()
    for cat in ("fastest", "highest_ascension"):
        for pl in ("1", "2", "3", "4", "multi"):
            assert (
                _leaderboard_key(category=cat, players=pl, game_mode="standard")
                in boards
            )
    assert boards["fastest|_|2|standard"]["runs"][0]["run_hash"] == "w2"
    assert boards["fastest|_|multi|standard"]["total"] == 1
    assert _leaderboard_key(players="1") == _leaderboard_key(players="single")


def test_stored_board_serves_any_page_it_holds():
    from app.services.runs_db_mongo import _slice_board

    doc = {
        "_id": "k",
        "updated_at": 1,
        "runs": [{"run_hash": f"r{i}"} for i in range(45)],
        "total": 45,
        "category": "fastest",
    }
    p1 = _slice_board(doc, 1, 20)
    assert [r["run_hash"] for r in p1["runs"]] == [f"r{i}" for i in range(20)]
    assert (p1["page"], p1["per_page"], p1["total_pages"]) == (1, 20, 3)
    p3 = _slice_board(doc, 3, 20)
    assert [r["run_hash"] for r in p3["runs"]] == ["r40", "r41", "r42", "r43", "r44"]
    assert _slice_board(doc, 4, 20)["runs"] == []
    assert "_id" not in p1 and "updated_at" not in p1
    partial = {"runs": [{"run_hash": f"r{i}"} for i in range(50)], "total": 900}
    assert _slice_board(partial, 2, 20) is not None
    assert _slice_board(partial, 3, 20) is None
