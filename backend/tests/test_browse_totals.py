"""Budgeted browse counts: count_with_budget returns the exact total under
its time budget, falls back to a capped lower bound (plus flag) on a server
timeout, caches the filtered answer in Redis, and list_runs / the live
leaderboard surface total_is_lower_bound in their responses."""

import pytest
from pymongo.errors import ExecutionTimeout, OperationFailure

from app.services import cache as app_cache
from app.services import runs_db_mongo


class FakeColl:
    def __init__(self, docs, *, timeout_on_budget=False):
        self.docs = docs
        self.timeout_on_budget = timeout_on_budget
        self.count_calls = []

    def _match(self, d, q):
        for k, v in q.items():
            if isinstance(v, dict) and "$ne" in v:
                if d.get(k) == v["$ne"]:
                    return False
            elif isinstance(v, dict) and "$in" in v:
                if d.get(k) not in v["$in"]:
                    return False
            elif isinstance(v, dict) and ("$gte" in v or "$lte" in v):
                val = d.get(k)
                if val is None:
                    return False
                if "$gte" in v and val < v["$gte"]:
                    return False
                if "$lte" in v and val > v["$lte"]:
                    return False
            elif d.get(k) != v:
                return False
        return True

    def _count(self, q):
        return sum(1 for d in self.docs if self._match(d, q))

    def count_documents(self, q, limit=None, maxTimeMS=None):
        self.count_calls.append((q, limit, maxTimeMS))
        if maxTimeMS is not None and self.timeout_on_budget:
            raise ExecutionTimeout("timed out")
        n = self._count(q)
        return min(n, limit) if limit else n

    def estimated_document_count(self):
        return len(self.docs)

    def find(self, q, proj=None):
        return self

    def sort(self, spec):
        return self

    def skip(self, n):
        return self

    def limit(self, n):
        return self

    def __iter__(self):
        return iter([])


@pytest.fixture
def cache_store(monkeypatch):
    store = {}
    monkeypatch.setattr(app_cache, "get_json", lambda k: store.get(k))
    monkeypatch.setattr(
        app_cache, "set_json", lambda k, v, ttl_seconds: store.__setitem__(k, v)
    )
    return store


def test_exact_path(cache_store):
    coll = FakeColl([{"win": True}, {"win": True}, {"win": False}])
    n, lb = runs_db_mongo.count_with_budget(coll, {"win": True})
    assert (n, lb) == (2, False)
    assert coll.count_calls[0][2] == 1500


def test_operation_failure_code_50_is_lower_bound(cache_store):
    coll = FakeColl([])
    original = coll.count_documents

    def fail_budget(q, limit=None, maxTimeMS=None):
        if maxTimeMS is not None:
            raise OperationFailure("exceeded time limit", 50)
        return original(q, limit=limit)

    coll.count_documents = fail_budget
    assert runs_db_mongo.count_with_budget(coll, {"win": True}) == (0, True)


def test_timeout_returns_capped_lower_bound(cache_store):
    docs = [{"win": True} for _ in range(12)]
    coll = FakeColl(docs, timeout_on_budget=True)
    assert runs_db_mongo.count_with_budget(coll, {"win": True}, cap=10) == (10, True)


def test_cache_hit_avoids_second_count(cache_store):
    coll = FakeColl([{"win": True}])
    first = runs_db_mongo.count_with_budget(coll, {"win": True})
    second = runs_db_mongo.count_with_budget(coll, {"win": True})
    assert first == second == (1, False)
    assert len(coll.count_calls) == 1


def test_list_runs_carries_exact_flag(monkeypatch, cache_store):
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: FakeColl([]))
    out = runs_db_mongo.list_runs(win="true")
    assert out["total_is_lower_bound"] is False


def test_list_runs_carries_lower_bound_flag(monkeypatch, cache_store):
    monkeypatch.setattr(
        runs_db_mongo, "_get_collection", lambda: FakeColl([], timeout_on_budget=True)
    )
    out = runs_db_mongo.list_runs(win="true")
    assert out["total"] == 0
    assert out["total_is_lower_bound"] is True


def test_list_runs_unfiltered_uses_estimate(monkeypatch, cache_store):
    coll = FakeColl([{"x": 1}])
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    out = runs_db_mongo.list_runs(include_hidden=True)
    assert out["total"] == 1
    assert out["total_is_lower_bound"] is False
    assert coll.count_calls == []


def test_leaderboard_live_exact(monkeypatch, cache_store):
    coll = FakeColl(
        [
            _board_doc(),
            {**_board_doc(), "hidden": True},
        ]
    )
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    out = runs_db_mongo._leaderboard_live(category="fastest")
    assert out["total"] == 1
    assert out["total_is_lower_bound"] is False


def test_leaderboard_live_lower_bound_if_hidden_count_trips(monkeypatch, cache_store):
    class TimeoutHiddenFake(FakeColl):
        def count_documents(self, q, limit=None, maxTimeMS=None):
            if "hidden" in q and maxTimeMS is not None:
                raise ExecutionTimeout("timed out")
            return super().count_documents(q, limit=limit, maxTimeMS=maxTimeMS)

    coll = TimeoutHiddenFake([_board_doc(), {**_board_doc(), "hidden": True}])
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    out = runs_db_mongo._leaderboard_live(category="fastest")
    assert out["total_is_lower_bound"] is True


def _board_doc():
    return {
        "win": True,
        "character": "IRONCLAD",
        "ascension": 0,
        "player_count": 1,
    }


def test_refresh_summary_uses_larger_budget(monkeypatch, cache_store):
    from app.services import lake_stats

    budgets = []
    originals = runs_db_mongo._leaderboard_live

    def spy(**kw):
        budgets.append(kw.get("max_time_ms"))
        return originals(**kw)

    def no_boards():
        raise RuntimeError("lake unavailable")

    class FakeSummary:
        def replace_one(self, *a, **k):
            pass

    monkeypatch.setattr(runs_db_mongo, "_leaderboard_live", spy)
    monkeypatch.setattr(lake_stats, "leaderboard_boards", no_boards)
    monkeypatch.setattr(
        runs_db_mongo, "_leaderboard_summary_coll", lambda: FakeSummary()
    )
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: FakeColl([]))
    monkeypatch.setattr(app_cache, "set_json", lambda *a, **k: None)
    runs_db_mongo.refresh_leaderboard_summary()
    assert budgets and all(b == 5000 for b in budgets)
