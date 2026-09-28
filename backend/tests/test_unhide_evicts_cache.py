"""Hiding or unhiding a run evicts every affected share-page payload from
the Redis layer, sibling hashes included, so the change shows on the next
request instead of after the 15 minute TTL."""

from app.services import runs_db_mongo


class _Result:
    matched_count = 2
    modified_count = 2


class _Coll:
    def __init__(self, rows):
        self.rows = rows
        self.updates = []

    def find(self, query, projection=None):
        return list(self.rows)

    def update_many(self, query, update):
        self.updates.append((query, update))
        return _Result()


def test_set_run_hidden_evicts_all_sibling_pages(monkeypatch):
    coll = _Coll(
        [
            {"_id": "7d81bfe17b82f5c7", "hidden": True, "character": "IRONCLAD"},
            {"_id": "2db1cc858adc2465", "hidden": True, "character": "SILENT"},
        ]
    )
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    bumps = []
    monkeypatch.setattr(
        runs_db_mongo, "bump_stats_counters", lambda row, delta: bumps.append(delta)
    )
    deleted = []
    from app.services import cache

    monkeypatch.setattr(cache, "delete", lambda key: deleted.append(key))
    out = runs_db_mongo.set_run_hidden("2db1cc858adc2465", False)
    assert out["hashes"] == ["2db1cc858adc2465", "7d81bfe17b82f5c7"]
    assert deleted == ["run:2db1cc858adc2465", "run:7d81bfe17b82f5c7"]
    assert bumps == [1, 1]
    assert coll.updates[0][1] == {"$unset": {"hidden": "", "hidden_reason": ""}}


def test_eviction_failure_never_breaks_the_flag_change(monkeypatch):
    coll = _Coll([{"_id": "abc", "hidden": False}])
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    monkeypatch.setattr(runs_db_mongo, "bump_stats_counters", lambda row, delta: None)
    from app.services import cache

    def boom(key):
        raise RuntimeError("redis down")

    monkeypatch.setattr(cache, "delete", boom)
    out = runs_db_mongo.set_run_hidden("abc", True, reason="manual")
    assert out["hashes"] == ["abc"]
    assert coll.updates[0][1] == {"$set": {"hidden": True, "hidden_reason": "manual"}}
