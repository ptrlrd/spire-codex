"""A paged export of one game version walks an index and cannot run forever."""

import pytest
from fastapi import HTTPException
from pymongo.errors import ExecutionTimeout

from app.routers import exports
from app.services import runs_db_mongo


class _Cursor:
    def __init__(self, fail):
        self.fail = fail
        self.max_ms = None

    def sort(self, order):
        return self

    def limit(self, n):
        return self

    def max_time_ms(self, ms):
        self.max_ms = ms
        return self

    def __iter__(self):
        if self.fail:
            raise ExecutionTimeout("operation exceeded time limit")
        return iter([])

    def close(self):
        pass


class _Coll:
    def __init__(self, fail=False):
        self.cursor = _Cursor(fail)

    def find(self, *args, **kwargs):
        return self.cursor


def test_version_export_has_an_index_in_sort_order():
    specs = {o["name"]: k for k, o in runs_db_mongo._background_index_specs()}
    assert [k for k, _ in specs[runs_db_mongo.BUILD_EXPORT_INDEX]] == [
        "build_id",
        "submitted_at",
        "_id",
    ]


def test_paged_query_is_time_limited(monkeypatch):
    coll = _Coll()
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    assert exports._page_hashes(None, None, None, 200, "v0.111.0") == ([], None)
    assert coll.cursor.max_ms == exports.PAGE_QUERY_TIMEOUT_MS


def test_slow_page_returns_503(monkeypatch):
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: _Coll(fail=True))
    with pytest.raises(HTTPException) as err:
        exports._page_hashes(None, None, None, 200, "v0.111.0")
    assert err.value.status_code == 503
    assert err.value.headers == {"Retry-After": "60"}


def test_unbounded_window_is_time_limited_too(monkeypatch):
    coll = _Coll()
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    exports._page_hashes(None, None, None, None, "v0.111.0")
    assert coll.cursor.max_ms == exports.UNBOUNDED_QUERY_TIMEOUT_MS
