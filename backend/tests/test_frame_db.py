"""frame_query must keep the old Python filter's exact semantics."""

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


def _users(fq):
    return {u for (u,) in fq.run(f"SELECT username FROM {fq.src}")}


def test_no_filters_returns_everything(frame_db):
    assert cs.frame_count(cs.frame_query(None, None, None, None)) == len(_rows())


def test_positional_order_matches_constants(frame_db):
    r = frame_db.execute(
        f"SELECT {cs._FRAME_SELECT} FROM frame WHERE game_mode = 'daily'"
    ).fetchone()
    assert r[cs.CHAR] == "REGENT"
    assert r[cs.USER] == "newbie"
    assert r[cs.PLAYERS] == 1
    assert r[cs.BUILD] == "0.111.0"


def test_axis_filters(frame_db):
    assert cs.frame_count(cs.frame_query(2, None, None, None)) == 6
    assert cs.frame_count(cs.frame_query(None, 3, None, None)) == 1
    assert cs.frame_count(cs.frame_query(None, None, None, "Ace ")) == 7
    fq = cs.frame_query(None, None, None, None, build_id="0.112.0")
    assert cs.frame_count(fq) == 1


def test_a10_bracket_floors_ascension(frame_db):
    fq = cs.frame_query(None, None, None, None, bracket="a10")
    assert cs.frame_count(fq) == len(_rows()) - 1
    assert fq.run(f"SELECT min(ascension) FROM {fq.src}") == [(10,)]


def test_wr_bracket_strict_threshold_and_run_floor(frame_db):
    # ace: 4/7 overall (57.1%) passes wr50; mid: 3/6 (50.0%) fails the
    # strict >; newbie: 2 runs, under the 5-run floor.
    fq = cs.frame_query(None, None, None, None, bracket="wr50")
    assert _users(fq) == {"ace"}
    assert fq.run(f"SELECT min(ascension) FROM {fq.src}") == [(10,)]


def test_unloaded_frame_returns_empty(monkeypatch):
    monkeypatch.setattr(cs, "_FRAME_DB", None)
    fq = cs.frame_query(None, None, None, None)
    assert cs.frame_count(fq) == 0
    assert cs.winrate_by_floor(fq, "character") == []
