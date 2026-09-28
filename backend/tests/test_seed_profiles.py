"""The nightly seed index: the lake stage turns run tables and replay tables
into facts plus profiles keyed by seed, build, lobby and party, and the
serving queries rank seeds by predicates matched, scope by version and
character, describe one seed, and pick a random one."""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "lab"))

import seed_profiles as stage  # noqa: E402

from app.services import lake_stats, seed_profiles as svc  # noqa: E402


def _players(offers, card_choices):
    return [
        {
            "player_id": 1,
            "current_gold": 99,
            "current_hp": 70,
            "damage_taken": 0,
            "max_hp": 80,
            "event_choices": [],
            "rest_site_choices": [],
            "upgraded_cards": [],
            "ancient_choice": [
                {
                    "TextKey": o,
                    "title": {"key": o, "table": "relics"},
                    "was_chosen": i == 0,
                }
                for i, o in enumerate(offers)
            ],
            "cards_removed": [],
            "card_choices": [
                {"was_picked": i == 0, "card": {"id": "CARD." + c}}
                for i, c in enumerate(card_choices)
            ],
            "potion_choices": [],
        }
    ]


def _floor(act, idx, kind, model, room_type, offers=(), cards=()):
    return {
        "run_hash": None,
        "act": act,
        "floor_idx": idx,
        "map_point_type": kind,
        "players": _players(list(offers), list(cards)),
        "room_models": [model],
        "room_type": room_type,
        "room_model": model,
        "room_turns": 3,
    }


@pytest.fixture
def lake(tmp_path, monkeypatch):
    lake = tmp_path / "lake"
    lake.mkdir()
    monkeypatch.setattr(stage, "LAKE", lake)
    monkeypatch.setattr(svc, "LAKE_DIR", lake)
    monkeypatch.setattr(lake_stats, "LAKE_DIR", lake)
    monkeypatch.setenv("LAKE_BUILD_MEMORY", "400MB")
    con = duckdb.connect()
    now = datetime(2026, 9, 20, tzinfo=timezone.utc)
    runs = [
        # Seed AAAA on main, Ironclad, two runs: one win, one loss.
        (
            "r1",
            "IRONCLAD",
            True,
            False,
            10,
            "standard",
            1,
            "v0.107.1",
            "AAAA",
            100,
            1500,
            "Dobo",
        ),
        (
            "r2",
            "IRONCLAD",
            False,
            False,
            10,
            "standard",
            1,
            "v0.107.1",
            "AAAA",
            200,
            900,
            "Cosmo",
        ),
        # Same seed on beta hashes differently: its own key.
        (
            "r3",
            "IRONCLAD",
            False,
            False,
            10,
            "standard",
            1,
            "v0.111.0",
            "AAAA",
            300,
            800,
            None,
        ),
        # Seed BBBB Silent, a co-op 2p lobby with two sibling docs.
        (
            "r4",
            "SILENT",
            True,
            False,
            5,
            "standard",
            2,
            "v0.107.1",
            "BBBB",
            400,
            2000,
            "sama",
        ),
        (
            "r5",
            "DEFECT",
            True,
            False,
            5,
            "standard",
            2,
            "v0.107.1",
            "BBBB",
            400,
            2000,
            "yuki",
        ),
        # Modded and hidden runs never enter the index.
        (
            "r6",
            "REGENT",
            True,
            False,
            10,
            "standard",
            1,
            "v0.107.1",
            "CCCC",
            500,
            700,
            None,
        ),
        (
            "r7",
            "REGENT",
            True,
            False,
            10,
            "custom",
            1,
            "v0.107.1",
            "DDDD",
            600,
            700,
            None,
        ),
    ]
    con.execute(
        "CREATE TABLE runs (run_hash VARCHAR, character VARCHAR, win BOOLEAN, was_abandoned BOOLEAN, "
        "ascension BIGINT, game_mode VARCHAR, player_count BIGINT, build_id VARCHAR, seed VARCHAR, "
        "start_time BIGINT, run_time BIGINT, username VARCHAR, user_id VARCHAR, hidden BOOLEAN, "
        "deleted BOOLEAN, has_modifiers BOOLEAN, submitted_at TIMESTAMP, played_at TIMESTAMP, "
        "killed_by_encounter VARCHAR, killed_by_event VARCHAR)"
    )
    for r in runs:
        con.execute(
            "INSERT INTO runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,false,false,?,?,NULL,NULL)",
            [*r[:12], r[0] == "r6", now, now],
        )
    con.execute(f"COPY runs TO '{lake}/runs.parquet' (FORMAT parquet)")
    con.execute(
        "CREATE TABLE scalars AS SELECT run_hash, 51 AS floors_reached, 30 AS deck_size, 12 AS relic_count, "
        "3 AS acts_completed, username, hidden, character, build_id FROM runs"
    )
    con.execute(f"COPY scalars TO '{lake}/run_scalars.parquet' (FORMAT parquet)")
    con.execute(
        f"COPY (SELECT run_hash FROM runs WHERE run_hash = 'r7') TO '{lake}/excluded.parquet' (FORMAT parquet)"
    )

    floors = []
    for rh, offers, floor2 in (
        ("r1", ["LEAD_PAPERWEIGHT", "NEOWS_TALISMAN"], ["BASH", "CLEAVE", "ANGER"]),
        ("r2", ["LEAD_PAPERWEIGHT", "NEOWS_TALISMAN"], ["BASH", "CLEAVE", "ANGER"]),
        ("r3", ["WINGED_BOOTS"], ["FLEX"]),
        ("r4", ["NEW_LEAF"], ["BACKFLIP"]),
        ("r5", ["NEW_LEAF"], ["ZAP"]),
        ("r6", ["POMANDER"], ["CLASH"]),
        ("r7", ["POMANDER"], ["CLASH"]),
    ):
        for f in (
            _floor(0, 1, "ancient", "EVENT.NEOW", "event", offers=offers),
            _floor(0, 2, "monster", "ENCOUNTER.JAW_WORM", "monster", cards=floor2),
            _floor(0, 5, "unknown", "EVENT.BRAIN_LEECH", "event"),
            _floor(
                0, 16, "boss", "ENCOUNTER.VANTOM_BOSS", "boss", cards=["DEMON_FORM"]
            ),
        ):
            f["run_hash"] = rh
            floors.append(f)
    con.execute(
        "CREATE TABLE floors (run_hash VARCHAR, act BIGINT, floor_idx BIGINT, map_point_type VARCHAR, "
        "players STRUCT(player_id BIGINT, current_gold BIGINT, current_hp BIGINT, damage_taken BIGINT, max_hp BIGINT, "
        'event_choices STRUCT(title STRUCT("key" VARCHAR, "table" VARCHAR))[], rest_site_choices VARCHAR[], '
        'upgraded_cards VARCHAR[], ancient_choice STRUCT(TextKey VARCHAR, title STRUCT("key" VARCHAR, "table" VARCHAR), was_chosen BOOLEAN)[], '
        "cards_removed JSON[], card_choices STRUCT(was_picked BOOLEAN, card STRUCT(id VARCHAR))[], "
        "potion_choices STRUCT(was_picked BOOLEAN, choice VARCHAR)[])[], "
        "room_models VARCHAR[], room_type VARCHAR, room_model VARCHAR, room_turns BIGINT)"
    )
    for f in floors:
        con.execute(
            "INSERT INTO floors SELECT ?, ?, ?, ?, ?::STRUCT(player_id BIGINT, current_gold BIGINT, current_hp BIGINT, damage_taken BIGINT, max_hp BIGINT, "
            'event_choices STRUCT(title STRUCT("key" VARCHAR, "table" VARCHAR))[], rest_site_choices VARCHAR[], upgraded_cards VARCHAR[], '
            'ancient_choice STRUCT(TextKey VARCHAR, title STRUCT("key" VARCHAR, "table" VARCHAR), was_chosen BOOLEAN)[], cards_removed JSON[], '
            "card_choices STRUCT(was_picked BOOLEAN, card STRUCT(id VARCHAR))[], potion_choices STRUCT(was_picked BOOLEAN, choice VARCHAR)[])[], "
            "?, ?, ?, ?",
            [
                f["run_hash"],
                f["act"],
                f["floor_idx"],
                f["map_point_type"],
                json.dumps(f["players"]),
                f["room_models"],
                f["room_type"],
                f["room_model"],
                f["room_turns"],
            ],
        )
    con.execute(f"COPY floors TO '{lake}/floors.parquet' (FORMAT parquet)")
    con.execute(
        "CREATE TABLE floor_events AS SELECT run_hash, act + 1 AS act, floor_idx, map_point_type, room_type, "
        "upper(split_part(room_model, '.', -1)) AS encounter, room_turns AS turns, 0 AS damage_taken, "
        "70 AS p1_hp, 80 AS p1_max_hp, 99 AS p1_gold FROM floors"
    )
    con.execute(f"COPY floor_events TO '{lake}/floor_events.parquet' (FORMAT parquet)")
    con.execute(
        "CREATE TABLE relics (run_hash VARCHAR, player_idx BIGINT, relic VARCHAR, floor_added BIGINT, character VARCHAR)"
    )
    con.execute(
        "INSERT INTO relics VALUES ('r1', 1, 'ANCHOR', 4, 'IRONCLAD'), ('r2', 1, 'ANCHOR', 9, 'IRONCLAD'), ('r4', 1, 'MEAL_TICKET', 3, 'SILENT')"
    )
    con.execute(f"COPY relics TO '{lake}/relics.parquet' (FORMAT parquet)")
    con.execute(
        "CREATE TABLE deck (run_hash VARCHAR, player_idx BIGINT, character VARCHAR, card VARCHAR, floor_added BIGINT, upgrade_level BIGINT, enchantment VARCHAR)"
    )
    con.execute(
        "INSERT INTO deck VALUES ('r1', 1, 'IRONCLAD', 'BASH', 2, 0, NULL), ('r1', 1, 'IRONCLAD', 'DEMON_FORM', 16, 1, NULL), ('r4', 1, 'SILENT', 'BACKFLIP', 2, 0, NULL)"
    )
    con.execute(f"COPY deck TO '{lake}/deck.parquet' (FORMAT parquet)")

    batch = lake / "replays" / "batch1"
    batch.mkdir(parents=True)
    con.execute(
        "CREATE TABLE replay_index (run_hash VARCHAR, seed VARCHAR, player_count INTEGER, win BOOLEAN, floors INTEGER)"
    )
    con.execute("INSERT INTO replay_index VALUES ('r1', 'AAAA', 1, true, 51)")
    con.execute(f"COPY replay_index TO '{batch}/replay_index.parquet' (FORMAT parquet)")
    con.execute(
        "CREATE TABLE shops (run_hash VARCHAR, s BIGINT, ms BIGINT, floor INTEGER, act INTEGER, gold INTEGER, "
        "removal_cost INTEGER, removal_stocked BOOLEAN, items STRUCT(kind VARCHAR, slot INTEGER, id VARCHAR, cost INTEGER, stocked BOOLEAN, sale BOOLEAN, pool VARCHAR)[])"
    )
    con.execute(
        "INSERT INTO shops VALUES ('r1', 40, 1000, 6, 1, 150, 75, true, "
        "[{'kind':'card','slot':0,'id':'WHIRLWIND','cost':120,'stocked':true,'sale':false,'pool':'character'}, "
        "{'kind':'relic','slot':0,'id':'MEAL_TICKET','cost':180,'stocked':true,'sale':false,'pool':NULL}])"
    )
    con.execute(f"COPY shops TO '{batch}/shops.parquet' (FORMAT parquet)")
    con.execute(
        "CREATE TABLE maps (run_hash VARCHAR, s BIGINT, ms BIGINT, floor INTEGER, act INTEGER, "
        "nodes STRUCT(coord VARCHAR, kind VARCHAR, children VARCHAR[])[])"
    )
    con.execute(
        "INSERT INTO maps VALUES ('r1', 2, 10, 0, 1, [{'coord':'0,0','kind':'monster','children':['1,0']}])"
    )
    con.execute(f"COPY maps TO '{batch}/maps.parquet' (FORMAT parquet)")
    con.close()
    meta = stage.build()
    return lake, meta


def test_stage_builds_facts_and_profiles(lake):
    _, meta = lake
    assert meta["seeds"] == 3
    assert meta["with_shops"] and meta["with_maps"]
    assert "v0.107.1" in meta["builds"]
    con = duckdb.connect()
    keys = [
        r[0]
        for r in con.execute(
            f"SELECT seed_key FROM read_parquet('{lake[0]}/seed_profiles.parquet') ORDER BY 1"
        ).fetchall()
    ]
    assert keys == [
        "AAAA|v0.107.1|1|IRONCLAD",
        "AAAA|v0.111.0|1|IRONCLAD",
        "BBBB|v0.107.1|2|DEFECT+SILENT",
    ]
    kinds = dict(
        con.execute(
            f"SELECT kind, count(*) FROM read_parquet('{lake[0]}/seed_facts.parquet') GROUP BY 1"
        ).fetchall()
    )
    assert {
        "ancient_offer",
        "ancient",
        "event",
        "boss",
        "card_offer",
        "relic",
        "deck",
        "shop_card",
        "shop_relic",
    } <= set(kinds)
    assert kinds["shop_card"] == 1 and kinds["boss"] == 3


def test_search_ranks_full_matches_first_and_reports_where(lake):
    out = svc.search(
        [
            svc.Predicate("neow", "LEAD_PAPERWEIGHT"),
            svc.Predicate("offered", "BASH", act=1, floor_max=3),
        ],
        svc.Scope(build_id="v0.107.1"),
    )
    assert out["predicates"] == 2
    top = out["results"][0]
    assert (
        top["seed"] == "AAAA"
        and top["full_match"]
        and top["runs"] == 2
        and top["wins"] == 1
    )
    assert top["win_rate"] == 50.0
    assert top["best_run"]["run_hash"] == "r1" and top["best_run"]["win"] is True
    assert top["replay"]["url"] == "/runs/r1/replay"
    assert top["where"]["offered:BASH act1 <=f3"] == [{"act": 1, "floor": 2}]
    assert top["neow_offers"] == ["LEAD_PAPERWEIGHT", "NEOWS_TALISMAN"] or sorted(
        top["neow_offers"]
    ) == ["LEAD_PAPERWEIGHT", "NEOWS_TALISMAN"]
    assert top["bosses"] == [{"act": 1, "id": "VANTOM_BOSS"}]
    assert all(
        r["seed"] != "AAAA" or r["build_id"] == "v0.107.1" for r in out["results"]
    )


def test_search_scopes_by_version_party_and_lobby(lake):
    beta = svc.search(
        [svc.Predicate("neow", "WINGED_BOOTS")], svc.Scope(build_id="v0.111.0")
    )
    assert [r["seed"] for r in beta["results"]] == ["AAAA"] and beta["results"][0][
        "build_id"
    ] == "v0.111.0"
    assert (
        svc.search(
            [svc.Predicate("neow", "WINGED_BOOTS")], svc.Scope(build_id="v0.107.1")
        )["results"]
        == []
    )
    coop = svc.search(
        [svc.Predicate("neow", "NEW_LEAF")],
        svc.Scope(player_count=2, characters=("SILENT", "DEFECT")),
    )
    assert [r["seed"] for r in coop["results"]] == ["BBBB"]
    assert (
        coop["results"][0]["party"] == ["DEFECT", "SILENT"]
        and coop["results"][0]["players"] == 2
    )
    assert (
        svc.search(
            [svc.Predicate("neow", "NEW_LEAF")], svc.Scope(characters=("REGENT",))
        )["results"]
        == []
    )


def test_shop_relic_deck_and_count_predicates(lake):
    assert (
        svc.search([svc.Predicate("shop_card", "WHIRLWIND")], svc.Scope())["results"][
            0
        ]["seed"]
        == "AAAA"
    )
    assert (
        svc.search([svc.Predicate("relic", "ANCHOR", floor_max=5)], svc.Scope())[
            "results"
        ][0]["seed"]
        == "AAAA"
    )
    assert (
        svc.search([svc.Predicate("deck", "DEMON_FORM")], svc.Scope())["results"][0][
            "seed"
        ]
        == "AAAA"
    )
    partial = svc.search(
        [svc.Predicate("neow", "NEW_LEAF"), svc.Predicate("boss", "NOPE_BOSS", act=1)],
        svc.Scope(),
    )
    assert partial["results"][0]["seed"] == "BBBB" and partial["results"][0][
        "missing"
    ] == ["boss:NOPE_BOSS act1"]
    assert svc.search([svc.Predicate("neow", "POMANDER")], svc.Scope())["results"] == []


def test_profile_and_random(lake):
    prof = svc.profile("AAAA")
    assert [v["build_id"] for v in prof["variants"]] == ["v0.107.1", "v0.111.0"]
    main = prof["variants"][0]
    assert main["shops"][0]["items"][0]["id"] == "WHIRLWIND"
    assert main["map_act1"][0]["coord"] == "0,0"
    assert {f["id"] for f in main["facts"] if f["kind"] == "card_offer"} == {
        "BASH",
        "CLEAVE",
        "ANGER",
        "DEMON_FORM",
    }
    assert main["run_hashes"] == ["r1", "r2"] or sorted(main["run_hashes"]) == [
        "r1",
        "r2",
    ]
    assert svc.profile("AAAA", build_id="v0.111.0")["variants"][0]["neow_offers"] == [
        "WINGED_BOOTS"
    ]
    assert svc.profile("ZZZZ")["variants"] == []
    pick = svc.random_seed(build_id="v0.107.1")
    assert pick and pick["seed"] in {"AAAA", "BBBB"}
    assert svc.random_seed(build_id="v9.9.9") is None
    assert svc.available() and svc.meta()["seeds"] == 3


def test_predicate_grammar_parses_counts_acts_floors_and_seats():
    from app.routers.runs import _seed_predicates

    preds = _seed_predicates(
        deck="DEMON_FORM",
        offered="bash:2@1<=5, cleave>=10#2",
        relics="ANCHOR<=4",
        events="BRAIN_LEECH@2",
        ancient="DARV",
        ancient_act=2,
        neow="LEAD_PAPERWEIGHT",
        bosses="VANTOM_BOSS@1",
        elites="",
        shop="WHIRLWIND,relic:MEAL_TICKET,potion:BLOCK_POTION",
        ancient_offers="ECTOPLASM@2",
    )
    labels = [p.label() for p in preds]
    assert labels == [
        "deck:DEMON_FORM",
        "offered:BASH x2 act1 <=f5",
        "offered:CLEAVE >=f10 seat2",
        "relic:ANCHOR <=f4",
        "event:BRAIN_LEECH act2",
        "neow:LEAD_PAPERWEIGHT act1",
        "ancient_offer:ECTOPLASM act2",
        "boss:VANTOM_BOSS act1",
        "ancient:DARV act2",
        "shop_card:WHIRLWIND",
        "shop_relic:MEAL_TICKET",
        "shop_potion:BLOCK_POTION",
    ]
    assert preds[1].count == 2 and preds[1].floor_max == 5 and preds[2].seat == 2
    assert _seed_predicates("", "", "", "", None, None, "", "", "", "", "") == []


def test_routes_serve_the_index_and_fall_back(lake, monkeypatch):
    from fastapi.testclient import TestClient

    from app.dependencies import shared_limiter
    from app.main import app
    from app.routers import runs as runs_router
    from app.services import cache as app_cache

    monkeypatch.setattr(shared_limiter, "enabled", False)
    monkeypatch.setattr(app_cache, "get_json", lambda key: None)
    monkeypatch.setattr(app_cache, "set_json", lambda *a, **k: None)
    client = TestClient(app)
    r = client.get(
        "/api/runs/seed-finder",
        params={"neow": "LEAD_PAPERWEIGHT", "build_id": "v0.107.1"},
    )
    body = r.json()
    assert (
        body["available"] and body["engine"] == "index" and body["index"]["seeds"] == 3
    )
    assert body["results"][0]["seed"] == "AAAA" and body["results"][0]["full_match"]
    assert client.get("/api/runs/seed-finder").json()["available"] is False
    meta = client.get("/api/runs/seed-finder/meta").json()
    assert meta["available"] is True and meta["seeds"] == 3
    prof = client.get("/api/runs/seed-finder/seed/aaaa").json()
    assert prof["available"] and prof["seed"] == "AAAA" and len(prof["variants"]) == 2
    rnd = client.get(
        "/api/runs/seed-finder/random", params={"build_id": "v0.111.0"}
    ).json()
    assert rnd["available"] and rnd["seed"]["seed"] == "AAAA"
    monkeypatch.setattr(svc, "available", lambda: False)
    monkeypatch.setattr(
        runs_router,
        "_legacy_seed_finder",
        lambda *a, **k: {"results": [{"seed": "LEGACY"}], "engine": "legacy"},
    )
    body = client.get("/api/runs/seed-finder", params={"relics": "ANCHOR"}).json()
    assert body["engine"] == "legacy" and body["results"][0]["seed"] == "LEGACY"
    assert client.get("/api/runs/seed-finder/seed/aaaa").json()["available"] is False
