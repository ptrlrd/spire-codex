"""SQL filter_rows must keep the old Python filter's exact semantics."""

import pytest

from app.services import charts_stats as cs


def _row(char, win, asc, mode, players, user, build="0.111.0", day=20600):
    return (
        char,
        win,
        asc,
        mode,
        players,
        3600,
        45,
        30,
        12,
        day,
        user,
        0,
        3,
        "",
        build,
        day,
    )


def _rows():
    out = []
    out += [_row("IRONCLAD", 1, 10, "standard", 1, "ace") for _ in range(4)]
    out += [_row("SILENT", 0, 10, "standard", 1, "ace") for _ in range(2)]
    out += [_row("DEFECT", 1, 10, "standard", 2, "mid") for _ in range(3)]
    out += [_row("DEFECT", 0, 10, "standard", 2, "mid") for _ in range(3)]
    out += [_row("REGENT", 1, 10, "daily", 1, "newbie") for _ in range(2)]
    out += [_row("IRONCLAD", 0, 3, "standard", 1, "ace", build="0.112.0")]
    return out


@pytest.fixture()
def frame_db(monkeypatch, tmp_path):
    monkeypatch.setattr(cs, "_FRAME_PARQUET", tmp_path / "missing.parquet")
    monkeypatch.setattr(cs, "_load_frame_from_db", _rows)
    con, count = cs._load_frame()
    monkeypatch.setattr(cs, "_FRAME_DB", con)
    monkeypatch.setattr(cs, "_FRAME_ROWS", count)
    yield con
    con.close()


def test_no_filters_returns_everything(frame_db):
    assert len(cs.filter_rows(len(_rows()), None, None, None, None)) == len(_rows())


def test_positional_order_matches_constants(frame_db):
    r = cs.filter_rows(1, None, None, "daily", None)[0]
    assert r[cs.CHAR] == "REGENT"
    assert r[cs.USER] == "newbie"
    assert r[cs.PLAYERS] == 1
    assert r[cs.BUILD] == "0.111.0"


def test_axis_filters(frame_db):
    assert len(cs.filter_rows(1, 2, None, None, None)) == 6
    assert len(cs.filter_rows(1, None, 3, None, None)) == 1
    assert len(cs.filter_rows(1, None, None, None, "Ace ")) == 7
    assert len(cs.filter_rows(1, None, None, None, None, build_id="0.112.0")) == 1


def test_a10_bracket_floors_ascension(frame_db):
    rows = cs.filter_rows(1, None, None, None, None, bracket="a10")
    assert len(rows) == len(_rows()) - 1
    assert all(r[cs.ASC] >= 10 for r in rows)


def test_wr_bracket_strict_threshold_and_run_floor(frame_db):
    # ace: 4/7 overall (57.1%) passes wr50; mid: 3/6 (50.0%) fails the
    # strict >; newbie: 2 runs, under the 5-run floor.
    rows = cs.filter_rows(1, None, None, None, None, bracket="wr50")
    users = {r[cs.USER] for r in rows}
    assert users == {"ace"}
    assert all(r[cs.ASC] >= 10 for r in rows)


def test_unloaded_frame_returns_empty(monkeypatch):
    monkeypatch.setattr(cs, "_FRAME_DB", None)
    assert cs.filter_rows(0, None, None, None, None) == []
