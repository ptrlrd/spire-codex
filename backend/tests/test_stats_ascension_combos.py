"""Ascension stat slices must never compute on the request path (their live
aggregation outgrew the gateway timeout — issue #868): the refresher owns
them via a rotation, and reads serve the materialized doc whatever its age."""

from datetime import datetime, timedelta, timezone

from app.services import runs_db_mongo
from app.services.runs_db_mongo import (
    ASCENSION_FILTER_COMBOS,
    MATERIALIZED_STATS_KEYS,
    _filter_key,
    _pick_stalest_keys,
)


def test_every_ascension_slice_is_materialized():
    cast = runs_db_mongo._CAST
    assert len(ASCENSION_FILTER_COMBOS) == 11 * (len(cast) + 1)
    for c in (None, *cast):
        for a in range(11):
            assert _filter_key(character=c, ascension=str(a)) in MATERIALIZED_STATS_KEYS


def test_rotation_prefers_missing_then_oldest():
    now = datetime.now(timezone.utc)
    ages = {
        "fresh": now,
        "older": now - timedelta(minutes=30),
        "oldest": now - timedelta(hours=2),
        "never": None,
        "naive": (now - timedelta(hours=1)).replace(tzinfo=None),
    }
    assert _pick_stalest_keys(ages, 3) == ["never", "oldest", "naive"]


class _FakeSummaryColl:
    def __init__(self, doc):
        self.doc = doc

    def find_one(self, q):
        return dict(self.doc) if q.get("_id") == self.doc["_id"] else None


def test_reader_serves_stale_materialized_ascension_doc(monkeypatch):
    old = datetime.now(timezone.utc) - timedelta(hours=6)
    key = _filter_key(character="IRONCLAD", ascension="10")
    fake = _FakeSummaryColl({"_id": key, "updated_at": old, "total_runs": 123})
    monkeypatch.setattr(runs_db_mongo, "_summary_coll", lambda: fake)
    out = runs_db_mongo.read_stats_summary(character="IRONCLAD", ascension="10")
    assert out is not None and out["total_runs"] == 123


def test_reader_still_expires_non_materialized_combos(monkeypatch):
    old = datetime.now(timezone.utc) - timedelta(hours=6)
    key = _filter_key(username="yitsy")
    fake = _FakeSummaryColl({"_id": key, "updated_at": old, "total_runs": 5})
    monkeypatch.setattr(runs_db_mongo, "_summary_coll", lambda: fake)
    assert runs_db_mongo.read_stats_summary(username="yitsy") is None
