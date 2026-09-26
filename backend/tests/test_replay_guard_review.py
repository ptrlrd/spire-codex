"""Regression cases from the second-opinion review of the save-reload guard:
a hash with a visible duplicate is still hidden, unknown CLI options abort
before anything runs, the env flag keeps stage runs report-only, and the
reported drop is a real one."""

import sys

import pytest

from tests.test_replay_guard import FakeRuns, _con, _walk, guard


def test_visible_duplicate_is_not_skipped_when_sibling_is_hidden():
    findings = [{"run_hash": "h1", "from_floor": 5, "to_floor": 2, "drops": 3}]
    runs = FakeRuns(
        [
            {"_id": "legacy", "run_hash": "h1", "hidden": True},
            {"_id": "h1", "hidden": False},
        ]
    )
    calls = []

    out = guard.apply(
        findings,
        dry_run=False,
        coll=runs,
        hide=lambda h, v, reason: calls.append((h, v, reason)),
    )

    assert calls == [("h1", True, "auto:save_reload")]
    assert out["already_hidden"] == 0
    assert out["hidden"] == 1


def test_unknown_cli_option_cannot_fall_through_to_live_apply(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["replay_guard.py", "--dry-rnu"])

    def must_not_run(*args, **kwargs):
        pytest.fail("unknown CLI option reached live guard execution")

    monkeypatch.setattr(guard, "run", must_not_run)

    with pytest.raises(SystemExit):
        guard.main()


def test_env_flag_keeps_cli_and_stage_runs_report_only(monkeypatch):
    seen = []
    monkeypatch.setattr(
        guard,
        "run",
        lambda dry_run=None: (
            seen.append(dry_run)
            or {
                "flagged": 0,
                "already_hidden": 0,
                "hidden": 0,
                "hashes": [],
                "dry_run": dry_run,
            }
        ),
    )
    monkeypatch.setenv("REPLAY_GUARD_DRY_RUN", "1")
    guard.main([])
    monkeypatch.delenv("REPLAY_GUARD_DRY_RUN")
    guard.main([])
    guard.main(["--dry-run"])
    assert seen == [True, False, True]
    monkeypatch.setenv("REPLAY_GUARD_DRY_RUN", "1")
    assert guard.env_dry_run() is True


def test_multiple_reloads_in_one_run_report_the_first_real_drop():
    rows = _walk("multi", [1, 5, 10, 8, 9, 15, 25, 3, 4, 5])
    out = guard.detect_save_reloads(_con(rows))
    assert len(out) == 1
    r = out[0]
    assert (r["from_floor"], r["to_floor"]) == (10, 8)
    assert r["drops"] >= 2
