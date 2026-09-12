"""Lake-built deep tables: fold semantics and the full builder on a tiny lake."""

import duckdb
import pytest

from app.services import lake_stats as ls


def test_fold_deep_filters_and_sums():
    rows = [
        ("IRONCLAD", 10, 1, "STRIKE", 4, 2),
        ("IRONCLAD", 3, 2, "STRIKE", 2, 1),
        ("SILENT", 10, 4, "STRIKE", 1, 1),
        ("MODDED_GUY", 10, 1, "STRIKE", 50, 50),
        ("IRONCLAD", 10, 1, None, 9, 9),
    ]
    official = frozenset({"IRONCLAD", "SILENT"})
    assert ls._fold_deep(rows, None, None, official) == {"STRIKE": [7, 4]}
    assert ls._fold_deep(rows, "IRONCLAD", None, official) == {"STRIKE": [6, 3]}
    assert ls._fold_deep(rows, None, 10, official) == {"STRIKE": [5, 3]}
    assert ls._fold_deep(rows, "SILENT", 3, official) == {}
    assert ls._fold_deep(rows, None, None, official, "1") == {"STRIKE": [4, 2]}
    assert ls._fold_deep(rows, None, None, official, "2") == {"STRIKE": [2, 1]}
    assert ls._fold_deep(rows, None, None, official, "4") == {"STRIKE": [1, 1]}
    assert ls._fold_deep(rows, None, None, official, "multi") == {"STRIKE": [3, 2]}


@pytest.fixture()
def tiny_lake(tmp_path, monkeypatch):
    con = duckdb.connect()
    # r1 IRONCLAD a10 win; r2 SILENT a10 loss (killed); r3 hidden -> excluded.
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('r1', 'IRONCLAD', true, 10, false, NULL::VARCHAR, NULL::VARCHAR, 1),
        ('r2', 'SILENT', false, 10, false, 'JAW_WORM', NULL::VARCHAR, 2),
        ('r3', 'IRONCLAD', true, 10, false, NULL::VARCHAR, NULL::VARCHAR, 1))
        t(run_hash, character, win, ascension, was_abandoned,
          killed_by_encounter, killed_by_event, player_count))
        TO '{tmp_path}/runs.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES ('r3'))
        t(run_hash)) TO '{tmp_path}/excluded.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('r1', 1, 1, 'IRONCLAD', 20), ('r2', 1, 2, 'SILENT', 20))
        t(run_hash, player_idx, player_id, character, deck_size))
        TO '{tmp_path}/players.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('r1', 1, 'IRONCLAD', 'STRIKE'), ('r1', 1, 'IRONCLAD', 'STRIKE'),
        ('r2', 1, 'SILENT', 'STRIKE'), ('r3', 1, 'IRONCLAD', 'STRIKE'))
        t(run_hash, player_idx, character, card))
        TO '{tmp_path}/deck.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES ('r1', 1, 'BURNING_BLOOD', 'IRONCLAD'))
        t(run_hash, player_idx, relic, character))
        TO '{tmp_path}/relics.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('r1', 1, 'FIRE_POTION', 'IRONCLAD', true),
        ('r2', 1, 'FIRE_POTION', 'SILENT', false))
        t(run_hash, player_idx, potion, character, was_used))
        TO '{tmp_path}/potions.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('r1', 1, 'FIRE_POTION', true), ('r1', 1, 'BLOCK_POTION', false),
        ('r2', 1, 'FIRE_POTION', false))
        t(run_hash, player_idx, potion, was_picked))
        TO '{tmp_path}/shop_potions.parquet' (FORMAT parquet)"""
    )
    # Floors with card_choices so _ensure_choice_rows has something real:
    # r1's player saw STRIKE (picked) and DEFEND (skipped) on one screen.
    con.execute(
        f"""COPY (SELECT 'r1' AS run_hash, 0 AS act, 1 AS floor_idx,
        [struct_pack(player_id := 1,
           card_choices := [
             struct_pack(was_picked := true,
               card := struct_pack(id := 'CARD.STRIKE')),
             struct_pack(was_picked := false,
               card := struct_pack(id := 'CARD.DEFEND'))])] AS players)
        TO '{tmp_path}/floors.parquet' (FORMAT parquet)"""
    )
    con.close()
    monkeypatch.setattr(ls, "LAKE_DIR", tmp_path)
    yield tmp_path


def _tables(result, filters):
    for c in result["combos"]:
        if c["filters"] == filters:
            return c["tables"]
    raise AssertionError(f"combo {filters} missing")


def test_build_deep_tables_end_to_end(tiny_lake, monkeypatch):
    import json

    monkeypatch.setattr(ls, "available", lambda *a: True)
    n = ls.build_deep_tables()
    assert n > 0
    doc = json.loads((tiny_lake / "deep_tables.json").read_text())

    t = _tables(doc, {})
    # r3 is excluded: STRIKE = r1 (2 copies, win) + r2 (1 copy, loss).
    cards = {r["card_id"]: r for r in t["top_cards"]}
    assert cards["STRIKE"] == {
        "card_id": "STRIKE",
        "count": 3,
        "in_wins": 2,
        "in_losses": 1,
        "total_runs_with": 2,
        "win_runs": 1,
    }
    assert t["deadliest"] == [{"encounter": "JAW_WORM", "count": 1}]
    assert t["top_relics"][0]["relic_id"] == "BURNING_BLOOD"
    pots = {r["potion_id"]: r for r in t["top_potions"]}
    assert pots["FIRE_POTION"]["offered"] == 2
    assert pots["FIRE_POTION"]["picked"] == 1
    assert pots["FIRE_POTION"]["used"] == 1
    assert pots["FIRE_POTION"]["total_runs_with"] == 2
    assert pots["BLOCK_POTION"]["offered"] == 1
    assert pots["BLOCK_POTION"]["total_runs_with"] == 0
    picks = {r["card_id"]: r for r in t["pick_rates"]}
    assert picks["STRIKE"] == {
        "card_id": "STRIKE",
        "offered": 1,
        "picked": 1,
        "pick_rate": 100.0,
    }
    assert picks["DEFEND"]["picked"] == 0

    t_silent = _tables(doc, {"character": "SILENT"})
    assert {r["card_id"] for r in t_silent["top_cards"]} == {"STRIKE"}
    assert t_silent["top_cards"][0]["count"] == 1
    assert t_silent["deadliest"] == [{"encounter": "JAW_WORM", "count": 1}]


def test_deep_tables_by_key_missing_artifact(tmp_path, monkeypatch):
    monkeypatch.setattr(ls, "LAKE_DIR", tmp_path)
    assert ls.deep_tables_by_key() == {}


def test_player_count_slices_are_built_from_the_same_pass(tiny_lake, monkeypatch):
    import json

    monkeypatch.setattr(ls, "available", lambda *a: True)
    ls.build_deep_tables()
    doc = json.loads((tiny_lake / "deep_tables.json").read_text())
    two = _tables(doc, {"players": "2"})
    assert [r["card_id"] for r in two["top_cards"]] == ["STRIKE"]
    assert two["top_cards"][0]["count"] == 1 and two["top_cards"][0]["in_losses"] == 1
    assert two["deadliest"] == [{"encounter": "JAW_WORM", "count": 1}]
    assert two["top_relics"] == []
    solo = _tables(doc, {"players": "1"})
    assert solo["top_cards"][0]["count"] == 2 and solo["deadliest"] == []
    assert _tables(doc, {"players": "4"})["top_cards"] == []
    assert (
        _tables(doc, {"players": "2", "character": "SILENT"})["top_cards"][0]["count"]
        == 1
    )
