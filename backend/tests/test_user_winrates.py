import threading
import time

from app.services import runs_db_mongo as rdm


class FakeCache:
    def __init__(self):
        self.store = {}
        self.locks = {}
        self.lock_grants = True

    def get_json(self, key):
        self.gets = getattr(self, "gets", 0) + 1
        return self.store.get(key)

    def set_json(self, key, value, ttl_seconds):
        self.store[key] = value

    def acquire_lock(self, key, ttl_seconds=30, token="1"):
        self.lock_attempts = getattr(self, "lock_attempts", 0) + 1
        if not self.lock_grants or key in self.locks:
            return False
        self.locks[key] = token
        return True

    def release_lock(self, key, token):
        if self.locks.get(key) == token:
            del self.locks[key]


class RedisDown(FakeCache):
    def get_json(self, key):
        return None

    def set_json(self, key, value, ttl_seconds):
        pass

    def acquire_lock(self, key, ttl_seconds=30, token="1"):
        return True


class FakeColl:
    def __init__(self, rows, gate=None):
        self.rows = rows
        self.gate = gate
        self.started = threading.Event()
        self.calls = 0

    def aggregate(self, pipeline, **kwargs):
        self.calls += 1
        self.started.set()
        if self.gate is not None:
            self.gate.wait(5)
        return list(self.rows)


def _wire(monkeypatch, cache, coll):
    for name in ("get_json", "set_json", "acquire_lock", "release_lock"):
        monkeypatch.setattr(rdm.app_cache, name, getattr(cache, name))
    monkeypatch.setattr(rdm, "_get_collection", lambda: coll)
    monkeypatch.setattr(rdm, "_user_winrates_memo", None)
    monkeypatch.setattr(rdm, "_user_winrates_built_at", 0.0)
    monkeypatch.setattr(rdm, "_user_winrates_checked_at", float("-inf"))
    monkeypatch.setattr(rdm, "_user_winrates_failed_at", float("-inf"))
    monkeypatch.setattr(rdm, "_user_winrates_inflight", threading.Lock())


def _settle():
    for t in threading.enumerate():
        if t.name == "user-winrates":
            t.join(5)


def _force_recheck():
    rdm._user_winrates_checked_at = float("-inf")


def _refresh_is_idle():
    if not rdm._user_winrates_inflight.acquire(blocking=False):
        return False
    rdm._user_winrates_inflight.release()
    return True


def test_cold_start_serves_empty_and_builds_in_the_background(monkeypatch):
    cache = FakeCache()
    gate = threading.Event()
    coll = FakeColl([{"_id": "p", "total": 10, "wins": 4}], gate=gate)
    _wire(monkeypatch, cache, coll)
    assert rdm.get_user_winrates() == {}
    assert coll.started.wait(5)
    _force_recheck()
    assert rdm.get_user_winrates() == {}
    gate.set()
    _settle()
    assert coll.calls == 1
    assert cache.store[rdm._USER_WINRATES_KEY]["rates"] == {"p": [10, 4]}
    assert cache.store[rdm._USER_WINRATES_STALE_KEY]["rates"] == {"p": [10, 4]}
    assert cache.locks == {}
    assert _refresh_is_idle()
    _force_recheck()
    assert rdm.get_user_winrates() == {"p": [10, 4]}
    assert coll.calls == 1


def test_fresh_copy_is_served_without_a_rebuild(monkeypatch):
    cache = FakeCache()
    cache.store[rdm._USER_WINRATES_KEY] = {"at": time.time(), "rates": {"p": [10, 4]}}
    coll = FakeColl([])
    _wire(monkeypatch, cache, coll)
    assert rdm.get_user_winrates() == {"p": [10, 4]}
    assert rdm.get_user_winrates() == {"p": [10, 4]}
    assert coll.calls == 0
    assert cache.locks == {}


def test_stale_copy_serves_while_exactly_one_refresh_runs(monkeypatch):
    cache = FakeCache()
    cache.store[rdm._USER_WINRATES_STALE_KEY] = {
        "at": time.time() - 2 * rdm._USER_WINRATES_TTL_SECONDS,
        "rates": {"old": [5, 1]},
    }
    gate = threading.Event()
    coll = FakeColl([{"_id": "new", "total": 8, "wins": 8}], gate=gate)
    _wire(monkeypatch, cache, coll)
    assert rdm.get_user_winrates() == {"old": [5, 1]}
    assert coll.started.wait(5)
    for _ in range(20):
        _force_recheck()
        assert rdm.get_user_winrates() == {"old": [5, 1]}
    assert coll.calls == 1
    assert rdm._USER_WINRATES_LOCK in cache.locks
    gate.set()
    _settle()
    assert cache.store[rdm._USER_WINRATES_KEY]["rates"] == {"new": [8, 8]}
    assert cache.locks == {}
    _force_recheck()
    assert rdm.get_user_winrates() == {"new": [8, 8]}
    assert coll.calls == 1


def test_lock_held_by_another_process_never_aggregates(monkeypatch):
    cache = FakeCache()
    cache.lock_grants = False
    cache.store[rdm._USER_WINRATES_STALE_KEY] = {"at": 1.0, "rates": {"old": [5, 1]}}
    coll = FakeColl([{"_id": "new", "total": 8, "wins": 8}])
    _wire(monkeypatch, cache, coll)
    assert rdm.get_user_winrates() == {"old": [5, 1]}
    assert coll.calls == 0
    assert _refresh_is_idle()
    _wire(monkeypatch, cache, coll)
    cache.store.clear()
    assert rdm.get_user_winrates() == {}
    assert coll.calls == 0
    assert _refresh_is_idle()


def test_failed_refresh_releases_both_locks_and_backs_off(monkeypatch):
    cache = FakeCache()

    class Broken:
        calls = 0

        def aggregate(self, *a, **k):
            self.calls += 1
            raise ConnectionError("down")

    coll = Broken()
    _wire(monkeypatch, cache, coll)
    assert rdm.get_user_winrates() == {}
    _settle()
    assert cache.locks == {}
    assert _refresh_is_idle()
    assert coll.calls == 1
    _force_recheck()
    assert rdm.get_user_winrates() == {}
    _settle()
    assert coll.calls == 1
    rdm._user_winrates_failed_at = float("-inf")
    _force_recheck()
    assert rdm.get_user_winrates() == {}
    _settle()
    assert coll.calls == 2


def test_refresh_thread_failing_to_start_releases_both_locks(monkeypatch):
    cache = FakeCache()
    coll = FakeColl([])
    _wire(monkeypatch, cache, coll)

    class NoThread:
        def __init__(self, *a, **k):
            pass

        def start(self):
            raise RuntimeError("can't start new thread")

    monkeypatch.setattr(rdm.threading, "Thread", NoThread)
    assert rdm.get_user_winrates() == {}
    assert cache.locks == {}
    assert _refresh_is_idle()
    assert coll.calls == 0


def test_redis_down_rebuilds_at_most_once_an_hour(monkeypatch):
    cache = RedisDown()
    gate = threading.Event()
    coll = FakeColl([{"_id": "p", "total": 10, "wins": 4}], gate=gate)
    _wire(monkeypatch, cache, coll)
    assert rdm.get_user_winrates() == {}
    assert coll.started.wait(5)
    gate.set()
    _settle()
    assert coll.calls == 1
    for _ in range(20):
        _force_recheck()
        assert rdm.get_user_winrates() == {"p": [10, 4]}
    _settle()
    assert coll.calls == 1


def test_redis_is_consulted_at_most_once_per_window_even_when_cold(monkeypatch):
    cache = FakeCache()
    gate = threading.Event()
    coll = FakeColl([{"_id": "p", "total": 10, "wins": 4}], gate=gate)
    _wire(monkeypatch, cache, coll)
    assert rdm.get_user_winrates() == {}
    assert coll.started.wait(5)
    assert cache.gets == 3
    assert cache.lock_attempts == 1
    for _ in range(20):
        assert rdm.get_user_winrates() == {}
    assert cache.gets == 3
    assert cache.lock_attempts == 1
    gate.set()
    _settle()


def test_concurrent_callers_share_one_redis_read(monkeypatch):
    cache = FakeCache()
    cache.store[rdm._USER_WINRATES_KEY] = {"at": time.time(), "rates": {"p": [10, 4]}}
    coll = FakeColl([])
    _wire(monkeypatch, cache, coll)
    threads = [threading.Thread(target=rdm.get_user_winrates) for _ in range(20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(5)
    assert cache.gets == 1
    assert rdm.get_user_winrates() == {"p": [10, 4]}
    assert coll.calls == 0


def test_refresh_skips_the_aggregate_when_a_fresh_copy_already_landed(monkeypatch):
    cache = FakeCache()
    coll = FakeColl([{"_id": "p", "total": 10, "wins": 4}])
    _wire(monkeypatch, cache, coll)
    cache.store[rdm._USER_WINRATES_KEY] = {"at": time.time(), "rates": {"q": [3, 3]}}
    cache.locks[rdm._USER_WINRATES_LOCK] = "tok"
    assert rdm._user_winrates_inflight.acquire(blocking=False)
    rdm._refresh_user_winrates("tok")
    assert coll.calls == 0
    assert cache.locks == {}
    assert _refresh_is_idle()
    assert rdm.get_user_winrates() == {"q": [3, 3]}


def test_an_older_payload_never_replaces_a_newer_memo(monkeypatch):
    _wire(monkeypatch, FakeCache(), FakeColl([]))
    rdm._remember_user_winrates({"at": 200.0, "rates": {"new": [2, 1]}})
    rdm._remember_user_winrates({"at": 100.0, "rates": {"old": [9, 0]}})
    rdm._remember_user_winrates({"rates": {"bad": [1, 1]}})
    rdm._remember_user_winrates({"at": 300.0, "rates": ["not", "a", "map"]})
    assert rdm._user_winrates_memo == {"new": [2, 1]}
    assert rdm._user_winrates_built_at == 200.0
