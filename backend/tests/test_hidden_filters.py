"""Hidden (cheated/moderated) runs must stay out of every public ranking
surface — and the exclusion must stay index-only. Putting hidden: {$ne: True}
directly into a large count disqualifies the covering index and fetches every
candidate doc (the 60s counts that 504'd submit enrichment), so the counting
paths use _count_visible: count(all) - count(hidden subset)."""

from pymongo.errors import OperationFailure

from app.routers.exports import _build_match
from app.services import runs_db_mongo

HIDDEN_CLAUSE = {"hidden": {"$ne": True}}


class FakeColl:
    """Captures the filters each query runs with."""

    def __init__(self, row=None, counts=None, reject_hint=False):
        self.row = row
        self.counts = list(counts or [])
        self.reject_hint = reject_hint
        self.find_one_queries = []
        self.count_queries = []
        self.hints = []

    def find_one(self, q, projection=None, **kwargs):
        self.find_one_queries.append(q)
        return self.row

    def count_documents(self, q, **kwargs):
        if self.reject_hint and kwargs.get("hint"):
            raise OperationFailure(
                "hint provided does not correspond to an existing index"
            )
        self.count_queries.append(q)
        self.hints.append(kwargs.get("hint"))
        return self.counts.pop(0) if self.counts else 0


def _assert_subtractive_pairs(count_queries):
    """Counts must come in (base, base+hidden:True) pairs, with $ne nowhere."""
    assert len(count_queries) % 2 == 0
    for base, hidden in zip(count_queries[::2], count_queries[1::2]):
        assert "hidden" not in base, base
        assert hidden == {**base, "hidden": True}
    for q in count_queries:
        assert q.get("hidden") != {"$ne": True}, q


def test_count_visible_subtracts_hidden_subset():
    fake = FakeColl(counts=[10, 3])
    assert runs_db_mongo._count_visible(fake, {"win": True}) == 7
    _assert_subtractive_pairs(fake.count_queries)


RANK_QUERY = {
    "win": {"$in": [True, 1]},
    "character": "IRONCLAD",
    "run_time": {"$lt": 1758},
}


def test_hidden_count_is_pinned_to_the_hidden_wins_index():
    fake = FakeColl(counts=[300000, 12])
    assert runs_db_mongo._count_visible(fake, RANK_QUERY) == 299988
    _assert_subtractive_pairs(fake.count_queries)
    assert fake.hints == [None, runs_db_mongo.HIDDEN_WINS_INDEX]


def test_ascension_or_branches_are_covered_but_foreign_fields_are_not():
    covered = {
        **RANK_QUERY,
        "game_mode": "standard",
        "$or": [{"ascension": {"$gt": 10}}, {"ascension": 10, "run_time": {"$lt": 9}}],
    }
    fake = FakeColl(counts=[1, 0])
    runs_db_mongo._count_visible(fake, covered)
    assert fake.hints == [None, runs_db_mongo.HIDDEN_WINS_INDEX]
    for query in (
        {"seed": "SEEDX", "win": {"$in": [True, 1]}},
        {"character": "IRONCLAD", "run_time": {"$lt": 5}},
        {**RANK_QUERY, "$or": [{"seed": "X"}, {"ascension": 1}]},
    ):
        fake = FakeColl(counts=[1, 0])
        runs_db_mongo._count_visible(fake, query)
        assert fake.hints == [None, None], query


def test_rejected_hint_falls_back_to_an_unhinted_count():
    fake = FakeColl(counts=[10, 4], reject_hint=True)
    assert runs_db_mongo._count_visible(fake, RANK_QUERY) == 6
    _assert_subtractive_pairs(fake.count_queries)
    assert fake.hints == [None, None]


def test_index_pass_builds_the_covering_hidden_wins_index():
    class IndexColl:
        def __init__(self):
            self.created = {}

        def create_index(self, keys, **kwargs):
            self.created[kwargs.get("name") or str(keys)] = (keys, kwargs)

    coll = IndexColl()
    runs_db_mongo._ensure_indexes(coll)
    keys, kwargs = coll.created[runs_db_mongo.HIDDEN_WINS_INDEX]
    assert [k for k, _ in keys] == [
        "win",
        "character",
        "game_mode",
        "player_count",
        "ascension",
        "run_time",
    ]
    assert kwargs["partialFilterExpression"] == {"hidden": True}
    assert set(k for k, _ in keys) == runs_db_mongo._HIDDEN_WINS_FIELDS


def test_export_match_excludes_hidden():
    match = _build_match(None, None, None)
    assert HIDDEN_CLAUSE in match["$and"]


def test_get_run_rank_refuses_hidden_run(monkeypatch):
    fake = FakeColl(
        {"win": True, "hidden": True, "character": "IRONCLAD", "run_time": 90}
    )
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: fake)
    assert runs_db_mongo.get_run_rank("h1")["rank"] is None
    assert fake.count_queries == []


def test_get_run_rank_counts_subtract_hidden(monkeypatch):
    fake = FakeColl(
        {"win": True, "character": "IRONCLAD", "run_time": 90}, counts=[8, 2]
    )
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: fake)
    out = runs_db_mongo.get_run_rank("h1")
    assert out["rank"] == 7  # (8 visible-or-hidden ahead) - (2 hidden) + 1
    _assert_subtractive_pairs(fake.count_queries)


def test_get_run_rank_scoped_subtracts_hidden(monkeypatch):
    fake = FakeColl({"win": True, "character": "SILENT", "run_time": 120})
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: fake)
    out = runs_db_mongo.get_run_rank_scoped("h2", game_mode="standard")
    assert out["rank"] == 1
    assert len(fake.count_queries) == 4  # ahead pair + total pair
    _assert_subtractive_pairs(fake.count_queries)


def test_seed_rank_for_stays_index_only(monkeypatch):
    fake = FakeColl(None)
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: fake)
    runs_db_mongo.seed_rank_for("7656119", "SEEDX")
    _assert_subtractive_pairs(fake.count_queries)
    # Seed-scoped counts keep the seed index; only the global fastest-win
    # rank is pinned to hidden_wins.
    for q, hint in zip(fake.count_queries, fake.hints):
        assert (hint is None) == ("seed" in q or "hidden" not in q), (q, hint)
    assert runs_db_mongo.HIDDEN_WINS_INDEX in fake.hints
    # The steam_id find_ones are single-doc lookups; they keep the direct
    # hidden exclusion.
    assert fake.find_one_queries
    for q in fake.find_one_queries:
        assert q.get("hidden") == {"$ne": True}, q


class _FakeCursor:
    def sort(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return iter([])


def test_daily_leaderboard_excludes_hidden(monkeypatch):
    # Hidden daily "wins" leaked onto profile daily boards until 2026-08-17.
    fake = FakeColl(None, counts=[5, 1])
    fake.find_queries = []

    def find(q, projection=None, **kw):
        fake.find_queries.append(q)
        return _FakeCursor()

    fake.find = find
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: fake)
    out = runs_db_mongo.get_daily_leaderboard("yitsy")
    assert out["total_today"] == 4  # 5 candidates minus 1 hidden
    _assert_subtractive_pairs(fake.count_queries)
    for q in fake.find_queries + fake.find_one_queries:
        assert q.get("hidden") == {"$ne": True}, q
        assert q.get("deleted_at", "missing") is None, q
