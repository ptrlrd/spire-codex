"""Review follow-ups: edge inputs the production parity run can't produce."""

import math
import threading

import pytest

from app.services import charts_stats as cs

CHARS = {"IRONCLAD": "Ironclad", "SILENT": "Silent"}
N = max(cs.MIN_SERIES_N, cs.MIN_POINT_N)


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

    def load(rows):
        con, _n = cs._frame_db(rows)
        monkeypatch.setattr(cs, "_FRAME_DB", con)
        return cs.frame_query(None, None, None, None)

    return load


def test_unloaded_frame_is_empty_not_a_crash(monkeypatch):
    monkeypatch.setattr(cs, "_FRAME_DB", None)
    fq = cs.frame_query(None, None, None, None)
    assert fq.run("SELECT count(*) FROM frame") == []
    assert cs.frame_count(fq) == 0
    assert cs.acts_funnel(fq, "character") == []
    assert cs.stat_scatter(fq, "floors_reached", "deck_size", "players") == []


def test_outcome_split_bool_keys_merge_into_all(frame):
    rows = [_row(win=1, floors_reached=10)] * N + [_row(win=0, floors_reached=10)] * N
    series = cs.winrate_by_stat(frame(rows), "floors_reached", "outcome")
    assert [(s["id"], s["points"]) for s in series] == [
        ("ALL", [{"x": 10, "y": 50.0, "n": 2 * N}]),
        ("WIN", [{"x": 10, "y": 100.0, "n": N}]),
        ("LOSS", [{"x": 10, "y": 0.0, "n": N}]),
    ]


def test_series_bounded_by_its_own_buckets_not_alls(frame):
    rows = [_row(win=1, floors_reached=60)] * N + [_row(win=0, floors_reached=3)] * N
    by_id = {s["id"]: s["points"] for s in cs.winrate_by_floor(frame(rows), "outcome")}
    assert by_id["WIN"][-1]["x"] == 60
    assert by_id["LOSS"][-1]["x"] == 3
    assert by_id["LOSS"][0] == {"x": 1, "y": 0.0, "n": N}
    assert by_id["ALL"][0] == {"x": 1, "y": 50.0, "n": 2 * N}


def test_scatter_stride_is_per_series_in_frame_order(frame):
    rows = [_row(deck_size=i) for i in range(1000)]
    rows += [
        _row(deck_size=1000 + i, player_count=4) for i in range(cs.MIN_SERIES_N + 5)
    ]
    series = cs.stat_scatter(frame(rows), "deck_size", "floors_reached", "players")
    assert [s["id"] for s in series] == ["P1", "P4"]
    stride = max(1, math.ceil(1000 / cs.SCATTER_PER_SERIES))
    assert series[0]["sampled_from"] == 1000
    assert [p["x"] for p in series[0]["points"]] == list(range(0, 1000, stride))
    n4 = cs.MIN_SERIES_N + 5
    assert series[1]["sampled_from"] == n4
    assert len(series[1]["points"]) == n4


def test_out_of_range_rows_count_toward_series_size_but_not_kept(frame):
    rows = [_row(run_time=99_999)] * cs.MIN_SERIES_N
    rows += [_row(run_time=600)] * (cs.MIN_POINT_N - 1)
    assert cs.stat_histogram(frame(rows), "run_minutes", "character") == []


def test_unknown_split_falls_back_to_character(frame):
    rows = [_row()] * (N + 5)
    assert [s["id"] for s in cs.acts_funnel(frame(rows), "garbage")] == [
        "ALL",
        "IRONCLAD",
    ]


def test_loaded_frame_with_no_matching_rows(frame):
    fq = frame([_row()])
    empty = cs.frame_query(None, None, None, "nonexistent_user")
    assert cs.frame_count(empty) == 0
    assert cs.winrate_by_floor(empty, "players") == []
    assert cs.stat_scatter(empty, "floors_reached", "deck_size", "players") == []
    assert cs.frame_count(fq) == 1


def test_ascension_zero_band_and_modded_characters(frame):
    fq = frame([_row(ascension=0, character="MODDED")] * 35)
    assert [s["id"] for s in cs.acts_funnel(fq, "ascension")] == ["ALL", "A0"]
    by_char = cs.acts_funnel(fq, "character")
    assert [(s["id"], s["total"]) for s in by_char] == [("ALL", 35)]


def test_many_modded_characters_collapse_to_one_group(frame):
    rows = [_row()] * N + [_row(character=f"MOD_{i}") for i in range(500)]
    fq = frame(rows)
    assert (
        len(fq.run(f"SELECT DISTINCT {cs._split_spec('character')[1]} FROM {fq.src}"))
        == 2
    )
    scatter = cs.stat_scatter(fq, "floors_reached", "deck_size", "character")
    assert [(s["id"], s["sampled_from"]) for s in scatter] == [("IRONCLAD", N)]
    assert cs.frame_count(fq) == N + 500


def test_concurrent_frame_queries_do_not_deadlock(frame):
    frame([_row()] * 500)
    errors = []

    def worker():
        try:
            fq = cs.frame_query(None, None, None, None)
            assert cs.stat_histogram(fq, "deck_size", "players")
        except Exception as e:
            errors.append(e)

    threads = [threading.Thread(target=worker) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors


def test_swapped_out_frame_keeps_serving_its_request(frame, monkeypatch):
    fq = frame([_row()] * N)
    assert cs.acts_funnel(fq, "players")[0]["total"] == N
    newer, _n = cs._frame_db([_row()] * 5)
    monkeypatch.setattr(cs, "_FRAME_DB", newer)
    assert cs.acts_funnel(fq, "players")[0]["total"] == N
    assert cs.frame_count(cs.frame_query(None, None, None, None)) == 5
