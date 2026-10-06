"""Cube folds are shared across workers: one worker folds and publishes,
another reads the published fold without parsing the cube."""

import gzip
import json

import pytest

from app.services import cache
from app.services import lake_stats as ls

CUBE = {
    "runs": {"standard|1|0|0|v0.1": [10, 4, 10], "standard|2|0|0|v0.1": [6, 3, 12]},
    "entities": {
        "cards": {
            "standard|1|0|0|v0.1": {"BASH": [5, 2, 5, 2, 2.5]},
            "standard|2|0|0|v0.1": {"BASH": [3, 1, 3, 1, 1.2]},
        }
    },
    "data_through": "2026-10-06",
}


@pytest.fixture
def shared(tmp_path, monkeypatch):
    with gzip.open(tmp_path / "entity_cube.json.gz", "wt") as f:
        json.dump(CUBE, f)
    monkeypatch.setattr(ls, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(ls, "_entity_cube_cache", None)
    ls._fold_cache.clear()
    store: dict = {}
    monkeypatch.setattr(cache, "get_json", lambda k: store.get(k))
    monkeypatch.setattr(cache, "set_json", lambda k, v, ttl: store.__setitem__(k, v))
    monkeypatch.setattr(cache, "delete", lambda k: store.pop(k, None))
    monkeypatch.setattr(
        cache,
        "acquire_lock",
        lambda k, ttl_seconds=30: (
            store.setdefault(k, "lock") == "lock"
            and store.__setitem__(k, "held") is None
        ),
    )
    return store


def test_second_worker_reads_the_published_fold(shared, monkeypatch):
    first = ls.entity_bracket_fold("cards", "all")
    assert first["entries"]["BASH"][:2] == [8, 3]
    assert any(k.startswith("lakefold:") and not k.endswith(":lock") for k in shared)

    ls._fold_cache.clear()
    monkeypatch.setattr(ls, "_entity_cube_cache", None)

    def boom():
        raise AssertionError("cube parsed on a shared hit")

    monkeypatch.setattr(ls, "_entity_cube_with_mtime", boom)
    second = ls.entity_bracket_fold("cards", "all")
    assert second["entries"]["BASH"][:2] == [8, 3]


def test_new_cube_generation_refolds(shared, tmp_path, monkeypatch):
    assert ls.entity_bracket_fold("cards", "solo")["entries"]["BASH"][0] == 5
    import os

    cube = dict(CUBE)
    cube["entities"] = {"cards": {"standard|1|0|0|v0.1": {"BASH": [9, 9, 9, 9, 9.0]}}}
    with gzip.open(tmp_path / "entity_cube.json.gz", "wt") as f:
        json.dump(cube, f)
    st = os.stat(tmp_path / "entity_cube.json.gz")
    os.utime(tmp_path / "entity_cube.json.gz", (st.st_atime, st.st_mtime + 10))
    monkeypatch.setattr(ls, "_entity_cube_cache", None)
    assert ls.entity_bracket_fold("cards", "solo")["entries"]["BASH"][0] == 9


def test_versions_shared(shared):
    assert ls.cube_versions(min_runs=1) == ["v0.1"]


def test_missing_cube_returns_none(tmp_path, monkeypatch):
    monkeypatch.setattr(ls, "LAKE_DIR", tmp_path)
    ls._fold_cache.clear()
    assert ls.entity_bracket_fold("cards", "all") is None
