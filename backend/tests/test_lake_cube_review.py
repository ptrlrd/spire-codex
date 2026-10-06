"""Review cases for the columnar cube: failures are never cached as empty
folds, concurrent callers share one computation and its error, cache
identity follows file replacement, and unusable or mislabeled builds are
skipped."""

import gzip
import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest

from app.services import lake_cube
from app.services import lake_stats as ls

CELL = "standard|1|0|0|v1.0.0"


def _write_cube(path, picks=1, padding=""):
    cube = {
        "runs": {CELL: [1, 1, 1]},
        "entities": {"cards": {CELL: {"X": [picks, 1]}}},
        "padding": padding,
    }
    with gzip.open(path, "wt", encoding="utf-8") as f:
        json.dump(cube, f)


def _reset_lake_state(monkeypatch, lake):
    monkeypatch.setattr(ls, "LAKE_DIR", lake)
    monkeypatch.setattr(ls, "_compact_cube_cache", None)
    monkeypatch.setattr(ls, "_compact_cube_failed", None)
    monkeypatch.setattr(ls, "_fold_cache", {})
    monkeypatch.setattr(ls, "_fold_inflight", {})
    monkeypatch.setenv("LAKE_CACHE_DIR", str(lake / "cache"))


def test_transient_compact_failure_is_not_negative_cached(tmp_path, monkeypatch):
    src = tmp_path / "entity_cube.json.gz"
    _write_cube(src)
    _reset_lake_state(monkeypatch, tmp_path)
    monkeypatch.setattr(ls, "_COMPACT_RETRY_SECONDS", 0.0)

    real_open = lake_cube.open_for
    calls = 0

    def flaky_open(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise OSError("transient compact-cache failure")
        return real_open(*args, **kwargs)

    monkeypatch.setattr(lake_cube, "open_for", flaky_open)

    assert ls.entity_bracket_fold("cards", "all") is None
    fold = ls.entity_bracket_fold("cards", "all")

    assert fold is not None
    assert fold["entries"]["X"][0] == 1
    assert calls == 2


def _shared_pool(monkeypatch):
    pool = ThreadPoolExecutor(max_workers=2)
    monkeypatch.setattr(ls, "_fold_pool", pool)
    return pool


def test_waiters_share_one_inflight_fold(monkeypatch):
    monkeypatch.setattr(ls, "_cube_sig", lambda: 1.0)
    monkeypatch.setattr(ls, "_fold_cache", {})
    monkeypatch.setattr(ls, "_fold_inflight", {})
    pool = _shared_pool(monkeypatch)

    gate = threading.Event()
    started = threading.Event()
    call_lock = threading.Lock()
    calls = 0
    output = []
    errors = []
    result = {"ok": True}

    def compute():
        nonlocal calls
        with call_lock:
            calls += 1
        started.set()
        if not gate.wait(2):
            raise TimeoutError("test gate was not released")
        return result

    def request():
        try:
            output.append(ls._cached_fold(("test", "all"), compute))
        except BaseException as exc:
            errors.append(exc)

    threads = [threading.Thread(target=request) for _ in range(6)]
    try:
        threads[0].start()
        assert started.wait(1)
        for thread in threads[1:]:
            thread.start()
        time.sleep(0.05)
        gate.set()
        for thread in threads:
            thread.join(3)
        assert not errors
        assert all(not thread.is_alive() for thread in threads)
        assert len(output) == len(threads)
        assert all(value is result for value in output)
        assert calls == 1
    finally:
        gate.set()
        pool.shutdown(wait=True)


def test_owner_error_reaches_waiters_without_recompute(monkeypatch):
    monkeypatch.setattr(ls, "_cube_sig", lambda: 1.0)
    monkeypatch.setattr(ls, "_fold_cache", {})
    monkeypatch.setattr(ls, "_fold_inflight", {})
    pool = _shared_pool(monkeypatch)
    gate = threading.Event()
    calls = []
    errors = []

    def compute():
        calls.append(1)
        gate.wait(2)
        raise RuntimeError("fold blew up")

    def request():
        try:
            ls._cached_fold(("boom", "all"), compute)
        except RuntimeError as exc:
            errors.append(exc)

    threads = [threading.Thread(target=request) for _ in range(5)]
    try:
        for t in threads:
            t.start()
        time.sleep(0.05)
        gate.set()
        for t in threads:
            t.join(3)
        assert len(calls) == 1
        assert len(errors) == 5
        assert ("boom", "all") not in ls._fold_cache
        assert ("boom", "all") not in ls._fold_inflight
    finally:
        gate.set()
        pool.shutdown(wait=True)


def test_nested_folds_do_not_deadlock_the_pool(monkeypatch):
    monkeypatch.setattr(ls, "_cube_sig", lambda: 1.0)
    monkeypatch.setattr(ls, "_fold_cache", {})
    monkeypatch.setattr(ls, "_fold_inflight", {})
    pool = _shared_pool(monkeypatch)
    out = []

    def outer(i):
        return ls._cached_fold(
            ("outer", str(i)), lambda: ls._cached_fold(("inner", "x"), lambda: i)
        )

    threads = [
        threading.Thread(target=lambda i=i: out.append(outer(i))) for i in range(4)
    ]
    try:
        for t in threads:
            t.start()
        for t in threads:
            t.join(3)
        assert all(not t.is_alive() for t in threads)
        assert len(out) == 4
    finally:
        pool.shutdown(wait=True)


def test_same_mtime_replacement_invalidates_folds(tmp_path, monkeypatch):
    src = tmp_path / "entity_cube.json.gz"
    _write_cube(src, picks=1)
    _reset_lake_state(monkeypatch, tmp_path)

    assert ls.entity_bracket_fold("cards", "all")["entries"]["X"][0] == 1
    old = src.stat()

    replacement = tmp_path / "replacement.json.gz"
    padding = "".join(f"{i:08x}" for i in range(4000))
    _write_cube(replacement, picks=99, padding=padding)
    os.utime(replacement, ns=(replacement.stat().st_atime_ns, old.st_mtime_ns))
    os.replace(replacement, src)

    current = src.stat()
    assert current.st_mtime == old.st_mtime
    assert current.st_size != old.st_size

    assert ls.entity_bracket_fold("cards", "all")["entries"]["X"][0] == 99


def _broken_build(root, sha):
    broken = root / lake_cube.build_name(sha)
    broken.mkdir(parents=True)
    (broken / "meta.json").write_text('{"format":-1}', encoding="utf-8")
    return broken


def test_unusable_lake_build_falls_back_to_writable_root(tmp_path, monkeypatch):
    src = tmp_path / "entity_cube.json.gz"
    _write_cube(src)
    sha = lake_cube.file_sha256(src)
    read_only_root = tmp_path / "lake-compact"
    writable_root = tmp_path / "cache-compact"
    _broken_build(read_only_root, sha)
    monkeypatch.setattr(
        lake_cube, "cache_roots", lambda lake_dir: [read_only_root, writable_root]
    )
    real_build = lake_cube.build_dir

    def read_only_mount(src, root, sha=None):
        if root == read_only_root:
            raise OSError(30, "Read-only file system")
        return real_build(src, root, sha)

    monkeypatch.setattr(lake_cube, "build_dir", read_only_mount)
    cube = lake_cube.open_for(src, tmp_path, sha=sha)
    assert cube.path == writable_root / lake_cube.build_name(sha)
    assert cube.versions() == {"v1.0.0": 1}


def test_unusable_build_in_a_writable_root_is_rebuilt(tmp_path, monkeypatch):
    src = tmp_path / "entity_cube.json.gz"
    _write_cube(src)
    sha = lake_cube.file_sha256(src)
    root = tmp_path / "lake-compact"
    _broken_build(root, sha)
    monkeypatch.setattr(lake_cube, "cache_roots", lambda lake_dir: [root])
    cube = lake_cube.open_for(src, tmp_path, sha=sha)
    assert cube.path == root / lake_cube.build_name(sha)
    assert cube.versions() == {"v1.0.0": 1}


def test_build_refuses_a_source_that_changed_under_it(tmp_path):
    src = tmp_path / "entity_cube.json.gz"
    _write_cube(src, picks=1)
    stale_sha = lake_cube.file_sha256(src)
    _write_cube(src, picks=2)
    with pytest.raises(lake_cube.SourceChanged):
        lake_cube.build_dir(src, tmp_path / "root", sha=stale_sha)
    assert not (tmp_path / "root" / lake_cube.build_name(stale_sha)).exists()


def _lake(tmp_path, monkeypatch, picks=4):
    _write_cube(tmp_path / "entity_cube.json.gz", picks=picks)
    _reset_lake_state(monkeypatch, tmp_path)
    return tmp_path


def _build_path(lake):
    sha = lake_cube.file_sha256(lake / "entity_cube.json.gz")
    return lake / "entity_cube.compact" / lake_cube.build_name(sha)


def test_corrupt_existing_build_is_rebuilt(tmp_path, monkeypatch):
    lake = _lake(tmp_path, monkeypatch)
    assert ls.entity_bracket_fold("cards", "all")["entries"]
    (_build_path(lake) / "entities__cards.vals.npy").unlink()
    monkeypatch.setattr(ls, "_compact_cube_cache", None)
    monkeypatch.setattr(ls, "_fold_cache", {})
    assert ls.entity_bracket_fold("cards", "all")["entries"]


def test_incompatible_format_build_is_rebuilt(tmp_path, monkeypatch):
    lake = _lake(tmp_path, monkeypatch)
    assert ls.entity_bracket_fold("cards", "all")["entries"]
    build = _build_path(lake)
    meta = json.loads((build / "meta.json").read_text())
    meta["format"] = lake_cube.FORMAT + 1
    (build / "meta.json").write_text(json.dumps(meta))
    monkeypatch.setattr(ls, "_compact_cube_cache", None)
    monkeypatch.setattr(ls, "_fold_cache", {})
    assert ls.entity_bracket_fold("cards", "all")["entries"]


def test_mapped_build_survives_prune(tmp_path, monkeypatch):
    import shutil

    lake = _lake(tmp_path, monkeypatch)
    assert ls.entity_bracket_fold("cards", "all")["entries"]
    shutil.rmtree(_build_path(lake))
    ls._fold_cache.clear()
    fold = ls.entity_bracket_fold("cards", "standard")
    assert fold and fold["entries"]


def test_owner_failure_unwedges_single_flight(tmp_path, monkeypatch):
    _lake(tmp_path, monkeypatch)
    real = lake_cube.bracket_fold
    calls = []

    def flaky(*a, **k):
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("boom")
        return real(*a, **k)

    monkeypatch.setattr(lake_cube, "bracket_fold", flaky)
    with pytest.raises(RuntimeError):
        ls.entity_bracket_fold("cards", "all")
    assert not ls._fold_inflight
    assert ls.entity_bracket_fold("cards", "all")["entries"]


def test_build_dir_replaces_a_leftover_directory(tmp_path):
    src = tmp_path / "cube.json.gz"
    _write_cube(src)
    sha = lake_cube.file_sha256(src)
    root = tmp_path / "compact"
    final = root / lake_cube.build_name(sha)
    final.mkdir(parents=True)
    (final / "corrupt.npy").write_bytes(b"garbage")
    (root / f".{sha}.12345.tmp").mkdir()
    lake_cube.build_dir(src, root, sha=sha)
    assert (final / "meta.json").exists()
    assert not (final / "corrupt.npy").exists()
    assert not (root / f".{sha}.12345.tmp").exists()


def test_cube_versions_when_cube_missing_returns_empty_list(tmp_path, monkeypatch):
    _reset_lake_state(monkeypatch, tmp_path)
    assert ls.cube_versions() == []


def test_failed_reload_keeps_serving_the_previous_cube(tmp_path, monkeypatch):
    lake = _lake(tmp_path, monkeypatch, picks=4)
    assert ls.entity_bracket_fold("cards", "all")["entries"]["X"][0] == 4
    good = ls._compact_cube_cache
    (lake / "entity_cube.json.gz").write_bytes(b"corrupt gzip data")
    hit = ls._compact_entity_cube()
    assert hit is good
    fold = ls.entity_bracket_fold("cards", "standard")
    assert fold["entries"]["X"][0] == 4
    assert ("cards", "standard") not in ls._fold_cache
    monkeypatch.setattr(ls, "_COMPACT_RETRY_SECONDS", 0.0)
    _write_cube(lake / "entity_cube.json.gz", picks=7)
    assert ls.entity_bracket_fold("cards", "standard")["entries"]["X"][0] == 7


def test_requests_get_the_previous_cube_while_a_new_one_loads(tmp_path, monkeypatch):
    lake = _lake(tmp_path, monkeypatch, picks=4)
    assert ls.entity_bracket_fold("cards", "all")["entries"]["X"][0] == 4
    good = ls._compact_cube_cache
    _write_cube(lake / "entity_cube.json.gz", picks=9)
    gate = threading.Event()
    real = lake_cube.open_for

    def slow_open(*a, **k):
        gate.wait(2)
        return real(*a, **k)

    monkeypatch.setattr(lake_cube, "open_for", slow_open)
    loader = threading.Thread(target=ls._compact_entity_cube)
    loader.start()
    time.sleep(0.05)
    started = time.time()
    assert ls._compact_entity_cube() is good
    assert time.time() - started < 0.5
    gate.set()
    loader.join(3)
    assert ls.entity_bracket_fold("cards", "all")["entries"]["X"][0] == 9
