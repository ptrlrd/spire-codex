import json

from fastapi.testclient import TestClient

from app import metrics


def _value(gauge) -> float:
    return gauge.collect()[0].samples[0].value


def _write(lake, generation, records):
    if generation is not None:
        (lake / "generation.json").write_text(json.dumps(generation))
    (lake / "ingest_metrics.jsonl").write_text(
        "".join(json.dumps(r) + "\n" for r in records)
    )


def test_complete_cycle(tmp_path, monkeypatch):
    monkeypatch.setenv("LAKE_DIR", str(tmp_path))
    done = {
        "generation_id": "g2",
        "cycle_started_at": "2026-11-10T06:17:00Z",
        "published_at": "2026-11-10T07:00:00Z",
        "complete": True,
    }
    _write(tmp_path, done, [{"generation_id": "g2", "started": True}, done])

    metrics.refresh_lake_gauges()

    assert _value(metrics.lake_generation_published) == 1794294000
    assert _value(metrics.lake_last_attempt) == 1794294000
    assert _value(metrics.lake_last_attempt_complete) == 1
    assert _value(metrics.lake_ingest_running) == 0


def test_failed_cycle_keeps_the_old_generation_time(tmp_path, monkeypatch):
    monkeypatch.setenv("LAKE_DIR", str(tmp_path))
    _write(
        tmp_path,
        {"generation_id": "g1", "published_at": "2026-11-10T01:00:00Z"},
        [
            {
                "generation_id": "g2",
                "cycle_started_at": "2026-11-10T06:17:00Z",
                "published_at": "2026-11-10T06:40:00Z",
                "failed_stage": "extract/build",
                "complete": False,
            }
        ],
    )

    metrics.refresh_lake_gauges()

    assert _value(metrics.lake_generation_published) == 1794272400
    assert _value(metrics.lake_last_attempt) == 1794292800
    assert _value(metrics.lake_last_attempt_complete) == 0
    assert _value(metrics.lake_ingest_running) == 0


def test_cycle_in_progress(tmp_path, monkeypatch):
    monkeypatch.setenv("LAKE_DIR", str(tmp_path))
    _write(
        tmp_path,
        None,
        [
            {
                "generation_id": "g3",
                "cycle_started_at": "2026-11-10T12:17:00Z",
                "started": True,
                "complete": False,
            }
        ],
    )

    metrics.refresh_lake_gauges()

    assert _value(metrics.lake_generation_published) == 0
    assert _value(metrics.lake_last_attempt) == 1794313020
    assert _value(metrics.lake_last_attempt_complete) == 0
    assert _value(metrics.lake_ingest_running) == 1


def test_missing_or_broken_files_read_as_zero(tmp_path, monkeypatch):
    monkeypatch.setenv("LAKE_DIR", str(tmp_path))
    (tmp_path / "generation.json").write_text("[1, 2")
    (tmp_path / "ingest_metrics.jsonl").write_text("not json\n")

    metrics.refresh_lake_gauges()

    assert _value(metrics.lake_generation_published) == 0
    assert _value(metrics.lake_last_attempt) == 0
    assert _value(metrics.lake_last_attempt_complete) == 0
    assert _value(metrics.lake_ingest_running) == 0


def test_health_and_metrics_endpoints(tmp_path, monkeypatch):
    monkeypatch.setenv("LAKE_DIR", str(tmp_path))
    done = {
        "generation_id": "g2",
        "cycle_started_at": "2026-11-10T06:17:00Z",
        "published_at": "2026-11-10T07:00:00Z",
        "complete": True,
        "failed_stage": None,
        "rows_added": 5,
    }
    _write(tmp_path, done, [done])
    from app.main import app

    client = TestClient(app)
    body = client.get("/health").json()
    assert body["generation"] == done
    assert body["latest_attempt"] == {
        "generation_id": "g2",
        "cycle_started_at": "2026-11-10T06:17:00Z",
        "published_at": "2026-11-10T07:00:00Z",
        "complete": True,
        "failed_stage": None,
    }
    text = client.get("/metrics").text
    assert (
        "spire_codex_lake_generation_published_timestamp_seconds 1.794294e+09" in text
    )
    assert "spire_codex_lake_last_attempt_complete 1.0" in text
