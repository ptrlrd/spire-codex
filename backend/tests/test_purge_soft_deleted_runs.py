"""The purge removes every soft-deleted run and what is stored beside it,
leaves live runs alone, changes nothing on a dry run and can be run twice."""

from datetime import datetime, timezone
from types import SimpleNamespace

from app.services import replays_db, runs_db_mongo
from scripts import purge_soft_deleted_runs as script

GONE = datetime(2026, 5, 1, tzinfo=timezone.utc)


def _matches(doc, query):
    for key, want in query.items():
        have = doc.get(key)
        if isinstance(want, dict) and "$ne" in want:
            if have == want["$ne"]:
                return False
        elif isinstance(want, dict) and "$in" in want:
            if have not in want["$in"]:
                return False
        elif have != want:
            return False
    return True


class FakeCursor(list):
    def limit(self, n):
        return FakeCursor(self[:n])


class FakeColl:
    def __init__(self, docs=None):
        self.docs = {d["_id"]: d for d in (docs or [])}
        self.before_delete = None

    def find(self, query, projection=None):
        return FakeCursor(dict(d) for d in self.docs.values() if _matches(d, query))

    def count_documents(self, query):
        return len(self.find(query))

    def delete_one(self, query):
        if self.before_delete:
            self.before_delete(query)
        for key, doc in list(self.docs.items()):
            if _matches(doc, query):
                del self.docs[key]
                return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)


def _wire(monkeypatch, tmp_path):
    runs = FakeColl(
        [
            {"_id": "d1", "deleted_at": GONE, "ascension": 5, "win": True},
            {"_id": "d2", "deleted_at": GONE, "hidden": True},
            {"_id": "d3", "deleted_at": GONE},
            {"_id": "live", "ascension": 5},
            {"_id": "nulled", "deleted_at": None},
        ]
    )
    blobs = FakeColl([{"_id": h} for h in ("d1", "d2", "live", "nulled")])
    replays = FakeColl([{"_id": "d1"}, {"_id": "live"}])
    bumps: list[tuple[str, int]] = []
    evicted: list[str] = []
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: runs)
    monkeypatch.setattr(runs_db_mongo, "_blob_collection", lambda: blobs)
    monkeypatch.setattr(replays_db, "_coll", lambda: replays)
    monkeypatch.setattr(runs_db_mongo, "_data_dir", tmp_path)
    monkeypatch.setattr(
        runs_db_mongo,
        "bump_stats_counters",
        lambda row, delta=1: bumps.append((row["_id"], delta)),
    )
    monkeypatch.setattr(runs_db_mongo, "evict_run_pages", evicted.extend)
    monkeypatch.setattr(script.time, "sleep", lambda _s: None)
    (tmp_path / "runs").mkdir()
    for h in ("d1", "d3", "live"):
        (tmp_path / "runs" / f"{h}.json").write_text("{}")
    return runs, blobs, replays, bumps, evicted


def test_survey_counts_without_changing_anything(monkeypatch, tmp_path):
    runs, blobs, replays, _, _ = _wire(monkeypatch, tmp_path)
    assert script.survey(batch=2) == {"runs": 3, "blobs": 2, "replays": 1, "files": 2}
    assert len(runs.docs) == 5 and len(blobs.docs) == 4 and len(replays.docs) == 2
    assert (tmp_path / "runs" / "d1.json").exists()


def test_purge_clears_every_store_for_deleted_runs_only(monkeypatch, tmp_path):
    runs, blobs, replays, bumps, evicted = _wire(monkeypatch, tmp_path)
    assert script.purge(batch=2, pause=0) == 3
    assert set(runs.docs) == {"live", "nulled"}
    assert set(blobs.docs) == {"live", "nulled"}
    assert set(replays.docs) == {"live"}
    assert sorted(p.name for p in (tmp_path / "runs").iterdir()) == ["live.json"]
    assert bumps == []
    assert sorted(evicted) == ["d1", "d2", "d3"]


def test_purge_twice_is_a_no_op(monkeypatch, tmp_path):
    runs, *_ = _wire(monkeypatch, tmp_path)
    assert script.purge(batch=10, pause=0) == 3
    assert script.purge(batch=10, pause=0) == 0
    assert script.survey() == {"runs": 0, "blobs": 0, "replays": 0, "files": 0}
    assert set(runs.docs) == {"live", "nulled"}


def test_run_restored_mid_purge_is_kept(monkeypatch, tmp_path):
    runs, blobs, replays, _, _ = _wire(monkeypatch, tmp_path)

    def restore(query):
        if query.get("_id") == "d1":
            runs.docs["d1"].pop("deleted_at", None)

    runs.before_delete = restore
    assert script.purge(batch=10, pause=0) == 2
    assert "d1" in runs.docs and "d1" in blobs.docs and "d1" in replays.docs
    assert (tmp_path / "runs" / "d1.json").exists()


def test_main_dry_run_leaves_everything(monkeypatch, tmp_path, capsys):
    runs, *_ = _wire(monkeypatch, tmp_path)
    monkeypatch.setenv("MONGO_URL", "mongodb://unused")
    monkeypatch.setattr("sys.argv", ["purge_soft_deleted_runs"])
    assert script.main() == 0
    assert len(runs.docs) == 5
    assert (
        "soft-deleted runs: 3 (blobs 2, replays 1, files 2)" in capsys.readouterr().out
    )


def test_main_apply_reports_what_is_left(monkeypatch, tmp_path, capsys):
    runs, *_ = _wire(monkeypatch, tmp_path)
    monkeypatch.setenv("MONGO_URL", "mongodb://unused")
    monkeypatch.setattr("sys.argv", ["purge_soft_deleted_runs", "--apply"])
    assert script.main() == 0
    assert set(runs.docs) == {"live", "nulled"}
    assert "removed 3, 0 soft-deleted runs left" in capsys.readouterr().out
