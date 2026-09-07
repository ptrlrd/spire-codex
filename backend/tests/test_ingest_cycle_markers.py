"""A cycle writes a start record before doing anything, and the next start
closes out a predecessor that vanished without a completion record (an OOM
kill writes nothing of its own)."""

import importlib.util
import json
import pathlib
import sys
import types

import pytest


@pytest.fixture
def ingest(tmp_path, monkeypatch):
    monkeypatch.setitem(sys.modules, "extract", types.ModuleType("extract"))
    spec = importlib.util.spec_from_file_location(
        "ingest_under_test",
        pathlib.Path(__file__).resolve().parents[2] / "lab" / "ingest.py",
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    monkeypatch.setattr(mod, "LAKE", tmp_path)
    return mod


def _records(path):
    return [
        json.loads(ln)
        for ln in (path / "ingest_metrics.jsonl").read_text().splitlines()
        if ln.strip()
    ]


def test_start_record_is_written_first(ingest, tmp_path):
    ingest.mark_cycle_started("20260907T001702Z", 1_788_999_000.0)
    recs = _records(tmp_path)
    assert recs == [
        {
            "generation_id": "20260907T001702Z",
            "cycle_started_at": ingest._utc(1_788_999_000.0),
            "started": True,
            "complete": False,
        }
    ]


def test_unfinished_predecessor_is_marked_interrupted(ingest, tmp_path):
    ingest.mark_cycle_started("A", 100.0)
    ingest.mark_cycle_started("B", 200.0)
    recs = _records(tmp_path)
    assert [r["generation_id"] for r in recs] == ["A", "A", "B"]
    killed = recs[1]
    assert killed["failed_stage"] == "interrupted"
    assert killed["complete"] is False
    assert killed["cycle_started_at"] == ingest._utc(100.0)
    assert killed["published_at"] == ingest._utc(200.0)
    assert recs[2]["started"] is True


def test_completed_predecessor_is_left_alone(ingest, tmp_path):
    ingest.mark_cycle_started("A", 100.0)
    ingest._append_metric(
        {"generation_id": "A", "complete": True, "published_at": ingest._utc(150.0)}
    )
    ingest.mark_cycle_started("B", 200.0)
    recs = _records(tmp_path)
    assert [r["generation_id"] for r in recs] == ["A", "A", "B"]
    assert "failed_stage" not in recs[1]


def test_skipped_and_failed_predecessors_are_left_alone(ingest, tmp_path):
    ingest._append_metric(
        {"generation_id": "A", "skipped": "no source change", "complete": True}
    )
    ingest.mark_cycle_started("B", 200.0)
    ingest._append_metric(
        {"generation_id": "B", "failed_stage": "extract/build", "complete": False}
    )
    ingest.mark_cycle_started("C", 300.0)
    recs = _records(tmp_path)
    assert [r.get("failed_stage") for r in recs] == [None, None, "extract/build", None]


def test_missing_metrics_file_is_fine(ingest, tmp_path):
    assert ingest._last_metric() is None
    ingest.mark_cycle_started("A", 100.0)
    assert len(_records(tmp_path)) == 1


def test_torn_tail_is_repaired_and_predecessor_closed(ingest, tmp_path):
    ingest.mark_cycle_started("A", 100.0)
    with open(tmp_path / "ingest_metrics.jsonl", "ab") as f:
        f.write(b'{"generation_id":"A","complete":tr')
    ingest.mark_cycle_started("B", 200.0)
    raw = (tmp_path / "ingest_metrics.jsonl").read_text().splitlines()
    assert raw[1].startswith('{"generation_id":"A","complete":tr')
    recs = [json.loads(ln) for ln in raw if ln.startswith("{") and ln.endswith("}")]
    assert [r["generation_id"] for r in recs] == ["A", "A", "B"]
    assert recs[1]["failed_stage"] == "interrupted"


def test_start_record_is_written_before_extract_runs(ingest, tmp_path, monkeypatch):
    seen = {}

    def fake_extract():
        seen["at_extract"] = _records(tmp_path)
        raise RuntimeError("boom")

    ingest.extract.main = fake_extract
    with pytest.raises(SystemExit):
        ingest.main()
    assert [r.get("started") for r in seen["at_extract"]] == [True]
    recs = _records(tmp_path)
    assert recs[0]["started"] is True
    assert recs[-1]["failed_stage"] == "extract/build"
    assert recs[-1]["complete"] is False
