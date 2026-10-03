"""Seat-set counting, the wax split, lift inputs, relic choice screens,
shops, events and campfires through the lake cube and the tables the
stats pages read, plus the 400 on an unknown bracket."""

import json

import duckdb
import pytest
from fastapi.testclient import TestClient

from app.services import lake_stats, stats_math
from app.services import run_entity_stats as res

PLAYERS_T = json.dumps(
    [
        {
            "player_id": "BIGINT",
            "current_hp": "BIGINT",
            "max_hp": "BIGINT",
            "event_choices": [{"title": {"key": "VARCHAR", "table": "VARCHAR"}}],
            "rest_site_choices": ["VARCHAR"],
            "upgraded_cards": ["VARCHAR"],
            "ancient_choice": [
                {
                    "TextKey": "VARCHAR",
                    "title": {"key": "VARCHAR", "table": "VARCHAR"},
                    "was_chosen": "BOOLEAN",
                }
            ],
            "cards_removed": ["JSON"],
            "card_choices": [{"was_picked": "BOOLEAN", "card": {"id": "VARCHAR"}}],
        }
    ]
)


def _players(pid, hp, mx, event=None, rest=None, cards=None):
    return json.dumps(
        [
            {
                "player_id": pid,
                "current_hp": hp,
                "max_hp": mx,
                "event_choices": [{"title": {"key": event, "table": "events"}}]
                if event
                else [],
                "rest_site_choices": [rest] if rest else [],
                "upgraded_cards": [],
                "ancient_choice": [],
                "cards_removed": [],
                "card_choices": cards or [],
            }
        ]
    )


def write_lake(tmp_path):
    con = duckdb.connect()
    runs = []
    for i in range(1, 8):
        runs.append((f"r{i}", "IRONCLAD", i <= 5, 10, "standard", 1, "pro", "v0.111.0"))
    runs.append(("r8", "SILENT", False, 0, "standard", 1, "casual", "v0.111.0"))
    runs.append(("r9", "DEFECT", True, 10, "standard", 2, "duo", "v0.111.0"))
    vals = ",".join(
        f"('{h}', '{c}', {str(w).lower()}, {a}, '{m}', {pc}, '{u}', "
        f"TIMESTAMP '2026-09-01 00:00:00', '{b}')"
        for h, c, w, a, m, pc, u, b in runs
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES {vals})
        t(run_hash, character, win, ascension, game_mode, player_count,
          username, submitted_at, build_id))
        TO '{tmp_path}/runs.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT 'x' AS run_hash WHERE false)
        TO '{tmp_path}/excluded.parquet' (FORMAT parquet)"""
    )
    seats = [(f"r{i}", 1, 100 + i, "IRONCLAD") for i in range(1, 8)]
    seats += [
        ("r8", 1, 108, "SILENT"),
        ("r9", 1, 109, "DEFECT"),
        ("r9", 2, 209, "SILENT"),
    ]
    vals = ",".join(f"('{h}', {i}, {pid}, '{c}', 10)" for h, i, pid, c in seats)
    con.execute(
        f"""COPY (SELECT * FROM (VALUES {vals})
        t(run_hash, player_idx, player_id, character, deck_size))
        TO '{tmp_path}/players.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('r1', 1, 'IRONCLAD', 'X', 1, 0, NULL),
        ('r9', 1, 'DEFECT', 'X', 1, 0, NULL),
        ('r9', 2, 'SILENT', 'X', 1, 0, NULL))
        t(run_hash, player_idx, character, card, floor_added, upgrade_level,
          enchantment))
        TO '{tmp_path}/deck.parquet' (FORMAT parquet)"""
    )
    relics = [
        ("r1", 1, "JUZU", 3, "IRONCLAD", False),
        ("r2", 1, "JUZU", 3, "IRONCLAD", False),
        ("r3", 1, "JUZU", 3, "IRONCLAD", False),
        ("r6", 1, "JUZU", 3, "IRONCLAD", False),
        ("r4", 1, "JUZU", 5, "IRONCLAD", True),
        ("r9", 1, "ANCHOR", 2, "DEFECT", False),
        ("r9", 2, "ANCHOR", 2, "SILENT", False),
    ]
    vals = ",".join(
        f"('{h}', {i}, '{r}', {f}, '{c}', {str(w).lower()})"
        for h, i, r, f, c, w in relics
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES {vals})
        t(run_hash, player_idx, relic, floor_added, character, is_wax))
        TO '{tmp_path}/relics.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('r1', 1, 'FIRE', 'IRONCLAD', false),
        ('r2', 1, 'FIRE', 'IRONCLAD', false))
        t(run_hash, player_idx, potion, character, was_used))
        TO '{tmp_path}/potions.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('r1', 0, 3, 1, 'FIRE', 'used', 3),
        ('r3', 0, 2, 1, 'FIRE', 'used', 2),
        ('r3', 0, 4, 1, 'FIRE', 'used', 4),
        ('r6', 0, 1, 1, 'BLOCK', 'discarded', 1))
        t(run_hash, act, floor_idx, player_idx, potion, kind, floor))
        TO '{tmp_path}/potion_events.parquet' (FORMAT parquet)"""
    )
    depth = {
        "r1": 5,
        "r2": 5,
        "r3": 5,
        "r4": 5,
        "r5": 5,
        "r6": 3,
        "r7": 2,
        "r8": 4,
        "r9": 2,
    }
    special = {
        ("r1", 1): (
            "unknown",
            _players(101, 30, 80, event="DOORS.pages.INITIAL.options.DARK.title"),
        ),
        ("r1", 2): ("rest", _players(101, 30, 80, rest="REST")),
        ("r2", 1): (
            "unknown",
            _players(102, 70, 80, event="DOORS.pages.INITIAL.options.LIGHT.title"),
        ),
        ("r2", 2): ("rest", _players(102, 70, 80, rest="SMITH")),
        ("r6", 1): (
            "unknown",
            _players(106, 70, 80, event="DOORS.pages.INITIAL.options.DARK.title"),
        ),
    }
    floors = []
    for h, n in depth.items():
        for f in range(1, n + 1):
            kind, players = special.get((h, f), ("monster", _players(100, 50, 80)))
            floors.append((h, 0, f, kind, players))
    vals = ",".join(f"('{h}', {a}, {f}, '{t}', '{p}')" for h, a, f, t, p in floors)
    con.execute(
        f"""COPY (SELECT run_hash, act, floor_idx, map_point_type,
          json_transform(players_json, '{PLAYERS_T}') AS players,
          []::VARCHAR[] AS room_models, 'event' AS room_type,
          NULL::VARCHAR AS room_model, NULL::BIGINT AS room_turns
        FROM (VALUES {vals}) t(run_hash, act, floor_idx, map_point_type, players_json))
        TO '{tmp_path}/floors.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('r1', 0, 3, 1, 'JUZU', true, false, 2, 1),
        ('r1', 0, 3, 1, 'ANCHOR', false, false, 2, 1),
        ('r1', 1, 9, 1, 'JUZU', false, true, 3, 1),
        ('r1', 1, 9, 1, 'ORRERY', true, true, 3, 1),
        ('r1', 1, 9, 1, 'STRIKE_DUMMY', false, true, 3, 1),
        ('r2', 0, 3, 1, 'JUZU', false, false, 2, 0),
        ('r2', 0, 3, 1, 'ANCHOR', false, false, 2, 0),
        ('r3', 0, 3, 1, 'JUZU', true, false, 1, 1),
        ('r5', 0, 2, 1, 'VAJRA', true, false, 2, 2),
        ('r5', 0, 2, 1, 'LANTERN', true, false, 2, 2),
        ('r5', 0, 4, 1, 'BURNING_BLOOD', true, false, 2, 1),
        ('r5', 0, 4, 1, 'ANCHOR', false, false, 2, 1))
        t(run_hash, act, floor_idx, player_idx, relic, picked, is_shop, n_options,
          n_picked))
        TO '{tmp_path}/relic_choices.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('r1', 1, 'relics', 'ORRERY', true, 4),
        ('r1', 1, 'relics', 'STRIKE_DUMMY', false, 4),
        ('r1', 1, 'cards', 'X', true, 4),
        ('r6', 1, 'relics', 'ORRERY', true, 2))
        t(run_hash, player_idx, entity_type, id, bought, floor))
        TO '{tmp_path}/shop_items.parquet' (FORMAT parquet)"""
    )
    con.close()


@pytest.fixture()
def lake(tmp_path, monkeypatch):
    write_lake(tmp_path)
    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(lake_stats, "_entity_cube_cache", None)
    monkeypatch.setattr(lake_stats, "_entity_store_cache", None)
    monkeypatch.setattr(lake_stats, "_fold_cache", {})
    monkeypatch.setattr(res, "_maybe_rebuild", lambda: None)
    monkeypatch.setattr(res, "_official_entity_ids", lambda _t: frozenset())
    monkeypatch.setattr(res, "_non_reward_card_ids", lambda: frozenset())
    monkeypatch.setattr(res, "_excluded_card_ids", lambda: frozenset())
    monkeypatch.setattr(res, "_multiplayer_card_ids", lambda: frozenset())
    monkeypatch.setattr(res, "_starter_relic_ids", lambda: frozenset({"BURNING_BLOOD"}))
    con = lake_stats._connect(build=True)
    try:
        lake_stats.build_entity_cube(con)
    finally:
        con.close()
    return tmp_path


def test_cube_counts_seats_wax_and_lift_inputs(lake):
    fold = lake_stats.entity_bracket_fold("relics", "all")
    assert fold["total_runs"] == 9 and fold["total_seats"] == 10
    picks, wins, n_exp, wins_exp, exp_sum = fold["entries"]["JUZU"]
    assert (picks, wins) == (4, 3), "the wax copy on r4 stays out of the base row"
    assert n_exp == 4 and wins_exp == 3
    # Floor-adjusted: JUZU is picked up on floor 3, and of pro's other runs
    # only r7 (depth 2) never got there, so each winning seat expects 4/5
    # and the r6 seat expects 5/5 instead of the flat 4/6 and 5/6.
    assert exp_sum == pytest.approx(3 * 0.8 + 1.0, abs=0.002)
    assert fold["wax"] == {"JUZU": [1, 1]}
    anchor = fold["entries"]["ANCHOR"]
    assert anchor[:2] == [2, 2], "both seats of the 2P run count"
    # duo has one run, so both seats fall back to the community A10 curve
    # at floor 2 minus their own run: 7 of pro's runs, 5 won.
    assert anchor[2] == 2 and anchor[4] == pytest.approx(2 * 5 / 7, abs=0.002)
    assert fold["offers"]["JUZU"]["offered"] == 2
    assert fold["offers"]["JUZU"]["picked"] == 1
    assert "ORRERY" not in fold["offers"], "shop shelves are not offers"
    assert "VAJRA" not in fold["offers"], (
        "a list where everything was taken is not a choice"
    )
    assert "BURNING_BLOOD" not in fold["offers"], "starter relics are never offered"
    assert fold["offers"]["ANCHOR"] == {
        "offered": 3,
        "picked": 0,
        "off_act": [3, 0, 0],
        "pick_act": [0, 0, 0],
    }
    potions = lake_stats.entity_bracket_fold("potions", "all")
    # FIRE: held at the end on r1 and r2, used on r1 (floor 3) and r3 (never
    # in r3's final belt); BLOCK only ever discarded. Obtained seats are the
    # union, used seats count once each.
    assert potions["entries"]["FIRE"][:2] == [3, 3]
    assert potions["entries"]["BLOCK"][:2] == [1, 0]
    assert potions["used"] == {"FIRE": 2}
    # r3's expectation sits at its first use floor (2); r2 has no event so
    # it reads the floor-1 curve.
    assert potions["entries"]["FIRE"][2] == 3


def test_metrics_table_rows_carry_the_new_columns(lake, monkeypatch):
    monkeypatch.setattr(lake_stats, "bracket_elo_for", lambda *_a: None)
    out = res.get_entity_metrics_table("relics", "solo")
    assert out["total_runs"] == 8 and out["total_seats"] == 8
    juzu = next(r for r in out["rows"] if r["id"] == "JUZU")
    assert juzu["hold_rate"] == 50.0
    assert juzu["win_rate"] == 75.0
    assert juzu["win_rate_ci"] == stats_math.wilson_interval(3, 4)
    assert juzu["lift"] is None and juzu["lift_n"] == 4
    assert juzu["wax"] == {
        "picks": 1,
        "wins": 1,
        "win_rate": 100.0,
        "win_rate_ci": stats_math.wilson_interval(1, 1),
    }
    assert juzu["pick_rate"] == 50.0 and juzu["offered"] == 2
    coop = res.get_entity_metrics_table("relics", "2p")
    anchor = next(r for r in coop["rows"] if r["id"] == "ANCHOR")
    assert coop["total_seats"] == 2 and anchor["hold_rate"] == 100.0
    potions = res.get_entity_metrics_table("potions", "solo")
    fire = next(r for r in potions["rows"] if r["id"] == "FIRE")
    assert fire["picks"] == 3
    assert fire["used"] == 2 and fire["use_rate"] == pytest.approx(66.7)
    assert fire["pick_rate"] is None


def test_scores_pick_rate_divides_by_seats(lake, monkeypatch):
    monkeypatch.setattr(lake_stats, "bracket_elo_for", lambda *_a: None)
    scores = res.get_all_entity_scores("relics", bracket="2p")
    assert scores["ANCHOR"]["picks"] == 2
    assert scores["ANCHOR"]["pick_rate"] == 100.0


def test_shop_event_and_campfire_tables(lake):
    shops = res.get_shop_metrics_table("all")
    orrery = next(r for r in shops["rows"] if r["id"] == "ORRERY")
    assert orrery["entity_type"] == "relics"
    assert (orrery["seen"], orrery["bought"], orrery["buy_rate"]) == (2, 2, 100.0)
    assert orrery["wins"] == 1 and orrery["win_rate"] == 50.0
    assert orrery["lift_n"] == 2
    dummy = next(r for r in shops["rows"] if r["id"] == "STRIKE_DUMMY")
    assert dummy["bought"] == 0 and dummy["win_rate"] is None
    events = res.get_event_metrics_table("all")
    dark = next(r for r in events["rows"] if r["option"] == "DARK")
    assert dark["event"] == "DOORS"
    assert dark["chosen"] == 2 and dark["share"] == pytest.approx(66.7)
    assert dark["wins"] == 1 and dark["win_rate"] == 50.0
    assert dark["lift_n"] == 2
    camps = res.get_campfire_metrics_table("all")
    rest = next(r for r in camps["rows"] if r["choice"] == "REST")
    assert rest["chosen"] == 1 and rest["share"] == 50.0
    assert rest["wins"] == 1 and rest["low_hp_share"] == 100.0
    assert rest["lift_n"] == 1
    smith = next(r for r in camps["rows"] if r["choice"] == "SMITH")
    assert smith["low_hp_share"] == 0.0
    assert res.get_shop_metrics_table("4p")["rows"] == []


def test_relic_pairs_come_from_free_screens_only(lake):
    tiers = lake_stats.reward_pair_counts_by_tier(table="relic_choice_rows")
    pairs = lake_stats.fold_tier_pairs(tiers)
    assert pairs[("JUZU", "ANCHOR")] == 1
    assert pairs[("JUZU", lake_stats.SKIP_ID)] == 1
    assert pairs[(lake_stats.SKIP_ID, "JUZU")] == 1
    assert pairs[(lake_stats.SKIP_ID, "ANCHOR")] == 2
    assert not any("ORRERY" in k for k in pairs), "shop shelves never pair"
    assert not any("VAJRA" in k or "LANTERN" in k for k in pairs)
    assert not any("BURNING_BLOOD" in k for k in pairs)


def test_floor_curves_leave_one_out(lake):
    con = lake_stats._connect(build=True)
    try:
        lake_stats._ensure_floor_curves(con)
        curve = dict(
            (f, (n, w))
            for f, n, w in con.execute(
                "SELECT floor, n, w FROM floor_curve WHERE uname = 'pro' ORDER BY 1"
            ).fetchall()
        )
        assert curve[0] == (7, 5) and curve[3] == (6, 5) and curve[5] == (5, 5)
        assert con.execute(
            "SELECT n, w FROM floor_curve_all WHERE a10 AND floor = 2"
        ).fetchone() == (8, 6)
        assert con.execute(
            "SELECT floor_offset FROM act_offsets WHERE run_hash = 'r1'"
        ).fetchone() == (0,)
    finally:
        lake_stats._drop_floor_curves(con)
        con.close()


def test_entity_store_relic_block(lake, monkeypatch):
    monkeypatch.setattr(res, "_official_relic_ids", lambda: frozenset())
    monkeypatch.setattr(res, "_upgradeable_card_ids", lambda: frozenset())
    store = lake_stats.build_entity_store()
    juzu = store["entities"]["relics"]["JUZU"]
    assert (juzu["picks"], juzu["wins"]) == (4, 3)
    assert juzu["wax"] == {"picks": 1, "wins": 1}
    assert juzu["offered"] == 2 and juzu["picked"] == 1
    assert store["entities"]["potions"]["FIRE"]["used"] == 2
    assert store["entities"]["potions"]["FIRE"]["picks"] == 3
    assert store["entities"]["potions"]["BLOCK"]["picks"] == 1
    assert store["totals"]["total_seats"] == 10
    assert store["entities"]["relics"]["ANCHOR"]["picks"] == 2
    assert "relic_reward" in store["elo_strengths"]


def test_unknown_bracket_is_a_400(lake, monkeypatch):
    from app.dependencies import shared_limiter
    from app.main import app

    monkeypatch.setattr(shared_limiter, "enabled", False)
    client = TestClient(app, raise_server_exceptions=False)
    for path in (
        "/api/runs/metrics/relics?bracket=a10:wr50",
        "/api/runs/scores/cards?bracket=junk",
        "/api/runs/metrics/shops?bracket=junk",
        "/api/runs/metrics/events?bracket=nope",
        "/api/runs/metrics/campfires?bracket=nope",
    ):
        r = client.get(path)
        assert r.status_code == 400, path
        assert r.json()["detail"].startswith("unknown bracket")
    assert client.get("/api/runs/metrics/shops?bracket=solo").status_code == 200
    assert client.get("/api/runs/metrics/campfires").status_code == 200


def test_wilson_and_lift_helpers():
    assert stats_math.wilson_interval(0, 0) is None
    lo, hi = stats_math.wilson_interval(50, 100)
    assert lo == pytest.approx(40.4, abs=0.1) and hi == pytest.approx(59.6, abs=0.1)
    assert stats_math.wilson_interval(1, 1)[1] == 100.0
    assert stats_math.lift_of(19, 10, 5.0) is None
    assert stats_math.lift_of(20, 12, 10.0) == 10.0
    assert stats_math.padded_counts([3, 2], 5) == [3, 2, 0, 0, 0]
