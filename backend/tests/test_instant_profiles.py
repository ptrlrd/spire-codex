"""Build-on-upload kicks, partial blob coverage, and the building count."""

import time

import pytest

from app.services import cache as app_cache
from app.services import user_insights as ui


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    with ui._pending_lock:
        ui._pending.clear()
        ui._pending_checked.clear()
    with ui._cache_lock:
        ui._cache.clear()
    monkeypatch.setattr(ui, "_sweeper_started", True)
    yield
    with ui._pending_lock:
        ui._pending.clear()
        ui._pending_checked.clear()


def test_first_activity_kicks_build_when_no_profile_exists(monkeypatch):
    kicks = []
    monkeypatch.setattr(ui, "_kick_refresh", lambda *a: kicks.append(a))
    monkeypatch.setattr(ui, "_load_stored_payload", lambda k: None)
    monkeypatch.setattr(app_cache, "get_json", lambda k: None)

    ui.note_profile_activity("u1", "Dobo")
    assert len(kicks) == 1
    assert kicks[0][0] == "u1:"

    ui.note_profile_activity("u1", "Dobo")
    assert len(kicks) == 1
    assert "u1" in ui._pending


def test_activity_with_existing_profile_only_records_pending(monkeypatch):
    kicks = []
    monkeypatch.setattr(ui, "_kick_refresh", lambda *a: kicks.append(a))
    monkeypatch.setattr(ui, "_load_stored_payload", lambda k: {"runs_walked": 5})
    monkeypatch.setattr(app_cache, "get_json", lambda k: None)

    ui.note_profile_activity("u2", None)
    assert kicks == []
    assert "u2" in ui._pending


def test_due_pending_waits_for_the_burst_to_quiet():
    now = time.time()
    pending = {
        "old": (now - 60.0, "a"),
        "hot": (now - 5.0, "b"),
    }
    assert ui._due_pending(pending, now) == ["old"]


def test_coverage_full_partial_and_zero(monkeypatch):
    rows = [{"run_hash": f"h{i}"} for i in range(10)]
    full = {f"h{i}": {} for i in range(10)}
    half = {f"h{i}": {} for i in range(5)}
    assert ui._require_blob_coverage(rows, full) is True
    assert ui._require_blob_coverage(rows, half) is False
    monkeypatch.setattr(ui, "_mongo_reachable", lambda: False)
    with pytest.raises(RuntimeError):
        ui._require_blob_coverage(rows, {})
    monkeypatch.setattr(ui, "_mongo_reachable", lambda: True)
    assert ui._require_blob_coverage(rows, {}) is False
    assert ui._require_blob_coverage([], {}) is True


def test_partial_payload_never_stored_durably(monkeypatch):
    touched = []
    monkeypatch.setattr(ui, "_insights_coll", lambda: touched.append(1))
    ui._store_payload("k", {"partial": True, "claimed_runs": 9, "runs_walked": 5})
    assert touched == []


def test_building_response_carries_claimed_count(monkeypatch):
    import app.services.runs_db_mongo as rdm

    monkeypatch.setattr(ui, "_kick_refresh", lambda *a: None)
    monkeypatch.setattr(ui, "_load_stored_payload", lambda k: None)
    monkeypatch.setattr(app_cache, "get_json", lambda k: None)
    monkeypatch.setattr(rdm, "count_user_runs", lambda uid: 42)

    out = ui.get_user_insights("u3")
    assert out == {"building": True, "claimed_runs": 42}
