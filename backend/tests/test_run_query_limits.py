import logging
import threading

import pytest
from fastapi.testclient import TestClient
from pymongo.errors import ExecutionTimeout, OperationFailure

from app.dependencies import shared_limiter
from app.main import app
from app.metrics import count_budget_timeouts, db_operations
from app.routers import runs as runs_router
from app.services import cache as app_cache
from app.services import presence_db, runs_db_mongo

client = TestClient(app, raise_server_exceptions=False)

VISIBLE = {"hidden": {"$ne": True}}


@pytest.fixture
def cache_store(monkeypatch):
    store = {}
    monkeypatch.setattr(app_cache, "get_json", lambda k: store.get(k))
    monkeypatch.setattr(
        app_cache, "set_json", lambda k, v, ttl_seconds: store.__setitem__(k, v)
    )
    return store


@pytest.fixture
def mongo_env(monkeypatch, cache_store):
    monkeypatch.setenv("MONGO_URL", "mongodb://test")
    monkeypatch.setattr(shared_limiter, "enabled", False)
    return cache_store


class CountColl:
    name = "runs"

    def __init__(self, counts=None, estimate=0, reject_hint=False, slow=()):
        self.counts = list(counts or [])
        self.estimate = estimate
        self.reject_hint = reject_hint
        self.slow = set(slow)
        self.calls = []
        self.finds = []

    def estimated_document_count(self):
        self.calls.append(("estimate", None, None, None))
        return self.estimate

    def count_documents(self, q, limit=None, maxTimeMS=None, hint=None):
        self.calls.append((q, limit, maxTimeMS, hint))
        if hint and self.reject_hint:
            raise OperationFailure(
                "hint provided does not correspond to an existing index", 2
            )
        stage = "capped" if limit else "exact"
        if stage in self.slow:
            raise ExecutionTimeout("operation exceeded time limit", 50)
        return self.counts.pop(0) if self.counts else 0

    def find(self, q, proj=None, **kwargs):
        self.finds.append((q, kwargs))
        return self

    def sort(self, *a, **k):
        return self

    def skip(self, n):
        return self

    def limit(self, n):
        self.limited = n
        return self

    def __iter__(self):
        return iter(())


def _timeouts(stage):
    return count_budget_timeouts.labels(stage=stage)._value.get()


def _ops(operation):
    return db_operations.labels(operation=operation, table="runs")._value.get()


def test_unfiltered_public_count_is_the_estimate_minus_hidden(cache_store):
    coll = CountColl(counts=[17], estimate=2_500_000)
    assert runs_db_mongo.count_with_budget(coll, dict(VISIBLE)) == (2_499_983, False)
    assert coll.calls == [
        ("estimate", None, None, None),
        ({"hidden": True}, None, 1500, runs_db_mongo.HIDDEN_BROWSE_INDEX),
    ]


def test_covered_filter_counts_without_the_hidden_clause(cache_store):
    coll = CountColl(counts=[400, 3])
    q = {**VISIBLE, "character": "DEFECT", "ascension": 10}
    assert runs_db_mongo.count_with_budget(coll, q) == (397, False)
    base = {"character": "DEFECT", "ascension": 10}
    assert coll.calls == [
        (base, None, 1500, None),
        ({**base, "hidden": True}, None, 1500, runs_db_mongo.HIDDEN_BROWSE_INDEX),
    ]


def test_filter_outside_the_hidden_index_counts_directly(cache_store):
    coll = CountColl(counts=[9])
    q = {**VISIBLE, "deck.id": "BASH"}
    assert runs_db_mongo.count_with_budget(coll, q) == (9, False)
    assert coll.calls == [(q, None, 1500, None)]


def test_hidden_count_drops_the_hint_until_the_index_exists(cache_store):
    coll = CountColl(counts=[50, 2], reject_hint=True)
    q = {**VISIBLE, "character": "SILENT"}
    assert runs_db_mongo.count_with_budget(coll, q) == (48, False)
    assert [c[3] for c in coll.calls] == [
        None,
        runs_db_mongo.HIDDEN_BROWSE_INDEX,
        None,
    ]


def test_hidden_index_carries_every_field_it_is_trusted_for():
    specs = {o["name"]: (k, o) for k, o in runs_db_mongo._background_index_specs()}
    keys, options = specs[runs_db_mongo.HIDDEN_BROWSE_INDEX]
    assert options["partialFilterExpression"] == {"hidden": True}
    assert {k for k, _ in keys} == runs_db_mongo._HIDDEN_BROWSE_FIELDS | {"hidden"}
    assert [k for k, _ in specs[runs_db_mongo.STEAM_BEST_WIN_INDEX][0]] == [
        "steam_id",
        "win",
        "run_time",
    ]
    assert specs[runs_db_mongo.USER_PLAYED_INDEX][0] == [
        ("user_id", 1),
        ("played_at", -1),
        ("submitted_at", -1),
    ]


def test_background_indexes_survive_one_failed_build():
    built = []

    class Coll:
        def create_index(self, keys, **kwargs):
            if kwargs.get("name") == runs_db_mongo.HIDDEN_BROWSE_INDEX:
                raise OperationFailure("boom")
            built.append(kwargs.get("name"))

    runs_db_mongo._ensure_background_indexes(Coll())
    assert built == [
        runs_db_mongo.HIDDEN_WINS_INDEX,
        runs_db_mongo.STEAM_BEST_WIN_INDEX,
        runs_db_mongo.USER_PLAYED_INDEX,
    ]


def test_capped_count_is_time_limited(cache_store):
    coll = CountColl(counts=[10], slow={"exact"})
    before = _timeouts("exact")
    assert runs_db_mongo.count_with_budget(coll, {"deck.id": "BASH"}) == (10, True)
    assert coll.calls[-1] == (
        {"deck.id": "BASH"},
        10_000,
        runs_db_mongo.COUNT_FALLBACK_MAX_TIME_MS,
        None,
    )
    assert _timeouts("exact") == before + 1


def test_capped_count_timeout_raises_and_is_not_cached(cache_store):
    coll = CountColl(slow={"exact", "capped"})
    before = _timeouts("capped")
    with pytest.raises(ExecutionTimeout):
        runs_db_mongo.count_with_budget(coll, {"deck.id": "BASH"})
    assert _timeouts("capped") == before + 1
    assert cache_store == {}


def test_other_count_failures_are_not_swallowed(cache_store):
    class Broken(CountColl):
        def count_documents(self, q, **kwargs):
            raise OperationFailure("not authorized", 13)

    with pytest.raises(OperationFailure):
        runs_db_mongo.count_with_budget(Broken(), {"win": True})


def test_list_find_carries_a_time_limit(monkeypatch, cache_store):
    coll = CountColl(counts=[3, 0])
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    runs_db_mongo.list_runs(character="silent")
    assert coll.finds[0][1] == {"max_time_ms": runs_db_mongo.LIST_MAX_TIME_MS}


def test_leaderboard_find_carries_a_time_limit(monkeypatch, cache_store):
    coll = CountColl(counts=[3, 0])
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    runs_db_mongo._leaderboard_live(max_time_ms=5000)
    assert coll.finds[0][1] == {"max_time_ms": 5000}
    assert coll.calls[0][2] == 5000
    assert "hidden" not in coll.calls[0][0]
    assert coll.calls[1][3] == runs_db_mongo.HIDDEN_BROWSE_INDEX


def test_instrumentation_sits_on_the_functions_it_names(monkeypatch, cache_store):
    coll = CountColl()
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    before = {
        op: _ops(op) for op in ("list_runs", "leaderboard_live", "count_with_budget")
    }
    runs_db_mongo._run_filter(character="silent")
    runs_db_mongo.player_index_for_hash({}, "x")
    assert _ops("list_runs") == before["list_runs"]
    runs_db_mongo.list_runs(character="silent")
    runs_db_mongo._leaderboard_live()
    assert _ops("list_runs") == before["list_runs"] + 1
    assert _ops("leaderboard_live") == before["leaderboard_live"] + 1
    assert _ops("count_with_budget") == before["count_with_budget"] + 2


def test_list_timeout_is_a_503(mongo_env, monkeypatch):
    def slow(**kw):
        raise ExecutionTimeout("operation exceeded time limit", 50)

    monkeypatch.setattr(runs_db_mongo, "list_runs", slow)
    r = client.get("/api/runs/list", params={"character": "silent"})
    assert r.status_code == 503
    assert "detail" in r.json()


def test_single_and_1_share_one_stats_summary_key():
    assert runs_db_mongo._filter_key(players="single") == "players:1"
    assert (
        runs_db_mongo._filter_key(character="silent", players="single")
        in runs_db_mongo.MATERIALIZED_STATS_KEYS
    )
    assert runs_db_mongo._filter_key(players="multi") == "players:multi"


def test_stats_timeout_text_makes_no_background_promise(mongo_env, monkeypatch):
    def slow(**kw):
        raise ExecutionTimeout("operation exceeded time limit", 50)

    monkeypatch.setattr(runs_db_mongo, "read_stats_summary", lambda **kw: None)
    monkeypatch.setattr(runs_router, "get_stats", slow)
    monkeypatch.setattr(app_cache, "acquire_lock", lambda *a, **k: True)
    monkeypatch.setattr(app_cache, "delete", lambda *a, **k: None)
    monkeypatch.setattr(runs_router, "_stats_fallback_cache", {})
    r = client.get("/api/runs/stats", params={"players": "multi", "win": "true"})
    assert r.status_code == 503
    assert "background" not in r.json()["detail"]


def test_stats_fallback_cache_is_bounded(monkeypatch):
    cache = {}
    monkeypatch.setattr(runs_router, "_stats_fallback_cache", cache)
    monkeypatch.setattr(runs_router, "_STATS_FALLBACK_MAX_ENTRIES", 3)
    for i in range(10):
        runs_router._remember_stats_fallback((i,), {"total_runs": i})
    assert list(cache) == [(7,), (8,), (9,)]
    runs_router._remember_stats_fallback((8,), {"total_runs": 80})
    assert list(cache) == [(7,), (9,), (8,)]
    assert cache[(8,)][1] == {"total_runs": 80}


class RankColl:
    def __init__(self):
        self.counts = 0

    def find_one(self, q, projection=None, **kwargs):
        return None

    def count_documents(self, q, **kwargs):
        self.counts += 1
        return 100


def test_seed_rank_reuses_the_cached_global_total(monkeypatch, cache_store):
    coll = RankColl()
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    first = runs_db_mongo.seed_rank_for(None, "SEEDX")
    assert coll.counts == 6
    second = runs_db_mongo.seed_rank_for(None, "SEEDY")
    assert coll.counts == 10
    assert first["global_total"] == second["global_total"] == 0
    assert cache_store[runs_db_mongo._GLOBAL_WINS_KEY] == 0


def test_seed_rank_route_caches_per_seed_and_player(mongo_env, monkeypatch):
    calls = []

    def fake(steam_id, seed):
        calls.append((steam_id, seed))
        return {"seed": seed, "global_total": len(calls)}

    monkeypatch.setattr(runs_db_mongo, "seed_rank_for", fake)
    url = "/api/runs/leaderboard/seed-rank"
    a = client.get(url, params={"seed": "SEEDX", "steam_id": "7656"}).json()
    b = client.get(url, params={"seed": "SEEDX", "steam_id": "7656"}).json()
    assert a == b
    client.get(url, params={"seed": "SEEDX", "steam_id": "9999"})
    client.get(url, params={"seed": "SEEDX"})
    assert calls == [("7656", "SEEDX"), ("9999", "SEEDX"), (None, "SEEDX")]


def test_user_runs_limit_never_reaches_mongo_as_zero(monkeypatch):
    seen = {}

    class Cursor:
        def sort(self, spec):
            seen["sort"] = spec
            return self

        def skip(self, n):
            seen["skip"] = n
            return self

        def limit(self, n):
            seen["limit"] = n
            return self

        def __iter__(self):
            return iter(())

    class Coll:
        def count_documents(self, q):
            return 0

        def find(self, q, projection=None):
            return Cursor()

    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: Coll())
    runs_db_mongo.get_user_runs("0" * 24, page=0, limit=0)
    assert seen["limit"] == 1 and seen["skip"] == 0
    assert seen["sort"] == [("played_at", -1), ("submitted_at", -1)]


class ValidatorColl:
    name = "runs"

    def __init__(self, options=None, fail=None):
        self._options = options or {}
        self.fail = fail
        self.commands = []
        self.database = self

    def options(self):
        return self._options

    def command(self, *a, **kw):
        self.commands.append((a, kw))
        if self.fail:
            raise self.fail


def test_validator_is_applied_once_and_then_left_alone():
    coll = ValidatorColl()
    runs_db_mongo._ensure_run_validator(coll)
    assert len(coll.commands) == 1
    applied = coll.commands[0][1]
    settled = ValidatorColl(
        options={
            "validator": applied["validator"],
            "validationLevel": applied["validationLevel"],
            "validationAction": applied["validationAction"],
        }
    )
    runs_db_mongo._ensure_run_validator(settled)
    assert settled.commands == []


def test_validator_is_reapplied_when_the_level_drifts():
    coll = ValidatorColl()
    runs_db_mongo._ensure_run_validator(coll)
    drifted = ValidatorColl(
        options={
            "validator": coll.commands[0][1]["validator"],
            "validationLevel": "strict",
        }
    )
    runs_db_mongo._ensure_run_validator(drifted)
    assert len(drifted.commands) == 1


def test_busy_collmod_logs_a_warning_not_an_error(caplog):
    coll = ValidatorColl(
        fail=OperationFailure("a background operation is running", 12587)
    )
    with caplog.at_level(logging.WARNING, logger=runs_db_mongo.logger.name):
        runs_db_mongo._ensure_run_validator(coll)
    levels = [r.levelno for r in caplog.records]
    assert levels == [logging.WARNING]


def test_collection_setup_runs_once_under_concurrent_first_calls(monkeypatch):
    built = []
    setups = []
    gate = threading.Event()

    class Client:
        def __init__(self, url, **kwargs):
            built.append(url)
            gate.wait(2)

        def get_default_database(self):
            return self

        @property
        def runs(self):
            return "runs-collection"

    monkeypatch.setenv("MONGO_URL", "mongodb://test")
    monkeypatch.setattr(runs_db_mongo, "MongoClient", Client)
    monkeypatch.setattr(runs_db_mongo, "_client", None)
    monkeypatch.setattr(runs_db_mongo, "_coll", None)
    monkeypatch.setattr(runs_db_mongo, "_ensure_indexes", setups.append)
    monkeypatch.setattr(runs_db_mongo, "_ensure_run_validator", setups.append)
    got = []
    threads = [
        threading.Thread(target=lambda: got.append(runs_db_mongo._get_collection()))
        for _ in range(4)
    ]
    for t in threads:
        t.start()
    gate.set()
    for t in threads:
        t.join(5)
    assert got == ["runs-collection"] * 4
    assert built == ["mongodb://test"]
    assert setups == ["runs-collection", "runs-collection"]


def test_presence_count_is_cached_and_publicly_cacheable(mongo_env, monkeypatch):
    calls = []

    def fake_count():
        calls.append(1)
        return 42

    monkeypatch.setattr(presence_db, "active_count", fake_count)
    first = client.get("/api/presence/count")
    second = client.get("/api/presence/count")
    assert first.status_code == 200
    assert first.json() == second.json() == {"count": 42}
    assert first.headers["cache-control"] == "public, max-age=10"
    assert len(calls) == 1


def test_presence_roster_stays_uncached(mongo_env, monkeypatch):
    monkeypatch.setattr(presence_db, "active", lambda limit: [])
    r = client.get("/api/presence/active")
    assert r.json() == {"count": 0, "players": []}
    assert r.headers["cache-control"] == "no-store"
