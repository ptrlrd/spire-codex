"""Player-count stat slices must never compute on the request path: any
players filter on the live aggregation scans the whole collection and dies
at the 20 s cap, so the lake builds them and reads serve them at any age."""

from datetime import datetime, timedelta, timezone

from app.services import runs_db_mongo
from app.services.runs_db_mongo import (
    MATERIALIZED_STATS_KEYS,
    PLAYERS_FILTER_COMBOS,
    _filter_key,
)


def test_every_player_count_slice_is_materialized():
    assert len(PLAYERS_FILTER_COMBOS) == 4 * 6 + 4 * 11
    for p in ("1", "2", "3", "4"):
        for c in (None, "IRONCLAD", "SILENT", "DEFECT", "NECROBINDER", "REGENT"):
            assert _filter_key(character=c, players=p) in MATERIALIZED_STATS_KEYS
        for a in range(11):
            assert _filter_key(players=p, ascension=str(a)) in MATERIALIZED_STATS_KEYS


class _FakeSummaryColl:
    def __init__(self, doc):
        self.doc = doc

    def find_one(self, q):
        return dict(self.doc) if q.get("_id") == self.doc["_id"] else None


def test_reader_serves_a_stale_player_count_doc(monkeypatch):
    old = datetime.now(timezone.utc) - timedelta(hours=6)
    key = _filter_key(players="2")
    fake = _FakeSummaryColl({"_id": key, "updated_at": old, "total_runs": 77})
    monkeypatch.setattr(runs_db_mongo, "_summary_coll", lambda: fake)
    out = runs_db_mongo.read_stats_summary(players="2")
    assert out is not None and out["total_runs"] == 77
