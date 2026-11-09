from datetime import datetime, timezone

import pytest
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.services import data_service, published_guides as pg


class _Result:
    def __init__(self, inserted_id=None):
        self.inserted_id = inserted_id


class _Cursor(list):
    def sort(self, key, direction):
        return _Cursor(
            sorted(self, key=lambda d: d.get(key) or "", reverse=direction < 0)
        )


class _Coll:
    def __init__(self):
        self.docs = []
        self.unique = None

    def _match(self, flt):
        return [d for d in self.docs if all(d.get(k) == v for k, v in flt.items())]

    def create_index(self, field, unique=False):
        self.unique = field if unique else None

    def insert_one(self, doc):
        if self.unique and self._match({self.unique: doc[self.unique]}):
            raise DuplicateKeyError("dup")
        doc = {"_id": ObjectId(), **doc}
        self.docs.append(doc)
        return _Result(doc["_id"])

    def find(self, flt):
        return _Cursor(dict(d) for d in self._match(flt))

    def find_one(self, flt=None):
        hits = self._match(flt or {})
        return dict(hits[0]) if hits else None

    def update_one(self, flt, update):
        for d in self._match(flt):
            d.update(update.get("$set", {}))
            for k in update.get("$unset", {}):
                d.pop(k, None)
        return _Result()

    def find_one_and_delete(self, flt):
        hits = self._match(flt)
        if not hits:
            return None
        self.docs.remove(hits[0])
        return hits[0]


class _Db(dict):
    def __missing__(self, name):
        self[name] = _Coll()
        return self[name]


@pytest.fixture
def store(monkeypatch):
    db = _Db()
    monkeypatch.setattr(pg, "_db", lambda: db)
    monkeypatch.setattr(pg, "_enabled", lambda: True)
    repo = [
        {
            "id": "repo-guide",
            "slug": "repo-guide",
            "title": "Repo",
            "date": "2026-01-01",
        }
    ]
    monkeypatch.setattr(data_service, "load_guides", lambda: repo)
    monkeypatch.setattr(data_service, "_load_guides_versioned", lambda v: repo)
    pg._invalidate()
    return db


def _submit(db, **extra):
    doc = {
        "status": "pending",
        "created_at": datetime(2026, 10, 15, tzinfo=timezone.utc),
        "title": "Pick a target first",
        "author_name": "Someone",
        "contact": "private@example.com",
        "category": "strategy",
        "difficulty": "beginner",
        "character": "ironclad",
        "tags": "ironclad, targeting",
        "summary": "Short",
        "content": "## Body\n\ntext <script>x</script>",
        **extra,
    }
    return str(db["guide_submissions"].insert_one(doc).inserted_id)


def test_publish_serves_the_guide_and_closes_the_submission(store):
    sub_id = _submit(store)
    guide = pg.publish_submission(sub_id, {"title": "Pick a target", "slug": None})
    assert guide["slug"] == "pick-a-target"
    assert guide["date"] == "2026-10-15"
    assert guide["tags"] == ["ironclad", "targeting"]
    assert "<script>" not in guide["content"]
    assert "contact" not in guide
    slugs = [g["slug"] for g in pg.all_guides()]
    assert slugs == ["pick-a-target", "repo-guide"]
    assert store["guide_submissions"].find_one()["status"] == "published"
    with pytest.raises(pg.GuideError):
        pg.publish_submission(sub_id, {})


def test_publish_rejects_a_slug_that_is_taken(store):
    with pytest.raises(pg.GuideError):
        pg.publish_submission(_submit(store), {"slug": "repo-guide"})
    first = _submit(store)
    pg.publish_submission(first, {})
    with pytest.raises(pg.GuideError):
        pg.publish_submission(_submit(store), {})


def test_edit_keeps_the_slug_and_unpublish_requeues(store):
    sub_id = _submit(store)
    slug = pg.publish_submission(sub_id, {})["slug"]
    edited = pg.update_published(slug, {"summary": "Better", "slug": "other"})
    assert edited["slug"] == slug and edited["summary"] == "Better"
    assert edited["updated"] and edited["date"] == "2026-10-15"
    assert pg.unpublish(slug) is True
    assert [g["slug"] for g in pg.all_guides()] == ["repo-guide"]
    assert store["guide_submissions"].find_one()["status"] == "pending"
    assert pg.unpublish(slug) is False


def test_pinned_version_and_missing_store_serve_repo_guides(store, monkeypatch):
    pg.publish_submission(_submit(store), {})
    monkeypatch.setattr(data_service, "_get_version", lambda: "v0.100.0")
    assert [g["slug"] for g in pg.all_guides()] == ["repo-guide"]
    monkeypatch.setattr(data_service, "_get_version", lambda: None)
    monkeypatch.setattr(pg, "_enabled", lambda: False)
    assert [g["slug"] for g in pg.all_guides()] == ["repo-guide"]
