"""Save-reload detection over the replay rooms table: a floor that drops
below one already passed (and the run continues) flags; save-and-quit then
Continue, plateaus, and single-floor runs do not. Applying the hide skips
already-hidden runs and honours dry_run."""

import importlib.util
import pathlib

import duckdb
import pytest

_LAB = pathlib.Path(__file__).resolve().parents[2] / "lab"


def _load():
    spec = importlib.util.spec_from_file_location(
        "replay_guard", _LAB / "replay_guard.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


guard = _load()


def _con(rows):
    con = duckdb.connect()
    con.execute("CREATE TABLE replay_rooms (run_hash VARCHAR, s BIGINT, floor INTEGER)")
    con.executemany("INSERT INTO replay_rooms VALUES (?, ?, ?)", rows)
    return con


def _walk(run_hash, floors, start=1):
    return [(run_hash, start + i, f) for i, f in enumerate(floors)]


def test_reload_to_an_earlier_floor_flags():
    con = _con(_walk("reload", [1, 2, 3, 4, 5, 2, 3, 4, 5, 6]))
    out = guard.detect_save_reloads(con)
    assert out == [{"run_hash": "reload", "from_floor": 5, "to_floor": 2, "drops": 3}]


def test_normal_and_save_quit_runs_do_not_flag():
    rows = (
        _walk("clean", [1, 2, 3, 4, 5, 6])
        + _walk("continue", [1, 2, 3, 3, 4, 5])
        + _walk("single", [1])
        + _walk("nulls", [1, 2, None, 3])
        + _walk("neow", [0, 1, 2, 0, 3])
    )
    assert guard.detect_save_reloads(_con(rows)) == []


def test_drop_on_the_last_row_alone_does_not_flag():
    con = _con(_walk("tail", [1, 2, 3, 2]))
    assert guard.detect_save_reloads(con) == []


def test_two_runs_are_reported_independently():
    con = _con(
        _walk("a", [1, 2, 3, 1, 2, 3, 4])
        + _walk("b", [1, 2, 3, 4])
        + _walk("c", [3, 4, 2, 5])
    )
    out = guard.detect_save_reloads(con)
    assert [o["run_hash"] for o in out] == ["a", "c"]
    assert out[1] == {"run_hash": "c", "from_floor": 4, "to_floor": 2, "drops": 1}


class FakeRuns:
    def __init__(self, docs):
        self.docs = docs

    def find(self, flt, proj=None):
        hashes = set(flt["$or"][0]["_id"]["$in"])
        want_hidden = flt["hidden"] is True
        for d in self.docs:
            h = d.get("run_hash") or d["_id"]
            if h in hashes and (d.get("hidden") is True) == want_hidden:
                yield {"run_hash": d.get("run_hash"), "_id": d["_id"]}


@pytest.fixture
def findings():
    return [
        {"run_hash": "h1", "from_floor": 5, "to_floor": 2, "drops": 3},
        {"run_hash": "h2", "from_floor": 9, "to_floor": 8, "drops": 1},
        {"run_hash": "h3", "from_floor": 4, "to_floor": 1, "drops": 2},
    ]


def test_apply_hides_unhidden_runs_with_reason(findings):
    runs = FakeRuns(
        [
            {"_id": "h1"},
            {"_id": "x", "run_hash": "h2", "hidden": True},
            {"_id": "h3", "hidden": False},
        ]
    )
    calls = []
    out = guard.apply(
        findings,
        dry_run=False,
        coll=runs,
        hide=lambda h, v, reason: calls.append((h, v, reason)),
    )
    assert calls == [("h1", True, "auto:save_reload"), ("h3", True, "auto:save_reload")]
    assert out == {
        "flagged": 3,
        "already_hidden": 1,
        "hidden": 2,
        "hashes": ["h1", "h3"],
        "dry_run": False,
    }


def test_apply_dry_run_touches_nothing(findings):
    runs = FakeRuns([{"_id": "h1"}, {"_id": "h2"}, {"_id": "h3"}])
    calls = []
    out = guard.apply(
        findings, dry_run=True, coll=runs, hide=lambda *a, **k: calls.append(a)
    )
    assert calls == []
    assert out["hidden"] == 0
    assert out["hashes"] == ["h1", "h2", "h3"]
    assert out["dry_run"] is True


def test_apply_with_nothing_flagged():
    out = guard.apply([], dry_run=False, coll=FakeRuns([]), hide=lambda *a, **k: None)
    assert out["flagged"] == 0 and out["hashes"] == []
