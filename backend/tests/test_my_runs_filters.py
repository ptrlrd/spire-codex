"""The profile Runs tab filters with the same expressions as the run
browser: /api/auth/runs folds them into the owner's match."""

from app.services import runs_db_mongo


class FakeCursor:
    def sort(self, *a, **k):
        return self

    def skip(self, n):
        return self

    def limit(self, n):
        return self

    def __iter__(self):
        return iter([])


class FakeColl:
    def __init__(self):
        self.matches = []

    def count_documents(self, q):
        self.matches.append(q)
        return 0

    def find(self, q, projection=None):
        return FakeCursor()


def test_filters_join_the_owner_match(monkeypatch):
    coll = FakeColl()
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    runs_db_mongo.get_user_runs(
        "0" * 24,
        character="ironclad",
        ascension_min=3,
        ascension_max=7,
        card="bash,anger",
        win="true",
    )
    q = coll.matches[0]
    assert str(q["user_id"]) == "0" * 24 and q["deleted_at"] is None
    assert q["character"] == "IRONCLAD"
    assert q["ascension"] == {"$gte": 3, "$lte": 7}
    assert q["deck.id"] == {"$all": ["BASH", "ANGER"]}
    assert q["win"] == {"$in": [True, 1]}
    assert "hidden" not in q


def test_no_filters_keeps_the_plain_owner_match(monkeypatch):
    coll = FakeColl()
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    runs_db_mongo.get_user_runs("0" * 24)
    assert set(coll.matches[0]) == {"user_id", "deleted_at"}
