"""Parity: the lake-built charts blob must equal charts_stats.accumulate()
run directly on the equivalent hand-written run blob — the builder's whole
design is that the fold IS the walk's accumulator, so any drift here means
the SQL projection or the assembly lost information."""

import gzip
import json
from datetime import datetime

import duckdb

from app.services import charts_blob_lake, charts_stats


PLAYED = datetime(2026, 8, 20, 12, 0, 0)


def _write_lake(tmp_path):
    con = duckdb.connect()
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('r1', 10, 'IRONCLAD', NULL::VARCHAR, true, false, 'standard',
         1, '', TIMESTAMP '2026-08-20 12:00:00', TIMESTAMP '2026-08-20 13:00:00'))
        t(run_hash, ascension, character, username, win, was_abandoned,
          game_mode, player_count, build_id, played_at, submitted_at))
        TO '{tmp_path}/runs.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT 'x' AS run_hash WHERE false)
        TO '{tmp_path}/excluded.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('r1', 0, 1, 'monster', 'ENCOUNTER.JAW_WORM', 3,
         [{{'max_hp': 80, 'current_hp': 70, 'current_gold': 99,
            'damage_taken': 10, 'rest_site_choices': []::VARCHAR[],
            'event_choices': []::STRUCT("title" STRUCT("key" VARCHAR,
              "table" VARCHAR))[]}}]),
        ('r1', 0, 2, 'event', NULL, NULL,
         [{{'max_hp': 80, 'current_hp': 60, 'current_gold': 120,
            'damage_taken': NULL, 'rest_site_choices': ['SMITH', 'REST'],
            'event_choices': [{{'title': {{'key':
              'MYSTEVENT.options.OPT_A.x', 'table': 'events'}}}}]}}]))
        t(run_hash, act, floor_idx, room_type, room_model, room_turns,
          players))
        TO '{tmp_path}/floors.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('r1', 1, 'STRIKE', 0, NULL::VARCHAR),
        ('r1', 1, 'STRIKE', 0, NULL::VARCHAR),
        ('r1', 1, 'ZAP', 2, 'FIERY'))
        t(run_hash, player_idx, card, floor_added, enchantment))
        TO '{tmp_path}/deck.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES ('r1', 1, 'BURNING_BLOOD'))
        t(run_hash, player_idx, relic))
        TO '{tmp_path}/relics.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES ('r1', 1, 'FIRE_POTION'))
        t(run_hash, player_idx, potion))
        TO '{tmp_path}/potions.parquet' (FORMAT parquet)"""
    )
    con.close()


def _expected_blob() -> dict:
    """The same run, hand-assembled the way the walk saw blobs."""
    return {
        "was_abandoned": False,
        "map_point_history": [
            [
                {
                    "rooms": [
                        {
                            "room_type": "monster",
                            "model_id": "ENCOUNTER.JAW_WORM",
                            "turns_taken": 3,
                        }
                    ],
                    "player_stats": [
                        {
                            "max_hp": 80,
                            "current_hp": 70,
                            "current_gold": 99,
                            "damage_taken": 10,
                            "rest_site_choices": [],
                            "event_choices": [],
                        }
                    ],
                },
                {
                    "rooms": [],
                    "player_stats": [
                        {
                            "max_hp": 80,
                            "current_hp": 60,
                            "current_gold": 120,
                            "damage_taken": None,
                            "rest_site_choices": ["SMITH"],
                            "event_choices": [
                                {
                                    "title": {
                                        "key": "MYSTEVENT.options.OPT_A.x",
                                        "table": "events",
                                    }
                                }
                            ],
                        }
                    ],
                },
            ]
        ],
        "players": [
            {
                "deck": [
                    {"id": "STRIKE", "floor_added_to_deck": 0},
                    {"id": "STRIKE", "floor_added_to_deck": 0},
                    {
                        "id": "ZAP",
                        "floor_added_to_deck": 2,
                        "enchantment": {"id": "FIERY"},
                    },
                ],
                "relics": [{"id": "BURNING_BLOOD"}],
                "potions": [{"id": "FIRE_POTION"}],
            }
        ],
    }


def test_lake_charts_blob_matches_direct_accumulate(monkeypatch, tmp_path):
    _write_lake(tmp_path)
    from app.services import lake_stats

    monkeypatch.setattr(charts_blob_lake, "LAKE_DIR", tmp_path)
    # Build-profile connections open the scratch db under lake_stats' dir.
    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(charts_blob_lake, "cube_versions", lambda: [])
    monkeypatch.setattr(charts_blob_lake, "_blob_cache", None)

    built = charts_blob_lake.build_charts_blob()
    assert built is not None

    acc = charts_stats.new_accumulator([])
    charts_stats.accumulate(
        acc,
        _expected_blob(),
        brackets=["all", "a10"],
        is_win=True,
        character="CHARACTER.IRONCLAD",
        player_count=1,
        played=PLAYED,
    )
    expected = charts_stats.finalize(acc)

    def norm(blob):
        return json.loads(json.dumps(blob, sort_keys=True))

    for bracket in ("all", "a10", "wr30"):
        assert norm(built[bracket]) == norm(expected[bracket]), bracket

    # The stored artifact round-trips through the loader, and a rebuild
    # rotates the old generation into the .prev slot.
    hit = charts_blob_lake.charts_blob_with_mtime()
    assert hit is not None and norm(hit[1]["all"]) == norm(expected["all"])
    assert charts_blob_lake.build_charts_blob() is not None
    assert (tmp_path / "charts_blob.prev.json.gz").exists()
    with gzip.open(tmp_path / "charts_blob.prev.json.gz", "rt") as f:
        prev = json.load(f)
    assert norm(prev["all"]) == norm(expected["all"])


def _combat(sub):
    return {k: sorted(map(tuple, sub[k])) for k in ("hp_floor", "enc", "enc_hist")}


def test_mode_buckets_hold_the_same_combat_cells_as_the_full_fold(
    tmp_path, monkeypatch
):
    _write_lake(tmp_path)
    from app.services import lake_stats

    monkeypatch.setattr(charts_blob_lake, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(charts_blob_lake, "cube_versions", lambda: [])
    blob = charts_blob_lake.build_charts_blob()
    assert _combat(blob["mode:standard"]) == _combat(blob["all"])
    assert _combat(blob["mode:standard|a10"]) == _combat(blob["a10"])
    assert blob["mode:standard"]["week_totals"] == blob["all"]["week_totals"]
    assert blob["mode:standard"]["traj"] == []
    assert not [k for k in blob if k.startswith("dom:")]


def _floor(room_type, enc, dmg):
    return {
        "rooms": [
            {"room_type": room_type, "model_id": f"ENCOUNTER.{enc}", "turns_taken": 4}
        ],
        "player_stats": [{"max_hp": 100, "damage_taken": dmg}],
    }


def test_dread_fights_file_under_the_dominion_of_the_act_boss():
    acc = charts_stats.new_accumulator()
    history = [
        [
            _floor("monster", "JAW_WORM", 10),
            _floor("boss", "VANTOM_BOSS", 30),
            _floor("boss", "KIN_BOSS", 40),
        ],
        [_floor("monster", "JAW_WORM", 50)],
    ]
    charts_stats.accumulate_combat(
        acc,
        {"map_point_history": history},
        brackets=["all", "a10", "v9"],
        game_mode="dread",
        is_win=False,
        character="IRONCLAD",
        player_count=1,
        played=PLAYED,
    )
    assert "mode:dread|v9" not in acc
    mode = charts_stats._finalize_one(acc["mode:dread|a10"])
    assert sum(row[4] for row in mode["hp_floor"]) == 4
    dom = charts_stats._finalize_one(acc["dom:KIN_BOSS"])
    assert [(r[2], r[3], r[4]) for r in dom["enc"]] == [("JAW_WORM", 0.1, 1)]
    assert sum(n for _wk, n, _w in dom["week_totals"]) == 1
    assert "dom:VANTOM_BOSS" not in acc

    standard = charts_stats.new_accumulator()
    charts_stats.accumulate_combat(
        standard,
        {"map_point_history": history},
        brackets=["all"],
        game_mode="standard",
        is_win=True,
        character="IRONCLAD",
        player_count=1,
    )
    assert set(standard) - set(charts_stats.new_accumulator()) == {"mode:standard"}
