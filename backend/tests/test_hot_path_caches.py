"""Counts that used to hit Mongo on every request are read from the cache."""

from app.routers import replays_browse
from app.services import runs_db_mongo


class _Cache:
    def __init__(self):
        self.store = {}
        self.locked = False

    def get_json(self, key):
        return self.store.get(key)

    def set_json(self, key, value, ttl_seconds):
        self.store[key] = value

    def acquire_lock(self, key, ttl_seconds=30, token="1"):
        return not self.locked


def test_global_wins_ahead_counts_once_per_run_time(monkeypatch):
    cache = _Cache()
    calls = []
    monkeypatch.setattr(runs_db_mongo, "app_cache", cache)
    monkeypatch.setattr(
        runs_db_mongo, "_count_visible", lambda coll, q: calls.append(q) or 41
    )
    assert runs_db_mongo._global_wins_ahead(None, 900) == 41
    assert runs_db_mongo._global_wins_ahead(None, 900) == 41
    assert len(calls) == 1
    runs_db_mongo._global_wins_ahead(None, 901)
    assert len(calls) == 2


def test_replay_summary_serves_the_last_copy_while_another_worker_counts(monkeypatch):
    cache = _Cache()
    cache.store["replays_summary:last"] = {"total": 7, "by_character": {}}
    cache.locked = True
    monkeypatch.setattr(replays_browse, "app_cache", cache)
    monkeypatch.setattr(replays_browse, "_mongo", lambda: True)

    class Resp:
        headers = {}

    fn = getattr(replays_browse.replays_summary, "__wrapped__", None)
    out = (fn or replays_browse.replays_summary)(request=None, response=Resp())
    assert out == {"total": 7, "by_character": {}}


def test_replay_summary_does_not_count_when_another_worker_holds_the_lock(monkeypatch):
    cache = _Cache()
    cache.locked = True
    monkeypatch.setattr(replays_browse, "app_cache", cache)
    monkeypatch.setattr(replays_browse, "_mongo", lambda: True)

    class Resp:
        headers = {}

    fn = getattr(replays_browse.replays_summary, "__wrapped__", None)
    out = (fn or replays_browse.replays_summary)(request=None, response=Resp())
    assert out == {"total": 0, "by_character": {}}
    assert Resp.headers["Cache-Control"] == "no-store"


def test_replay_summary_counts_in_one_query(monkeypatch):
    cache = _Cache()
    calls = []

    class Coll:
        def aggregate(self, pipeline, **kwargs):
            calls.append(kwargs)
            return [{"_id": "IRONCLAD", "n": 3}, {"_id": "MODDED", "n": 2}]

    monkeypatch.setattr(replays_browse, "app_cache", cache)
    monkeypatch.setattr(replays_browse, "_mongo", lambda: True)
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: Coll())
    monkeypatch.setattr(
        replays_browse, "official_characters_ordered", lambda: ["IRONCLAD", "SILENT"]
    )

    class Resp:
        headers = {}

    fn = getattr(replays_browse.replays_summary, "__wrapped__", None)
    out = (fn or replays_browse.replays_summary)(request=None, response=Resp())
    assert out == {"total": 5, "by_character": {"IRONCLAD": 3, "SILENT": 0}}
    assert calls == [{"maxTimeMS": 60_000}]
    assert cache.store["replays_summary:last"] == out


def test_run_rank_caches_the_number_not_the_category(monkeypatch):
    from app.services import lake_stats

    cache = _Cache()
    counts = []

    class Coll:
        def find_one(self, q, projection=None, **kwargs):
            return {"win": True, "character": "IRONCLAD", "run_time": 90}

    monkeypatch.setattr(runs_db_mongo, "app_cache", cache)
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: Coll())
    monkeypatch.setattr(lake_stats, "leaderboard_rank", lambda h, c: None)
    monkeypatch.setattr(
        runs_db_mongo, "_count_visible", lambda coll, q: counts.append(q) or 8
    )
    assert runs_db_mongo.get_run_rank("h1") == {"rank": 9, "category": "fastest"}
    assert runs_db_mongo.get_run_rank("h1", "anything") == {
        "rank": 9,
        "category": "anything",
    }
    assert len(counts) == 1
    assert cache.store == {"run_rank:fastest:h1": 9}
