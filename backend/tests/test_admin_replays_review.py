"""Regression cases from the second-opinion review of the admin replay
surface: ingest-claim races, requeue state gating, run_hash-keyed run docs,
date-only ranges, tie-stable paging, page bounds, Pacific stats days."""

from datetime import datetime, timedelta, timezone

import pytest
from bson import ObjectId

from app.services import replay_admin, replays_db
from tests import test_admin_replays as base
from tests.test_admin_replays import NOW, Cursor, Fake, _hashes, _replay, client

env = base.env


@pytest.mark.parametrize("run_hash", ["h1", "h2"])
def test_requeue_rejects_done_and_pending_replays(env, run_hash):
    replays, _ = env
    before = dict(replays.docs[run_hash])

    response = client.post(f"/api/admin/replays/{run_hash}/requeue")

    assert response.status_code == 409
    assert replays.docs[run_hash]["ingest_state"] == before["ingest_state"]
    assert replays.docs[run_hash]["attempts"] == before["attempts"]


def test_requeue_does_not_overwrite_a_concurrent_claim(env, monkeypatch):
    replays, _ = env
    replay = replays.docs["h3"]
    replay["ingest_state"] = "retry"
    original_update = replays.update_one
    raced = False

    def claim_then_update(flt, update):
        nonlocal raced
        if not raced:
            raced = True
            replay.update(
                {
                    "ingest_state": "claimed",
                    "owner": "worker-1",
                    "lease_expires_at": datetime.now(timezone.utc)
                    + timedelta(minutes=5),
                    "batch_id": "active-batch",
                }
            )
        return original_update(flt, update)

    monkeypatch.setattr(replays, "update_one", claim_then_update)

    response = client.post("/api/admin/replays/h3/requeue")

    assert response.status_code == 409
    assert replay["ingest_state"] == "claimed"
    assert replay["owner"] == "worker-1"
    assert replay["batch_id"] == "active-batch"


def test_delete_does_not_race_through_a_concurrent_claim(env, monkeypatch):
    replays, runs = env
    replay = replays.docs["h2"]
    original_update = replays.update_one
    raced = False

    def claim_then_update(flt, update):
        nonlocal raced
        if not raced:
            raced = True
            replay.update(
                {
                    "ingest_state": "claimed",
                    "owner": "worker-1",
                    "lease_expires_at": datetime.now(timezone.utc)
                    + timedelta(minutes=5),
                    "batch_id": "active-batch",
                }
            )
        return original_update(flt, update)

    monkeypatch.setattr(replays, "update_one", claim_then_update)

    response = client.delete("/api/admin/replays/h2")

    assert response.status_code == 409
    assert replay["deleted_at"] is None
    assert replay["ingest_state"] == "claimed"
    assert runs.docs["h2"]["has_replay"] is True


def test_delete_and_restore_update_run_hash_keyed_run(env):
    _, runs = env
    run = runs.docs.pop("h1")
    database_id = ObjectId("8" * 24)
    run.update({"_id": database_id, "run_hash": "h1"})
    runs.docs[database_id] = run

    response = client.delete("/api/admin/replays/h1")

    assert response.status_code == 200
    assert "has_replay" not in runs.docs[database_id]

    response = client.post("/api/admin/replays/h1/restore")

    assert response.status_code == 200
    assert runs.docs[database_id]["has_replay"] is True


def test_date_only_range_includes_the_named_calendar_date(env):
    assert _hashes(since="2026-09-25", until="2026-09-25") == ["h1"]


class _UnstableTieCursor(Cursor):
    """Simulate MongoDB's unspecified ordering among equal sort keys."""

    def sort(self, spec):
        for key, direction in reversed(spec):
            self.docs.sort(key=lambda doc: doc[key], reverse=direction < 0)
        return self


class _UnstableTieFake(Fake):
    def __init__(self, docs):
        super().__init__(docs)
        self.find_calls = 0

    def find(self, flt=None, proj=None):
        from tests.test_admin_replays import _match

        docs = [dict(d) for d in self.docs.values() if _match(d, flt or {})]
        self.find_calls += 1
        if self.find_calls % 2 == 0:
            docs.reverse()
        return _UnstableTieCursor(docs)


def test_paging_is_stable_when_submitted_timestamps_tie(env, monkeypatch):
    replays = _UnstableTieFake(
        [
            _replay("h1", submitted_at=NOW),
            _replay("h2", submitted_at=NOW),
            _replay("h3", submitted_at=NOW),
        ]
    )
    monkeypatch.setattr(replays_db, "_coll", lambda: replays)

    page1 = _hashes(page=1, limit=2)
    page2 = _hashes(page=2, limit=2)

    assert set(page1).isdisjoint(page2)
    assert set(page1 + page2) == {"h1", "h2", "h3"}


def test_page_rejects_values_that_overflow_mongo_skip(env):
    response = client.get("/api/admin/replays", params={"page": 2**63})

    assert response.status_code == 422


def test_stats_days_are_pacific_calendar_days(env, monkeypatch):
    replays, _ = env

    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            value = cls(2026, 9, 25, 20, 0, tzinfo=timezone.utc)
            return value.astimezone(tz) if tz else value.replace(tzinfo=None)

    monkeypatch.setattr(replay_admin, "datetime", FrozenDateTime)
    replays.docs = {
        "today": _replay(
            "today",
            submitted_at=FrozenDateTime(2026, 9, 25, 7, 1, tzinfo=timezone.utc),
        ),
        "yesterday": _replay(
            "yesterday",
            submitted_at=FrozenDateTime(2026, 9, 25, 6, 59, tzinfo=timezone.utc),
        ),
    }

    body = client.get("/api/admin/replays/stats", params={"days": 1}).json()

    assert body["per_day"] == [{"day": "2026-09-25", "uploads": 1}]
