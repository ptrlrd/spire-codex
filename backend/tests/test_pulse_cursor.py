"""/api/runs/pulse reported data_through: null on prod and a total that was
about 8% high. The cursor was read from a snapshot-era variable nothing sets
now that the lake builds the stats, and the hot overlay's counters were added
to the store total even though nothing rebases them against it."""

from fastapi.testclient import TestClient

from app.main import app
from app.routers import runs as runs_router
from app.services import lake_stats, live_overlay
from app.services import run_entity_stats as res

client = TestClient(app, raise_server_exceptions=False)


def test_status_reads_the_store_cursor_when_the_snapshot_has_none(monkeypatch):
    monkeypatch.setattr(res, "_data_through", None)
    monkeypatch.setattr(
        lake_stats,
        "entity_store_with_mtime",
        lambda: (1.0, {"data_through": "2026-09-09 12:24:30.722000"}),
    )
    assert res.snapshot_status()["data_through"] == "2026-09-09 12:24:30.722000"


def test_status_falls_back_to_the_cube_cursor(monkeypatch):
    monkeypatch.setattr(res, "_data_through", None)
    monkeypatch.setattr(lake_stats, "entity_store_with_mtime", lambda: None)
    monkeypatch.setattr(
        lake_stats,
        "_entity_cube_with_mtime",
        lambda: (1.0, {"data_through": "2026-09-09 11:00:00"}),
    )
    assert res.snapshot_status()["data_through"] == "2026-09-09 11:00:00"


def test_status_stays_null_without_any_cursor(monkeypatch):
    monkeypatch.setattr(res, "_data_through", None)
    monkeypatch.setattr(lake_stats, "entity_store_with_mtime", lambda: None)
    monkeypatch.setattr(lake_stats, "_entity_cube_with_mtime", lambda: None)
    assert res.snapshot_status()["data_through"] is None


def test_pulse_reports_hot_runs_without_adding_them(monkeypatch):
    monkeypatch.setattr(
        res, "global_totals", lambda: {"total_runs": 1000, "total_wins": 300}
    )
    monkeypatch.setattr(
        live_overlay, "hot_totals", lambda: {"runs": 126520, "wins": 40000}
    )
    monkeypatch.setattr(
        runs_router, "snapshot_status", lambda: {"data_through": "2026-09-09 12:24:30"}
    )
    r = client.get("/api/runs/pulse")
    assert r.status_code == 200
    body = r.json()
    assert body["total_runs"] == 1000
    assert body["total_wins"] == 300
    assert body["hot_runs"] == 126520
    assert body["data_through"] == "2026-09-09 12:24:30"
