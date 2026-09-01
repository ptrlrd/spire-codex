"""Entity membership is run-set: copies and co-op duplicates count once."""

import duckdb
import pytest

from app.services import lake_stats as ls


@pytest.fixture()
def member_lake(tmp_path):
    con = duckdb.connect()
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('r1', 'IRONCLAD', true, 10, 'standard', 2, 'yitsy',
         TIMESTAMP '2026-08-30 05:00:00', '0.111.0'),
        ('r2', 'SILENT', false, 0, 'standard', 1, 'other',
         TIMESTAMP '2026-08-30 06:00:00', '0.111.0'))
        t(run_hash, character, win, ascension, game_mode, player_count,
          username, submitted_at, build_id))
        TO '{tmp_path}/runs.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES ('none'))
        t(run_hash)) TO '{tmp_path}/excluded.parquet' (FORMAT parquet)"""
    )
    # r1: three Strikes on player 1 plus one on player 2 (co-op duplicate),
    # and one Bash. r2: one Strike.
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('r1', 1, 'IRONCLAD', 'STRIKE'),
        ('r1', 1, 'IRONCLAD', 'STRIKE'),
        ('r1', 1, 'IRONCLAD', 'STRIKE'),
        ('r1', 2, 'DEFECT', 'STRIKE'),
        ('r1', 1, 'IRONCLAD', 'BASH'),
        ('r2', 1, 'SILENT', 'STRIKE'))
        t(run_hash, player_idx, character, card))
        TO '{tmp_path}/deck.parquet' (FORMAT parquet)"""
    )
    con.execute(ls._ELIGIBLE_SQL.format(lake=tmp_path))
    con.execute(ls._CELLS_SQL.format(lake=tmp_path))
    yield con, tmp_path
    con.close()


def test_store_membership_is_run_set(member_lake):
    con, lake = member_lake
    rows = con.execute(
        ls._MEMBERSHIP_SQL.format(col="card", table="deck", lake=lake)
    ).fetchall()
    by_card = {}
    for cid, char, picks, wins, _ts, _hash in rows:
        agg = by_card.setdefault(cid, {"picks": 0, "wins": 0, "chars": {}})
        agg["picks"] += picks
        agg["wins"] += wins
        agg["chars"][char] = (picks, wins)
    assert by_card["STRIKE"]["picks"] == 2
    assert by_card["STRIKE"]["wins"] == 1
    # Attribution is the run's character, not each holder's.
    assert by_card["STRIKE"]["chars"] == {"IRONCLAD": (1, 1), "SILENT": (1, 0)}
    assert by_card["BASH"]["picks"] == 1


def test_cube_membership_is_run_set(member_lake):
    con, lake = member_lake
    rows = con.execute(
        ls._CUBE_MEMBERSHIP_SQL.format(col="card", table="deck", lake=lake)
    ).fetchall()
    strike = [(cell, ch, p, w) for cell, cid, ch, p, w in rows if cid == "STRIKE"]
    assert sum(p for _, _, p, _ in strike) == 2
    assert sum(w for _, _, _, w in strike) == 2 - 1
    assert {ch for _, ch, _, _ in strike} == {"IRONCLAD", "SILENT"}
