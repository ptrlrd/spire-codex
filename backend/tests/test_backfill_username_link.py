"""backfill_user_runs must claim runs tagged with only a username: the
Compendium watcher uploads with ?username= and no steam_id/token, so those
runs carried the name but never appeared on the profile (found live on
2026-08-15, Godlander: 704 runs in the DB, 24 on the profile)."""

from bson import ObjectId

from app.services import runs_db_mongo


USER_ID = "6" * 24
OTHER_ID = "7" * 24


def _matches(doc, cond):
    for k, v in cond.items():
        if k == "$or":
            if not any(_matches(doc, c) for c in v):
                return False
        elif isinstance(v, dict) and "$ne" in v:
            if doc.get(k) == v["$ne"]:
                return False
        elif doc.get(k) != v:
            return False
    return True


class FakeColl:
    def __init__(self, docs):
        self.docs = docs

    def update_many(self, flt, update):
        modified = 0
        for doc in self.docs:
            if _matches(doc, flt):
                doc.update(update["$set"])
                modified += 1
        return type("R", (), {"modified_count": modified})()


def _docs():
    return [
        {"_id": "a", "user_id": None, "steam_id": "123", "username_lower": None},
        {"_id": "b", "user_id": None, "steam_id": None, "username_lower": "godlander"},
        {
            "_id": "c",
            "user_id": ObjectId(OTHER_ID),
            "steam_id": None,
            "username_lower": "godlander",
        },
        {
            "_id": "d",
            "user_id": None,
            "steam_id": None,
            "username_lower": "someoneelse",
        },
    ]


def _run(monkeypatch, docs, **kwargs):
    coll = FakeColl(docs)
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    return runs_db_mongo.backfill_user_runs(USER_ID, **kwargs), docs


def test_username_only_runs_link_on_signin(monkeypatch):
    linked, docs = _run(monkeypatch, _docs(), steam_id="123", username="Godlander")
    assert linked == 2
    assert docs[0]["user_id"] == ObjectId(USER_ID)  # steam-tagged
    assert docs[1]["user_id"] == ObjectId(USER_ID)  # username-only (Compendium)
    assert docs[1]["username"] == "Godlander"


def test_owned_and_foreign_runs_untouched(monkeypatch):
    linked, docs = _run(monkeypatch, _docs(), username="Godlander")
    assert linked == 1
    assert docs[2]["user_id"] == ObjectId(OTHER_ID)  # another account keeps its run
    assert docs[3]["user_id"] is None  # different username stays anonymous


def test_no_identity_is_a_noop(monkeypatch):
    linked, docs = _run(monkeypatch, _docs())
    assert linked == 0
    assert all(d["user_id"] in (None, ObjectId(OTHER_ID)) for d in docs)
