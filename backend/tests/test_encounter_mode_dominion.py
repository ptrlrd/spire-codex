"""Encounter stats split by game mode, and a Dread fight files under the
dominion of the boss its act ended in."""

import duckdb

from app.services import lake_stats
from app.services.lake_stats import _encounter_scope_keys, encounter_store_key


def test_scope_keys_add_the_mode_and_the_dominion():
    recent = frozenset({"v0.113.1"})
    keys = _encounter_scope_keys("dread|1|1|0|v0.113.1", recent, "AEONGLASS_BOSS")
    assert {"all", "solo", "a10", "ver:v0.113.1", "solo:v0.113.1"} <= set(keys)
    assert {
        "mode:dread",
        "mode:dread|solo",
        "mode:dread|ver:v0.113.1",
        "mode:dread|a10:v0.113.1",
        "dom:AEONGLASS_BOSS",
        "dom:AEONGLASS_BOSS|solo:v0.113.1",
    } <= set(keys)
    assert "mode:dread|all" not in keys

    standard = _encounter_scope_keys("standard|2|0|0|old", recent, "AEONGLASS_BOSS")
    assert standard == ["all", "2p", "mode:standard", "mode:standard|2p"]
    assert _encounter_scope_keys("garbage", recent) == []


def test_store_key_combines_scope_bracket_and_version():
    assert encounter_store_key(None, None) == "all"
    assert encounter_store_key("a10", None) == "a10"
    assert encounter_store_key(None, "v1") == "ver:v1"
    assert encounter_store_key("solo", "v1") == "solo:v1"
    assert encounter_store_key(None, None, "dread") == "mode:dread"
    assert encounter_store_key("solo", "v1", "dread") == "mode:dread|solo:v1"
    assert encounter_store_key(None, "v1", "blitz") == "mode:blitz|ver:v1"
    assert encounter_store_key("a10", None, "dread", "KIN_BOSS") == "dom:KIN_BOSS|a10"
    assert encounter_store_key(None, None, None, "KIN_BOSS") == "dom:KIN_BOSS"


def _write_lake(tmp_path):
    con = duckdb.connect()
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('d1', 10, 'IRONCLAD', NULL::VARCHAR, false, 'dread', 1, 'v1', false,
         'AEONGLASS_BOSS', TIMESTAMP '2026-11-18 00:00:00'),
        ('d2', 10, 'IRONCLAD', NULL, false, 'dread', 1, 'v1', false,
         'JAW_WORM', TIMESTAMP '2026-11-18 00:00:00'),
        ('s1', 10, 'IRONCLAD', NULL, true, 'standard', 1, 'v1', false,
         '', TIMESTAMP '2026-11-18 00:00:00'))
        t(run_hash, ascension, character, username, win, game_mode,
          player_count, build_id, was_abandoned, killed_by_encounter,
          submitted_at))
        TO '{tmp_path}/runs.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT 'x' AS run_hash WHERE false)
        TO '{tmp_path}/excluded.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('d1', 1, 1, 'monster', 'JAW_WORM', 3, 20),
        ('d1', 1, 2, 'boss', 'VANTOM_BOSS', 6, 30),
        ('d1', 1, 3, 'boss', 'AEONGLASS_BOSS', 8, 50),
        ('d2', 1, 1, 'monster', 'JAW_WORM', 2, 40),
        ('s1', 1, 1, 'monster', 'JAW_WORM', 4, 4),
        ('s1', 1, 2, 'boss', 'AEONGLASS_BOSS', 5, 9))
        t(run_hash, act, floor_idx, room_type, encounter, turns, damage_taken))
        TO '{tmp_path}/floor_events.parquet' (FORMAT parquet)"""
    )
    con.close()


def _rows(store, key):
    return {
        (c[0], c[2]): tuple(c[5:10]) for c in (store.get(key) or {}).get("cells", [])
    }


def test_store_files_fights_by_mode_and_dominion(monkeypatch, tmp_path):
    _write_lake(tmp_path)
    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(lake_stats, "cube_versions", lambda: ["v1"])
    monkeypatch.setattr(lake_stats, "_ENCOUNTER_ROW_MIN_ALL", 1)

    def sources(con, lake):
        con.execute(lake_stats._eligible_sql(lake))
        lake_stats._ensure_cells(con, lake)

    monkeypatch.setattr(lake_stats, "_prepare_sources", sources)
    con = duckdb.connect()
    store = lake_stats.build_encounter_store(con)
    con.close()

    assert _rows(store, "all")[("JAW_WORM", "monster")] == (3, 1, 64.0, 9.0, 0)
    assert _rows(store, "mode:dread")[("JAW_WORM", "monster")] == (
        2,
        1,
        60.0,
        5.0,
        0,
    )
    assert _rows(store, "mode:standard|solo:v1")[("JAW_WORM", "monster")][0] == 1
    # d1 reached its act's bosses, so its hallway fight is under the second
    # boss's dominion; d2 died first and belongs to no dominion.
    dom = _rows(store, "dom:AEONGLASS_BOSS")
    assert dom == {("JAW_WORM", "monster"): (1, 0, 20.0, 3.0, 0)}
    assert _rows(store, "dom:AEONGLASS_BOSS|a10:v1") == dom
    assert _rows(store, "dom:VANTOM_BOSS") == {}
    assert ("AEONGLASS_BOSS", "boss") in _rows(store, "mode:dread")


def test_endpoint_lookup_reads_the_scoped_key(monkeypatch):
    from app.services import encounter_stats as es, run_entity_stats as res

    blob = {
        "version": es.ENCOUNTER_VERSION,
        "cells": [["JAW_WORM", 1, "monster", "IRONCLAD", "solo", 7, 0, 70.0, 21.0, 0]],
    }
    store = {"all": {"version": es.ENCOUNTER_VERSION, "cells": []}}
    store["dom:KIN_BOSS|solo"] = blob
    monkeypatch.setattr(lake_stats, "encounter_store_with_mtime", lambda: (1.0, store))
    monkeypatch.setattr(es, "_official_encounter_ids", lambda: frozenset())
    monkeypatch.setattr(res, "_maybe_rebuild", lambda: None)
    hit = res.get_encounter_stats(
        bracket="solo", game_mode="dread", dominion="KIN_BOSS"
    )
    assert hit["encounters"][0]["avg_damage"] == 10.0
    miss = res.get_encounter_stats(game_mode="blitz")
    assert miss["encounters"] == []
