import gzip
import importlib.util
import json
import pathlib

import pytest

from app.services import competitive_store as store

_LAB = pathlib.Path(__file__).resolve().parents[2] / "lab"


def _run(h, user, win, state="cleared", bracket="a10_solo", t=1800, char="IRONCLAD"):
    return {
        "run_hash": h,
        "user_id": user,
        "username": f"name-{user}",
        "character": char,
        "win": win,
        "run_time": t,
        "day": "2026-11-20",
        "state": state,
        "bracket": bracket,
    }


def test_rule_breaks_and_forfeits_count_as_losses():
    runs = [
        _run("a", "1", True, t=2000),
        _run("b", "1", True, t=1700),
        _run("c", "1", True, state="flagged"),
        _run("d", "2", True, t=1500, char="SILENT"),
        _run("e", "2", False),
        _run("f", "3", True, bracket="dread_solo"),
    ]
    forfeits = [{"user_id": "2", "bracket": "a10_solo", "character": "SILENT"}]
    members = [
        ("a", "cards", "OFFERING"),
        ("b", "cards", "OFFERING"),
        ("c", "cards", "FEED"),
    ]
    out = store.view(store.fold(runs, members, forfeits), "a10_solo")
    assert (out["runs"], out["wins"], out["flagged"], out["forfeits"]) == (4, 3, 1, 1)
    wins = out["boards"]["wins"]
    assert [(r["username"], r["wins"], r["runs"]) for r in wins] == [
        ("name-1", 2, 3),
        ("name-2", 1, 3),
    ]
    assert [r["username"] for r in out["boards"]["fastest"]] == ["name-2", "name-1"]
    assert out["boards"]["fastest"][1]["best_run"] == "b"
    assert out["boards"]["win_rate"][0]["win_rate"] == 66.7
    assert out["used"]["cards"] == [
        {"id": "OFFERING", "runs": 2, "wins": 2, "share": 50.0, "win_rate": 100.0}
    ]


def test_character_scope_and_min_runs():
    runs = [_run("a", "1", True), _run("d", "2", True, char="SILENT")]
    folded = store.fold(runs, [], [])
    silent = store.view(folded, "a10_solo", "silent")
    assert [r["username"] for r in silent["boards"]["wins"]] == ["name-2"]
    assert store.view(folded, "a10_solo", min_runs=2)["boards"]["win_rate"] == []
    assert store.view(None, "dread_solo")["building"] is True


def test_stage_builds_from_the_lake(tmp_path, monkeypatch):
    duckdb = pytest.importorskip("duckdb")
    con = duckdb.connect()
    lake = tmp_path
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
          ('a', 'IRONCLAD', true, 1800, 'name-1', '1', TIMESTAMP '2026-11-20 20:00:00'),
          ('b', 'IRONCLAD', true, 1700, 'name-1', '1', TIMESTAMP '2026-11-20 21:00:00'),
          ('h', 'IRONCLAD', true, 900, 'name-9', '9', TIMESTAMP '2026-11-20 21:00:00')
        ) t(run_hash, character, win, run_time, username, user_id, submitted_at))
        TO '{lake}/runs.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT run_hash, submitted_at AS played_at FROM '{lake}/runs.parquet')
        TO '{lake}/p.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT r.*, p.played_at FROM '{lake}/runs.parquet' r
        JOIN '{lake}/p.parquet' p USING (run_hash)) TO '{lake}/runs2.parquet' (FORMAT parquet)"""
    )
    (lake / "runs2.parquet").replace(lake / "runs.parquet")
    con.execute(
        f"COPY (SELECT 'h' AS run_hash) TO '{lake}/excluded.parquet' (FORMAT parquet)"
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES ('a', 0, 'IRONCLAD', 'OFFERING'), ('a', 0, 'IRONCLAD', 'STRIKE_IRONCLAD'))
        t(run_hash, player_idx, character, card)) TO '{lake}/deck.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES ('a', 0, 'ANCHOR')) t(run_hash, player_idx, relic))
        TO '{lake}/relics.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES ('a', 0, 'BLOCK_POTION', true)) t(run_hash, player_idx, potion, was_used))
        TO '{lake}/potions.parquet' (FORMAT parquet)"""
    )
    con.close()
    rows = [
        {"run_hash": "a", "state": "cleared", "bracket": "a10_solo"},
        {"run_hash": "b", "state": "flagged", "bracket": "a10_solo"},
        {"run_hash": "h", "state": "cleared", "bracket": "a10_solo"},
        {
            "run_hash": None,
            "state": "forfeit",
            "bracket": "a10_solo",
            "user_id": "1",
            "character": "IRONCLAD",
        },
    ]
    with gzip.open(lake / "competitive_current.jsonl.gz", "wt") as f:
        f.write("\n".join(json.dumps(r) for r in rows))
    spec = importlib.util.spec_from_file_location(
        "competitive_stage", _LAB / "competitive_store.py"
    )
    stage = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(stage)
    monkeypatch.setattr(stage, "LAKE", lake)
    monkeypatch.setattr(store, "LAKE_DIR", lake)
    monkeypatch.setattr(stage, "_nondraftable", lambda: ({"STRIKE_IRONCLAD"}, set()))
    assert stage.build()["runs"] == 2
    out = store.view(store.load(), "a10_solo")
    assert (out["runs"], out["flagged"], out["forfeits"]) == (1, 1, 1)
    assert out["boards"]["wins"][0] == {
        "rank": 1,
        "username": "name-1",
        "character": "ironclad",
        "wins": 1,
        "runs": 3,
        "win_rate": 33.3,
        "best_time": 1800,
        "best_run": "a",
    }
    assert [u["id"] for u in out["used"]["cards"]] == ["OFFERING"]
    assert [u["id"] for u in out["used"]["relics"]] == ["ANCHOR"]
    assert [u["id"] for u in out["used"]["potions"]] == ["BLOCK_POTION"]
    assert out["per_day"] == [["2026-11-20", 1]]
