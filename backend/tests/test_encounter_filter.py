from app.services import encounter_stats


def _blob():
    return {
        "version": encounter_stats.ENCOUNTER_VERSION,
        "cells": [
            [
                "AXEBOTS_NORMAL",
                3,
                "monster",
                "IRONCLAD",
                "solo",
                100,
                10,
                1200.0,
                500.0,
            ],
            ["AXEBOTS_NORMAL", 3, "monster", "SILENT", "multi", 40, 2, 300.0, 180.0],
            ["AEONGLASS_BOSS", 3, "boss", "IRONCLAD", "solo", 80, 30, 2400.0, 640.0],
        ],
    }


def test_rollup_keeps_only_requested_encounters():
    out = encounter_stats.rollup(_blob(), encounters=["axebots_normal"])
    assert [r["encounter_id"] for r in out["encounters"]] == ["AXEBOTS_NORMAL"]
    row = out["encounters"][0]
    assert row["total"] == 140 and row["fatal"] == 12
    assert {c["character"] for c in row["characters"]} == {"IRONCLAD", "SILENT"}


def test_rollup_without_filter_keeps_everything():
    out = encounter_stats.rollup(_blob())
    assert {r["encounter_id"] for r in out["encounters"]} == {
        "AXEBOTS_NORMAL",
        "AEONGLASS_BOSS",
    }


def test_series_rolls_up_per_bracket_and_version(monkeypatch):
    from app.services import lake_stats, run_entity_stats as res

    blob = _blob()
    store = {"all": blob, "a10": blob, "ver:v0.111.0": blob}
    monkeypatch.setattr(lake_stats, "encounter_store_with_mtime", lambda: (1.0, store))
    monkeypatch.setattr(res, "get_recent_stat_versions", lambda: ["v0.111.0"])
    out = res.get_encounter_series(["AXEBOTS_NORMAL"])
    assert [r["encounter_id"] for r in out["brackets"]["all"]] == ["AXEBOTS_NORMAL"]
    assert out["brackets"]["wr30"] == []
    assert out["versions"]["v0.111.0"][0]["total"] == 140
    assert out["version_order"] == ["v0.111.0"]
