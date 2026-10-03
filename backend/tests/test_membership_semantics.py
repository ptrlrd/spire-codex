"""Entity membership is seat-set: copies on one seat count once, every seat
of a co-op run counts, and the character is the seat's own."""

import duckdb
import pytest

from app.services import lake_stats as ls


@pytest.fixture()
def member_lake(tmp_path, monkeypatch):
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
    con.execute(
        f"""COPY (SELECT * FROM (VALUES ('r1', 0, 1), ('r2', 0, 1))
        t(run_hash, act, floor_idx))
        TO '{tmp_path}/floors.parquet' (FORMAT parquet)"""
    )
    con.execute(ls._ELIGIBLE_SQL.format(lake=tmp_path))
    con.execute(ls._CELLS_SQL.format(lake=tmp_path))
    monkeypatch.setattr(ls, "LAKE_DIR", tmp_path)
    ls._ensure_floor_curves(con)
    yield con, tmp_path
    con.close()


def test_store_membership_is_seat_set(member_lake):
    con, lake = member_lake
    rows = con.execute(
        ls._MEMBERSHIP_SQL.format(col="card", source=ls._source("deck"), where="")
    ).fetchall()
    by_card = {}
    for cid, char, picks, wins, _ts, _hash in rows:
        agg = by_card.setdefault(cid, {"picks": 0, "wins": 0, "chars": {}})
        agg["picks"] += picks
        agg["wins"] += wins
        agg["chars"][char] = (picks, wins)
    assert by_card["STRIKE"]["picks"] == 3
    assert by_card["STRIKE"]["wins"] == 2
    assert by_card["STRIKE"]["chars"] == {
        "IRONCLAD": (1, 1),
        "DEFECT": (1, 1),
        "SILENT": (1, 0),
    }
    assert by_card["BASH"]["picks"] == 1


def test_cube_membership_is_seat_set(member_lake):
    con, lake = member_lake
    rows = con.execute(ls._cube_membership_sql("card", "deck", "min(1)", "")).fetchall()
    strike = [r for r in rows if r[1] == "STRIKE"]
    assert sum(r[3] for r in strike) == 3
    assert sum(r[4] for r in strike) == 2
    assert {r[2] for r in strike} == {"IRONCLAD", "DEFECT", "SILENT"}
    assert all(r[5] == 0 for r in strike), "the only other run has another A10 flag"
