from app.services import runs_db_mongo


class _Cursor:
    def __init__(self, calls):
        self.calls = calls

    def sort(self, *a, **k):
        return self

    def skip(self, n):
        self.calls["skip"] = n
        return self

    def limit(self, n):
        self.calls["limit"] = n
        return self

    def __iter__(self):
        return iter(())


class _Coll:
    name = "runs"

    def __init__(self):
        self.calls = {}

    def find(self, *a, **k):
        return _Cursor(self.calls)


def _patch(monkeypatch):
    coll = _Coll()
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    monkeypatch.setattr(runs_db_mongo, "count_with_budget", lambda c, q: (7, False))
    return coll


def test_zero_limit_still_caps_the_query(monkeypatch):
    coll = _patch(monkeypatch)
    out = runs_db_mongo.list_runs(limit=0)
    assert coll.calls["limit"] == 1
    assert out["per_page"] == 1
    assert out["total_pages"] == 7


def test_negative_limit_still_caps_the_query(monkeypatch):
    coll = _patch(monkeypatch)
    runs_db_mongo.list_runs(limit=-5)
    assert coll.calls["limit"] == 1


def test_large_limit_caps_at_100(monkeypatch):
    coll = _patch(monkeypatch)
    runs_db_mongo.list_runs(limit=5000)
    assert coll.calls["limit"] == 100
