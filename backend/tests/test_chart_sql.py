"""Frame charts aggregate in SQL; these pin the bucket edges and series rules
the Python loops used to apply row by row."""

import pytest

from app.services import charts_stats as cs

CHARS = {"IRONCLAD": "Ironclad", "SILENT": "Silent"}


def _row(**kw) -> tuple:
    r = {
        "character": "IRONCLAD",
        "win": 0,
        "ascension": 10,
        "game_mode": "standard",
        "player_count": 1,
        "run_time": 1800,
        "floors_reached": 40,
        "deck_size": 30,
        "relic_count": 12,
        "played_day": 20600,
        "username": "ace",
        "was_abandoned": 0,
        "acts_completed": 2,
        "daily_date": "",
        "build_id": "v0.111.0",
        "upload_day": 20600,
    }
    r.update(kw)
    return tuple(r.values())


@pytest.fixture()
def frame(monkeypatch):
    monkeypatch.setattr(cs, "_official_characters", lambda: dict(CHARS))

    def load(rows, every=False):
        con, _n = cs._frame_db(rows)
        monkeypatch.setattr(cs, "_FRAME_DB", con)
        return cs.frame_query(None, None, None, None, include_short_abandons=every)

    return load


def test_run_minutes_buckets_match_the_minute_math(frame):
    rows = [_row(run_time=t) for t in (0, 299, 300, 14400, 14401, -5)] * 20
    series = cs.stat_histogram(frame(rows), "run_minutes", "players")
    assert [(p["x"], p["n"]) for p in series[0]["points"]] == [
        (0, 40),
        (5, 20),
        (240, 20),
    ]
    assert series[0]["total"] == 80
    bucket, in_range = cs._stat_buckets(cs.STATS["run_minutes"])
    for t in range(-60, 14461):
        v = t * (1 / 60)
        assert (0 <= v <= 240) == (0 <= t <= 14400)
        if 0 <= t <= 14400:
            assert int(v // 5) * 5 == (t // 300) * 5


def test_series_need_min_runs_and_modded_fold_into_all(frame):
    rows = [_row(character="IRONCLAD", win=1)] * 30
    rows += [_row(character="SILENT")] * 29
    rows += [_row(character="MODDED")] * 40
    series = cs.acts_funnel(frame(rows), "character")
    assert [(s["id"], s["label"], s["total"]) for s in series] == [
        ("ALL", "All characters", 99),
        ("IRONCLAD", "Ironclad", 30),
    ]
    assert series[0]["points"][-1] == {"x": "Won", "y": 30.3, "n": 30}


def test_players_cap_at_four_and_ascension_bands(frame):
    rows = [_row(player_count=5)] * 20 + [_row(player_count=4)] * 10
    rows += [_row(ascension=a) for a in range(11)] * 8
    fq = frame(rows)
    by_players = cs.acts_funnel(fq, "players")
    assert [s["id"] for s in by_players] == ["ALL", "P1", "P4"]
    by_asc = cs.acts_funnel(fq, "ascension")
    assert [(s["id"], s["total"]) for s in by_asc] == [
        ("ALL", 118),
        ("A1-A4", 32),
        ("A5-A9", 40),
        ("A10", 38),
    ]


def test_winrate_by_floor_counts_runs_that_reached_each_floor(frame):
    rows = [_row(floors_reached=70, win=1)] * 20
    rows += [_row(floors_reached=3)] * 20 + [_row(floors_reached=0)] * 20
    points = cs.winrate_by_floor(frame(rows), "outcome")[0]["points"]
    assert points[0] == {"x": 1, "y": 50.0, "n": 40}
    assert points[3] == {"x": 4, "y": 100.0, "n": 20}
    assert points[-1]["x"] == 60


def test_deaths_skip_wins_and_abandons(frame):
    rows = [_row(floors_reached=0)] * 15 + [_row(floors_reached=99)] * 5
    rows += [_row(win=1)] * 20 + [_row(was_abandoned=1)] * 20
    series = cs.deaths_by_floor(frame(rows), "outcome")
    assert [s["id"] for s in series] == ["ALL", "LOSS"]
    assert series[0]["points"] == [
        {"x": 1, "y": 75.0, "n": 15},
        {"x": 60, "y": 25.0, "n": 5},
    ]


def test_scatter_takes_every_stride_th_run_in_frame_order(frame):
    rows = [_row(deck_size=i % 97, floors_reached=i % 50) for i in range(1300)]
    series = cs.stat_scatter(frame(rows), "floors_reached", "deck_size", "players")
    assert [s["id"] for s in series] == ["P1"]
    s = series[0]
    assert s["sampled_from"] == 1300
    assert len(s["points"]) == 434
    assert s["points"][:2] == [{"x": 0, "y": 0, "win": 0}, {"x": 3, "y": 3, "win": 0}]
    assert s["points"][-1] == {"x": 1299 % 50, "y": 1299 % 97, "win": 0}


def test_scatter_falls_back_to_all_runs(frame):
    rows = [_row(run_time=125 + i) for i in range(10)]
    series = cs.stat_scatter(frame(rows), "run_minutes", "relic_count", "character")
    assert [(s["id"], s["label"], s["sampled_from"]) for s in series] == [
        ("ALL", "All runs", 10)
    ]
    assert series[0]["points"][0] == {"x": 2.08, "y": 12, "win": 0}


def test_hardest_dailies_keep_the_newest_dates_then_drop_thin_ones(frame):
    rows = []
    for d in range(1, 46):
        rows += [_row(daily_date=f"2026-08-{d:02d}", win=d % 2)] * (4 if d == 45 else 5)
    points = cs.hardest_dailies(frame(rows))[0]["points"]
    assert [p["x"] for p in points][0] == "2026-08-04"
    assert len(points) == 41
    assert points[-1] == {"x": "2026-08-44", "y": 0.0, "n": 5}


def test_short_abandons_only_reach_run_count_charts(frame):
    rows = [_row(was_abandoned=1, floors_reached=2)] * 20 + [_row()] * 20
    assert cs.frame_count(frame(rows)) == 20
    runs = cs.runs_over_time(frame(rows, every=True), "players")
    assert runs[0]["points"][0]["y"] == 40
