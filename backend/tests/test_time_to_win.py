"""The time-to-win chart answers "how long does it take to beat a run": wins
only, zero/missing timers excluded, average and median in the series label."""

import pytest

from app.services import charts_stats as cs


def _row(win: bool, minutes: float, day: int = 0) -> tuple:
    r = ["IRONCLAD", 0, 10, "standard", 1, 0, 40, 30, 12, 0, "", 0, 3, "", "", 0]
    r[cs.WIN] = 1 if win else 0
    r[cs.TIME] = int(minutes * 60)
    r[cs.DAY] = day
    return tuple(r)


@pytest.fixture()
def frame(monkeypatch):
    def load(rows):
        con, _n = cs._frame_db(rows)
        monkeypatch.setattr(cs, "_FRAME_DB", con)
        return cs.frame_query(None, None, None, None)

    return load


def test_time_to_win_wins_only_with_avg_and_median(frame):
    rows = [_row(True, 40)] * 10 + [_row(True, 50)] * 10 + [_row(True, 90)]
    rows += [_row(False, 300)] * 30  # losses never count
    rows += [_row(True, 0)] * 30  # missing timers never count

    series = cs.time_to_win(frame(rows), "")

    assert len(series) == 2
    s = series[0]
    assert s["id"] == "ALL"
    assert s["total"] == 21
    # (10*40 + 10*50 + 90) / 21; the odd-count middle (index 10) is 50.
    assert s["avg_minutes"] == 47.1
    assert s["median_minutes"] == 50.0
    assert "avg 47m" in s["label"] and "median 50m" in s["label"]
    assert [p["x"] for p in s["points"]] == [40, 50, 90]
    assert s["points"][0]["n"] == 10
    assert series[1]["id"] == "IRONCLAD"


def test_time_to_win_even_median_averages_the_middle_pair(frame):
    rows = [_row(True, 40)] * 10 + [_row(True, 61)] * 10

    s = cs.time_to_win(frame(rows), "players")[0]

    assert s["median_minutes"] == 50.5
    assert s["avg_minutes"] == 50.5


def test_time_to_win_needs_min_sample(frame):
    rows = [_row(True, 40)] * (cs.MIN_POINT_N - 1)
    assert cs.time_to_win(frame(rows), "") == []


def test_daily_average_win_time_drops_thin_days(frame):
    day = 20675  # 2026-08-10 as an epoch day
    rows = [_row(True, 40, day)] * 10 + [_row(True, 60, day)] * 10
    rows += [_row(False, 300, day)] * 25  # losses never count
    rows += [_row(True, 55, day + 1)] * 9  # 9 wins: under the 10-win floor

    series = cs.time_to_win_daily(frame(rows), "players")

    assert len(series) == 2
    points = series[0]["points"]
    assert len(points) == 1
    assert points[0]["x"] == "2026-08-10"
    assert points[0]["y"] == 50.0
    assert points[0]["n"] == 20
