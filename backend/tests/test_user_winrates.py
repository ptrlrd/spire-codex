import time

from app.services import runs_db_mongo as rdm


class FakeCache:
    def __init__(self):
        self.store = {}
        self.locks = set()
        self.lock_grants = True

    def get_json(self, key):
        return self.store.get(key)

    def set_json(self, key, value, ttl_seconds):
        self.store[key] = value

    def acquire_lock(self, key, ttl_seconds=30):
        if not self.lock_grants or key in self.locks:
            return False
        self.locks.add(key)
        return True

    def delete(self, key):
        self.store.pop(key, None)
        self.locks.discard(key)


class FakeColl:
    def __init__(self, rows):
        self.rows = rows
        self.calls = 0

    def aggregate(self, pipeline, allowDiskUse=False):
        self.calls += 1
        return list(self.rows)


def _wire(monkeypatch, cache, coll):
    for name in ("get_json", "set_json", "acquire_lock", "delete"):
        monkeypatch.setattr(rdm.app_cache, name, getattr(cache, name))
    monkeypatch.setattr(rdm, "_get_collection", lambda: coll)
    monkeypatch.setattr(rdm, "_user_winrates_memo", None)
    monkeypatch.setattr(rdm, "_USER_WINRATES_WAIT_SECONDS", 0)


def test_first_call_computes_and_fills_both_keys(monkeypatch):
    cache = FakeCache()
    coll = FakeColl([{"_id": "p", "total": 10, "wins": 4}])
    _wire(monkeypatch, cache, coll)
    assert rdm.get_user_winrates() == {"p": [10, 4]}
    assert coll.calls == 1
    assert cache.store[rdm._USER_WINRATES_KEY] == {"p": [10, 4]}
    assert cache.store[rdm._USER_WINRATES_STALE_KEY] == {"p": [10, 4]}
    assert rdm._USER_WINRATES_LOCK not in cache.locks
    assert rdm.get_user_winrates() == {"p": [10, 4]}
    assert coll.calls == 1


def test_stale_copy_serves_while_one_refresh_runs(monkeypatch):
    cache = FakeCache()
    cache.store[rdm._USER_WINRATES_STALE_KEY] = {"old": [5, 1]}
    coll = FakeColl([{"_id": "new", "total": 8, "wins": 8}])
    _wire(monkeypatch, cache, coll)
    assert rdm.get_user_winrates() == {"old": [5, 1]}
    deadline = time.time() + 5
    while rdm._USER_WINRATES_KEY not in cache.store and time.time() < deadline:
        time.sleep(0.05)
    assert cache.store[rdm._USER_WINRATES_KEY] == {"new": [8, 8]}
    assert coll.calls == 1
    assert rdm._USER_WINRATES_LOCK not in cache.locks


def test_lock_held_elsewhere_never_aggregates(monkeypatch):
    cache = FakeCache()
    cache.lock_grants = False
    cache.store[rdm._USER_WINRATES_STALE_KEY] = {"old": [5, 1]}
    coll = FakeColl([{"_id": "new", "total": 8, "wins": 8}])
    _wire(monkeypatch, cache, coll)
    assert rdm.get_user_winrates() == {"old": [5, 1]}
    cache.store.pop(rdm._USER_WINRATES_STALE_KEY)
    assert rdm.get_user_winrates() == {}
    assert coll.calls == 0


def test_failed_refresh_releases_the_lock(monkeypatch):
    cache = FakeCache()

    class Broken:
        def aggregate(self, *a, **k):
            raise ConnectionError("down")

    _wire(monkeypatch, cache, Broken())
    assert rdm.get_user_winrates() == {}
    assert rdm._USER_WINRATES_LOCK not in cache.locks
