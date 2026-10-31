from app.services import user_insights as ui


class FakeColl:
    def __init__(self):
        self.docs = {}

    def replace_one(self, flt, doc, upsert=False):
        self.docs[flt["_id"]] = doc

    def find_one(self, flt):
        return self.docs.get(flt["_id"])


def test_redis_miss_serves_durable_store(monkeypatch):
    fake = FakeColl()
    fake.docs["u1:"] = {"_id": "u1:", "payload": {"total_runs": 42}}
    monkeypatch.setattr(ui, "_insights_coll", lambda: fake)
    monkeypatch.setattr(ui, "_cache_get", lambda k: None)
    stored_redis = {}
    monkeypatch.setattr("app.services.cache.get_json", lambda k: None)
    monkeypatch.setattr(
        "app.services.cache.set_json",
        lambda k, v, ttl_seconds=None: stored_redis.__setitem__(k, v),
    )
    kicked = []
    monkeypatch.setattr(ui, "_kick_refresh", lambda *a: kicked.append(a))
    out = ui.get_user_insights("u1")
    assert out == {"total_runs": 42}
    assert stored_redis, "redis should be re-warmed from the store"
    assert kicked, "a background refresh should still be kicked"


def test_never_computed_still_builds(monkeypatch):
    monkeypatch.setattr(ui, "_insights_coll", lambda: FakeColl())
    monkeypatch.setattr(ui, "_cache_get", lambda k: None)
    monkeypatch.setattr("app.services.cache.get_json", lambda k: None)
    monkeypatch.setattr(ui, "_kick_refresh", lambda *a: None)
    out = ui.get_user_insights("nobody")
    assert out.get("building") is True


def test_store_write_failure_is_soft(monkeypatch):
    class Boom:
        def replace_one(self, *a, **k):
            raise RuntimeError("db down")

    monkeypatch.setattr(ui, "_insights_coll", lambda: Boom())
    ui._store_payload("k", {"x": 1})  # must not raise


def test_hollow_blob_fetch_refuses_to_build():
    rows = [{"run_hash": f"h{i}"} for i in range(100)]
    ui._require_blob_coverage([], {})
    ui._require_blob_coverage(rows, {f"h{i}": {} for i in range(100)})
    ui._require_blob_coverage(rows, {f"h{i}": {} for i in range(95)})
    import pytest

    with pytest.raises(RuntimeError):
        ui._require_blob_coverage(rows, {}, read_failed=True)
    # A read that worked but found nothing stored serves partial, not an error.
    assert ui._require_blob_coverage(rows, {}) is False
    # Heavy-but-nonzero misses build a partial payload now instead of raising.
    assert ui._require_blob_coverage(rows, {f"h{i}": {} for i in range(85)}) is False


def test_invalidate_clears_prewarmed_fresh_markers(monkeypatch):
    deleted = []

    class FakeCache:
        @staticmethod
        def delete(key):
            deleted.append(key)

    import app.services.cache as app_cache

    monkeypatch.setattr(app_cache, "delete", FakeCache.delete)
    ui.invalidate_user_insights("u1")
    assert (
        f"user_insights:fresh:u1{ui._filters_suffix(None, None, None, None)}" in deleted
    )
    assert len(deleted) == 8


def test_hollow_payloads_are_never_stored_or_served(monkeypatch):
    hollow = {"claimed_runs": 162, "runs_walked": 0}
    legit_empty = {"claimed_runs": 0, "runs_walked": 0}
    real = {"claimed_runs": 162, "runs_walked": 160}
    assert ui._is_hollow(hollow)
    assert not ui._is_hollow(legit_empty)
    assert not ui._is_hollow(real)
    assert not ui._is_hollow(None)

    fake = FakeColl()
    monkeypatch.setattr(ui, "_insights_coll", lambda: fake)
    ui._store_payload("u9:", hollow)
    assert "u9:" not in fake.docs
    ui._store_payload("u9:", real)
    assert fake.docs["u9:"]["payload"] == real
