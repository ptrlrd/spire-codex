"""A permanent delete removes the run doc, its blob, its file and its replay,
gives the run back to the live counters, and only ever touches the caller's
own run."""

from app.services import replays_db, runs_db_mongo

OWNER = {"_id": "u1", "steam_id": "7656"}
OTHER = {"_id": "u2", "steam_id": "1111"}


class FakeColl:
    def __init__(self, docs=None):
        self.docs = {d["_id"]: d for d in (docs or [])}
        self.deleted: list[str] = []

    def find_one(self, query, projection=None):
        doc = self.docs.get(query.get("_id"))
        if doc is None:
            return None
        if projection:
            return {k: v for k, v in doc.items() if k in projection or k == "_id"}
        return dict(doc)

    def delete_one(self, query):
        key = query.get("_id")
        self.deleted.append(key)
        self.docs.pop(key, None)


def _wire(monkeypatch, tmp_path, run_doc):
    runs = FakeColl([run_doc] if run_doc else [])
    blobs = FakeColl([{"_id": "abc", "blob": {}}])
    replays = FakeColl([{"_id": "abc"}])
    bumps: list[tuple[str, int]] = []
    evicted: list[list[str]] = []
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: runs)
    monkeypatch.setattr(runs_db_mongo, "_blob_collection", lambda: blobs)
    monkeypatch.setattr(replays_db, "_coll", lambda: replays)
    monkeypatch.setattr(runs_db_mongo, "_data_dir", tmp_path)
    monkeypatch.setattr(
        runs_db_mongo,
        "bump_stats_counters",
        lambda row, delta=1: bumps.append((row["_id"], delta)),
    )
    monkeypatch.setattr(runs_db_mongo, "evict_run_pages", evicted.append)
    (tmp_path / "runs").mkdir()
    (tmp_path / "runs" / "abc.json").write_text("{}")
    return runs, blobs, replays, bumps, evicted


def test_owner_delete_clears_every_store(monkeypatch, tmp_path):
    runs, blobs, replays, bumps, evicted = _wire(
        monkeypatch,
        tmp_path,
        {"_id": "abc", "user_id": "u1", "character": "SILENT", "win": True},
    )
    assert runs_db_mongo.delete_run_permanently("abc", OWNER) == {"success": True}
    assert runs.docs == {} and blobs.docs == {} and replays.docs == {}
    assert not (tmp_path / "runs" / "abc.json").exists()
    assert bumps == [("abc", -1)]
    assert evicted == [["abc"]]


def test_hidden_run_does_not_touch_the_counters(monkeypatch, tmp_path):
    _, _, _, bumps, _ = _wire(
        monkeypatch, tmp_path, {"_id": "abc", "user_id": "u1", "hidden": True}
    )
    assert runs_db_mongo.delete_run_permanently("abc", OWNER)["success"]
    assert bumps == []


def test_steam_id_ownership_counts_too(monkeypatch, tmp_path):
    runs, *_ = _wire(monkeypatch, tmp_path, {"_id": "abc", "steam_id": "7656"})
    assert runs_db_mongo.delete_run_permanently("abc", OWNER)["success"]
    assert runs.docs == {}


def test_someone_elses_run_is_left_alone(monkeypatch, tmp_path):
    runs, blobs, replays, bumps, _ = _wire(
        monkeypatch, tmp_path, {"_id": "abc", "user_id": "u1"}
    )
    assert runs_db_mongo.delete_run_permanently("abc", OTHER) == {
        "error": "You do not own this run"
    }
    assert "abc" in runs.docs and "abc" in blobs.docs and "abc" in replays.docs
    assert (tmp_path / "runs" / "abc.json").exists()
    assert bumps == []


def test_missing_run(monkeypatch, tmp_path):
    _wire(monkeypatch, tmp_path, None)
    assert runs_db_mongo.delete_run_permanently("abc", OWNER) == {
        "error": "Run not found"
    }
