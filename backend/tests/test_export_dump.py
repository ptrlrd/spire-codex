"""The daily dump is the paged export's line shape, built off the serving box,
with hidden and deleted runs left out and nothing from the staging envelope
written through. The bare API call points at it once it exists."""

import gzip
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "lab"))

import export_dump  # noqa: E402
from app.main import app  # noqa: E402
from app.routers import exports  # noqa: E402

client = TestClient(app, raise_server_exceptions=False)


def _token(doc):
    if doc.get("username") and doc.get("user_id"):
        return "tok-" + str(doc["user_id"])
    return None


def test_export_line_drops_meta_and_adds_the_token():
    obj = {
        "seed": "S",
        "players": [],
        "run_hash": "h1",
        "_meta": {"username": "Yitsy", "user_id": "u1", "hidden": False},
    }
    line = json.loads(export_dump.export_line(obj, _token))
    assert line == {
        "seed": "S",
        "players": [],
        "run_hash": "h1",
        "player_token": "tok-u1",
    }


def test_hidden_deleted_and_anonymous_runs():
    assert (
        export_dump.export_line({"run_hash": "h", "_meta": {"hidden": True}}, _token)
        is None
    )
    assert (
        export_dump.export_line({"run_hash": "d", "_meta": {"deleted": True}}, _token)
        is None
    )
    anon = {"run_hash": "a", "_meta": {"username": None, "user_id": "u9"}}
    assert json.loads(export_dump.export_line(anon, _token))["player_token"] is None


def test_build_dedupes_excludes_and_respects_freshness(tmp_path, monkeypatch):
    monkeypatch.setattr(export_dump, "LAKE", tmp_path)
    monkeypatch.setattr(export_dump, "STAGING", tmp_path / "staging")
    (tmp_path / "staging").mkdir()
    monkeypatch.setenv("JWT_SECRET", "s")
    rows = [
        {"run_hash": "h1", "seed": "A", "_meta": {"username": "x", "user_id": "u1"}},
        {"run_hash": "h2", "seed": "B", "_meta": {"username": None}},
        {"run_hash": "h1", "seed": "A", "_meta": {"username": "x", "user_id": "u1"}},
        {"run_hash": "h3", "seed": "C", "_meta": {"username": "y", "user_id": "u3"}},
    ]
    with gzip.open(tmp_path / "staging" / "00001.jsonl.gz", "wt") as f:
        f.writelines(json.dumps(r) + "\n" for r in rows[:2])
    with gzip.open(tmp_path / "staging" / "00002.jsonl.gz", "wt") as f:
        f.writelines(json.dumps(r) + "\n" for r in rows[2:])
    with gzip.open(tmp_path / "excluded_current.jsonl.gz", "wt") as f:
        f.write(json.dumps({"run_hash": "h3"}) + "\n")
    manifest = export_dump.build()
    assert manifest["runs"] == 2
    with gzip.open(tmp_path / "runs_export.jsonl.gz", "rt") as f:
        lines = [json.loads(line) for line in f]
    assert [x["run_hash"] for x in lines] == ["h1", "h2"]
    assert lines[0]["player_token"] and lines[1]["player_token"] is None
    assert all("_meta" not in x for x in lines)
    assert json.loads((tmp_path / "runs_export.json").read_text())["runs"] == 2
    assert export_dump.fresh()
    assert export_dump.build() is None
    assert export_dump.build(force=True)["runs"] == 2


@pytest.fixture
def no_limiter(monkeypatch):
    from app.dependencies import shared_limiter

    monkeypatch.setattr(shared_limiter, "enabled", False)


def test_bare_export_redirects_to_the_dump_when_published(
    tmp_path, monkeypatch, no_limiter
):
    monkeypatch.setattr(exports, "LAKE_DIR", tmp_path)
    (tmp_path / "runs_export.jsonl.gz").write_bytes(b"x")
    (tmp_path / "runs_export.json").write_text(
        json.dumps({"generated_at": "2026-09-25T04:00:00Z", "runs": 5})
    )
    r = client.get("/api/exports/runs", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"] == "/exports/runs-latest.jsonl.gz"
    assert r.headers["x-export-runs"] == "5"
    m = client.get("/api/exports/runs/manifest")
    assert m.status_code == 200 and m.json()["url"] == "/exports/runs-latest.jsonl.gz"


def test_manifest_404s_before_the_first_dump(tmp_path, monkeypatch, no_limiter):
    monkeypatch.setattr(exports, "LAKE_DIR", tmp_path)
    assert exports.dump_manifest() is None
    assert client.get("/api/exports/runs/manifest").status_code == 404
