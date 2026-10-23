"""An empty or truncated run file must never 500 the share page or get
pinned in the blob cache: the loader falls back to the Mongo copy of the
blob, and a hash with neither is a clean miss."""

import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import runs as runs_router
from app.services import runs_db

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def run_dir(tmp_path, monkeypatch):
    (tmp_path / "runs").mkdir()
    monkeypatch.setattr(runs_router, "_data_dir", tmp_path)
    runs_router._load_run_blob.cache_clear()
    yield tmp_path
    runs_router._load_run_blob.cache_clear()


def test_empty_file_falls_back_to_mongo_blob(run_dir, monkeypatch):
    (run_dir / "runs" / "abc123.json").write_text("")
    monkeypatch.setenv("MONGO_URL", "mongodb://unused")
    from app.services import runs_db_mongo

    monkeypatch.setattr(runs_db_mongo, "get_run_blob", lambda h: {"seed": "S1"})
    text = runs_router._load_run_blob("abc123")
    assert json.loads(text) == {"seed": "S1"}


def test_empty_file_without_blob_is_a_miss_and_not_cached(run_dir, monkeypatch):
    path = run_dir / "runs" / "dead01.json"
    path.write_text("")
    monkeypatch.delenv("MONGO_URL", raising=False)
    assert runs_router._load_run_blob("dead01") is None
    path.write_text(json.dumps({"seed": "S2"}))
    assert json.loads(runs_router._load_run_blob("dead01")) == {"seed": "S2"}


def test_truncated_file_is_rejected(run_dir, monkeypatch):
    (run_dir / "runs" / "half01.json").write_text('{"seed": "S3", "play')
    monkeypatch.delenv("MONGO_URL", raising=False)
    assert runs_router._load_run_blob("half01") is None


def test_atomic_writer_leaves_no_temp_and_full_content(tmp_path):
    target = tmp_path / "w1.json"
    runs_db.write_run_file_atomic(target, {"a": 1})
    assert json.loads(target.read_text()) == {"a": 1}
    assert [p.name for p in tmp_path.iterdir()] == ["w1.json"]


def test_atomic_writer_failure_keeps_old_file(tmp_path):
    target = tmp_path / "w2.json"
    target.write_text(json.dumps({"old": True}))
    with pytest.raises(TypeError):
        runs_db.write_run_file_atomic(target, {"bad": object()})
    assert json.loads(target.read_text()) == {"old": True}
    assert [p.name for p in tmp_path.iterdir()] == ["w2.json"]
