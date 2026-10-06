"""Runs abandoned by floor 5 drop out of every stat except headline totals
and run-count charts; later abandons and real early deaths stay in."""

import duckdb

from app.services import charts_stats as cs
from app.services import lake_stats as ls

RUNS = [
    ("neow", True, 1, False),
    ("quick", True, 5, False),
    ("late", True, 6, False),
    ("early_death", False, 3, False),
    ("win", False, 40, True),
]


def _lake(tmp_path, with_scalars=True):
    con = duckdb.connect()
    rows = ", ".join(
        f"('{h}', {str(a).lower()}, {str(w).lower()})" for h, a, _f, w in RUNS
    )
    con.execute(
        f"""COPY (SELECT h AS run_hash, 'IRONCLAD' AS character, 0 AS ascension,
          w AS win, a AS was_abandoned FROM (VALUES {rows}) t(h, a, w))
        TO '{tmp_path}/runs.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"COPY (SELECT 'none' AS run_hash WHERE false) TO '{tmp_path}/excluded.parquet' (FORMAT parquet)"
    )
    if with_scalars:
        sc = ", ".join(f"('{h}', {f})" for h, _a, f, _w in RUNS)
        con.execute(
            f"""COPY (SELECT * FROM (VALUES {sc}) t(run_hash, floors_reached))
            TO '{tmp_path}/run_scalars.parquet' (FORMAT parquet)"""
        )
    con.close()


def _eligible(tmp_path):
    con = duckdb.connect()
    con.execute(ls._eligible_sql(tmp_path))
    out = {r[0] for r in con.execute("SELECT run_hash FROM eligible").fetchall()}
    con.close()
    return out


def test_eligible_drops_only_short_abandons(tmp_path):
    _lake(tmp_path)
    assert _eligible(tmp_path) == {"late", "early_death", "win"}


def test_lake_without_scalars_keeps_every_run(tmp_path):
    _lake(tmp_path, with_scalars=False)
    assert _eligible(tmp_path) == {h for h, *_ in RUNS}


def _row(abandoned, floors, user="ace"):
    base = (
        "IRONCLAD",
        0,
        10,
        "standard",
        1,
        3600,
        floors,
        30,
        12,
        20600,
        user,
        abandoned,
        1,
        "",
        "0.111.0",
        20600,
    )
    return base[: len(cs._FRAME_SELECT.split(","))]


def _frame(monkeypatch, rows):
    con = cs._new_frame_db()
    con.execute(f"CREATE TABLE frame ({cs._FRAME_COLS})")
    con.executemany(f"INSERT INTO frame VALUES ({', '.join('?' * len(rows[0]))})", rows)
    count = cs._finish_frame_db(con)
    monkeypatch.setattr(cs, "_FRAME_DB", con)
    monkeypatch.setattr(cs, "_FRAME_ROWS", count)
    return con


def test_charts_skip_short_abandons_unless_counting_runs(monkeypatch):
    rows = [_row(1, 1), _row(1, 5), _row(1, 6), _row(0, 2)]
    _frame(monkeypatch, rows)
    kept = cs.filter_rows(4, None, None, None, None)
    assert sorted(r[cs.FLOORS] for r in kept) == [2, 6]
    every = cs.filter_rows(4, None, None, None, None, include_short_abandons=True)
    assert len(every) == 4


def test_skill_tiers_ignore_short_abandons(monkeypatch):
    rows = [_row(1, 1, "quitter")] * 10 + [_row(0, 2, "quitter")] * 4
    con = _frame(monkeypatch, rows)
    assert (
        con.execute("SELECT t FROM frame_wr WHERE username = 'quitter'").fetchone()
        is None
    )
