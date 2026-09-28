"""The nightly seed index: the lake stage turns run tables and replay tables
into per-run facts plus profiles keyed by seed, build, lobby and party; the
serving queries rank seeds by how many predicates ONE run satisfied, scope
by version and character, describe one seed, and pick a random one; the
routes validate the grammar and refuse to answer loosely."""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "lab"))

import seed_profiles as stage  # noqa: E402

from app.services import lake_stats, seed_profiles as svc  # noqa: E402

PLAYER_TYPE = (
    "STRUCT(player_id BIGINT, current_gold BIGINT, current_hp BIGINT, damage_taken BIGINT, max_hp BIGINT, "
    'event_choices STRUCT(title STRUCT("key" VARCHAR, "table" VARCHAR))[], rest_site_choices VARCHAR[], '
    'upgraded_cards VARCHAR[], ancient_choice STRUCT(TextKey VARCHAR, title STRUCT("key" VARCHAR, "table" VARCHAR), was_chosen BOOLEAN)[], '
    "cards_removed JSON[], card_choices STRUCT(was_picked BOOLEAN, card STRUCT(id VARCHAR))[], "
    "potion_choices STRUCT(was_picked BOOLEAN, choice VARCHAR)[])[]"
)


def _seat(pid, offers, cards):
    return {
        "player_id": pid,
        "current_gold": 99,
        "current_hp": 70,
        "damage_taken": 0,
        "max_hp": 80,
        "event_choices": [],
        "rest_site_choices": [],
        "upgraded_cards": [],
        "ancient_choice": [
            {"TextKey": o, "title": {"key": o, "table": "relics"}, "was_chosen": i == 0}
            for i, o in enumerate(offers)
        ],
        "cards_removed": [],
        "card_choices": [
            {"was_picked": i == 0, "card": {"id": "CARD." + c}}
            for i, c in enumerate(cards)
        ],
        "potion_choices": [],
    }


def _floor(rh, act, idx, kind, model, room_type, seats):
    return {
        "run_hash": rh,
        "act": act,
        "floor_idx": idx,
        "map_point_type": kind,
        "players": seats,
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
    # run_hash, character, win, abandoned, asc, mode, players, build, seed, start, run_time, user
    runs = [
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
        # BBBB: a 2p lobby of two Silents; both sibling docs share the blob.
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
            "yuki",
        ),
        # EEEE: two separate runs, each showing only one of two things.
        (
            "r8",
            "DEFECT",
            True,
            False,
            10,
            "standard",
            1,
            "v0.107.1",
            "EEEE",
            700,
            1000,
            None,
        ),
        (
            "r9",
            "DEFECT",
            False,
            False,
            10,
            "standard",
            1,
            "v0.107.1",
            "EEEE",
            None,
            1100,
            None,
        ),
        # Hidden and custom runs never enter the index.
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
        "CREATE TABLE scalars AS SELECT run_hash, CASE WHEN run_hash = 'r9' THEN 20 ELSE 51 END AS floors_reached, "
        "30 AS deck_size, 12 AS relic_count, 3 AS acts_completed, username, hidden, character, build_id FROM runs"
    )
    con.execute(f"COPY scalars TO '{lake}/run_scalars.parquet' (FORMAT parquet)")
    con.execute(
        f"COPY (SELECT run_hash FROM runs WHERE run_hash = 'r7') TO '{lake}/excluded.parquet' (FORMAT parquet)"
    )

    solo = {
        "r1": (["LEAD_PAPERWEIGHT", "NEOWS_TALISMAN"], ["BASH", "CLEAVE", "ANGER"]),
        "r2": (["LEAD_PAPERWEIGHT", "NEOWS_TALISMAN"], ["BASH", "CLEAVE", "ANGER"]),
        "r3": (["WINGED_BOOTS"], ["FLEX"]),
        "r8": (["POMANDER"], ["ZAP"]),
        "r9": (["NEW_LEAF"], ["DUALCAST"]),
        "r6": (["POMANDER"], ["CLASH"]),
        "r7": (["POMANDER"], ["CLASH"]),
    }
    floors = []
    for rh, (offers, cards) in solo.items():
        floors += [
            _floor(rh, 0, 1, "ancient", "EVENT.NEOW", "event", [_seat(1, offers, [])]),
            _floor(
                rh,
                0,
                2,
                "monster",
                "ENCOUNTER.JAW_WORM",
                "monster",
                [_seat(1, [], cards)],
            ),
            _floor(
                rh, 0, 5, "unknown", "EVENT.BRAIN_LEECH", "event", [_seat(1, [], [])]
            ),
            _floor(
                rh,
                0,
                16,
                "boss",
                "ENCOUNTER.VANTOM_BOSS",
                "boss",
                [_seat(1, [], ["DEMON_FORM"])],
            ),
        ]
    for rh in ("r4", "r5"):
        seats = [
            _seat(1, ["NEW_LEAF"], ["BACKFLIP"]),
            _seat(2, ["MEAL_TICKET"], ["ZAP"]),
        ]
        floors += [
            _floor(rh, 0, 1, "ancient", "EVENT.NEOW", "event", seats),
            _floor(rh, 0, 2, "monster", "ENCOUNTER.JAW_WORM", "monster", seats),
            _floor(rh, 0, 16, "boss", "ENCOUNTER.VANTOM_BOSS", "boss", seats),
        ]
    con.execute(
        "CREATE TABLE floors (run_hash VARCHAR, act BIGINT, floor_idx BIGINT, map_point_type VARCHAR, "
        f"players {PLAYER_TYPE}, room_models VARCHAR[], room_type VARCHAR, room_model VARCHAR, room_turns BIGINT)"
    )
    for f in floors:
        con.execute(
            f"INSERT INTO floors SELECT ?, ?, ?, ?, ?::{PLAYER_TYPE}, ?, ?, ?, ?",
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
        "INSERT INTO relics VALUES ('r1', 1, 'ANCHOR', 4, 'IRONCLAD'), ('r2', 1, 'ANCHOR', 9, 'IRONCLAD'), "
        "('r4', 1, 'MEAL_TICKET', 3, 'SILENT'), ('r4', 2, 'ANCHOR', 3, 'SILENT'), ('r5', 1, 'MEAL_TICKET', 3, 'SILENT'), ('r5', 2, 'ANCHOR', 3, 'SILENT'), "
        "('r9', 1, 'ANCHOR', 2, 'DEFECT')"
    )
    con.execute(f"COPY relics TO '{lake}/relics.parquet' (FORMAT parquet)")
    con.execute(
        "CREATE TABLE deck (run_hash VARCHAR, player_idx BIGINT, character VARCHAR, card VARCHAR, floor_added BIGINT, upgrade_level BIGINT, enchantment VARCHAR)"
    )
    rows = [("r1", 1, "IRONCLAD", "STRIKE", 0)] * 4 + [
        ("r1", 1, "IRONCLAD", "BASH", 2),
        ("r1", 1, "IRONCLAD", "DEMON_FORM", 16),
        ("r2", 1, "IRONCLAD", "STRIKE", 0),
    ]
    rows += [
        ("r4", 1, "SILENT", "BACKFLIP", 2),
        ("r4", 2, "SILENT", "ZAP", 2),
        ("r5", 1, "SILENT", "BACKFLIP", 2),
        ("r5", 2, "SILENT", "ZAP", 2),
    ]
    rows += [
        ("r8", 1, "DEFECT", "ZAP", 2),
        ("r9", 1, "DEFECT", "DUALCAST", 2),
        ("r3", 1, "IRONCLAD", "FLEX", 2),
        ("r6", 1, "REGENT", "CLASH", 2),
        ("r7", 1, "REGENT", "CLASH", 2),
    ]
    for rh, pidx, ch, card, fl in rows:
        con.execute(
            "INSERT INTO deck VALUES (?, ?, ?, ?, ?, 0, NULL)", [rh, pidx, ch, card, fl]
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
        "CREATE TABLE maps (run_hash VARCHAR, s BIGINT, ms BIGINT, floor INTEGER, act INTEGER, nodes STRUCT(coord VARCHAR, kind VARCHAR, children VARCHAR[])[])"
    )
    con.execute(
        "INSERT INTO maps VALUES ('r1', 2, 10, 0, 1, [{'coord':'0,0','kind':'monster','children':['1,0']}])"
    )
    con.execute(f"COPY maps TO '{batch}/maps.parquet' (FORMAT parquet)")
    con.close()
    meta = stage.build()
    return lake, meta


def _names(groups, label=None):
    return [r["seed"] for r in groups["results"]]


def test_stage_keys_seeds_by_version_lobby_and_ordered_party(lake):
    lake_dir, meta = lake
    assert meta["seeds"] == 4 and meta["with_shops"] and meta["with_maps"]
    con = duckdb.connect()
    rows = con.execute(
        f"SELECT seed_key, runs, wins, party FROM read_parquet('{lake_dir}/seed_profiles.parquet') ORDER BY 1"
    ).fetchall()
    assert [r[0] for r in rows] == [
        "AAAA|v0.107.1|1|IRONCLAD",
        "AAAA|v0.111.0|1|IRONCLAD",
        "BBBB|v0.107.1|2|SILENT+SILENT",
        "EEEE|v0.107.1|1|DEFECT",
    ]
    by = {r[0]: r for r in rows}
    assert by["BBBB|v0.107.1|2|SILENT+SILENT"][1:] == (1, 1, ["SILENT", "SILENT"])
    assert by["AAAA|v0.107.1|1|IRONCLAD"][1:3] == (2, 1)
    assert by["EEEE|v0.107.1|1|DEFECT"][1:3] == (2, 1)
    facts = con.execute(
        f"SELECT kind, count(*) FROM read_parquet('{lake_dir}/seed_facts.parquet') GROUP BY 1"
    ).fetchall()
    kinds = dict(facts)
    assert kinds["shop_card"] == 1 and kinds["boss"] == 6
    deck = con.execute(
        f"SELECT n FROM read_parquet('{lake_dir}/seed_facts.parquet') WHERE kind = 'deck' AND id = 'STRIKE' AND seed_key LIKE 'AAAA|v0.107.1%' ORDER BY n DESC"
    ).fetchall()
    assert deck[0][0] == 4


def test_full_match_needs_one_run_that_showed_everything(lake):
    both = svc.search(
        [svc.Predicate("neow", "POMANDER"), svc.Predicate("relic", "ANCHOR")],
        svc.Scope(),
    )
    row = next(r for r in both["results"] if r["seed"] == "EEEE")
    assert row["full_match"] is False and len(row["matched"]) == 1
    one = svc.search(
        [
            svc.Predicate("neow", "LEAD_PAPERWEIGHT"),
            svc.Predicate("relic", "ANCHOR", floor_max=5),
        ],
        svc.Scope(build_id="v0.107.1"),
    )
    top = one["results"][0]
    assert (
        top["seed"] == "AAAA"
        and top["full_match"]
        and top["runs"] == 2
        and top["win_rate"] == 50.0
    )
    assert top["where"]["relic:ANCHOR <=f5"] == [{"act": None, "floor": 4}]
    assert (
        top["best_run"]["run_hash"] == "r1"
        and top["replay"]["url"] == "/runs/r1/replay"
    )
    assert top["neow_offers"] == ["LEAD_PAPERWEIGHT", "NEOWS_TALISMAN"]
    assert top["bosses"] == [{"act": 1, "id": "VANTOM_BOSS"}]


def test_counts_mean_copies_or_screens_in_one_run(lake):
    assert _names(
        svc.search([svc.Predicate("deck", "STRIKE", count=4)], svc.Scope())
    ) == ["AAAA"]
    assert (
        _names(svc.search([svc.Predicate("deck", "STRIKE", count=5)], svc.Scope()))
        == []
    )
    assert (
        _names(svc.search([svc.Predicate("offered", "BASH", count=2)], svc.Scope()))
        == []
    )
    assert _names(
        svc.search(
            [svc.Predicate("offered", "BASH", count=1, act=1, floor_max=3)],
            svc.Scope(build_id="v0.107.1"),
        )
    ) == ["AAAA"]


def test_scope_version_party_lobby_and_seats(lake):
    assert _names(
        svc.search(
            [svc.Predicate("neow", "WINGED_BOOTS")], svc.Scope(build_id="v0.111.0")
        )
    ) == ["AAAA"]
    assert (
        _names(
            svc.search(
                [svc.Predicate("neow", "WINGED_BOOTS")], svc.Scope(build_id="v0.107.1")
            )
        )
        == []
    )
    coop = svc.search(
        [svc.Predicate("neow", "MEAL_TICKET", seat=2)],
        svc.Scope(player_count=2, characters=("SILENT",)),
    )
    assert [r["seed"] for r in coop["results"]] == ["BBBB"] and coop["results"][0][
        "party"
    ] == ["SILENT", "SILENT"]
    assert (
        _names(
            svc.search(
                [svc.Predicate("neow", "MEAL_TICKET", seat=1)],
                svc.Scope(player_count=2),
            )
        )
        == []
    )
    assert (
        _names(
            svc.search(
                [svc.Predicate("neow", "NEW_LEAF")], svc.Scope(characters=("REGENT",))
            )
        )
        == []
    )
    assert _names(
        svc.search([svc.Predicate("neow", "NEW_LEAF")], svc.Scope(win_only=True))
    ) == ["BBBB"]


def test_shops_and_ordering_are_trailing_and_deterministic(lake):
    assert _names(
        svc.search([svc.Predicate("shop_card", "WHIRLWIND")], svc.Scope())
    ) == ["AAAA"]
    assert _names(
        svc.search([svc.Predicate("shop_relic", "MEAL_TICKET")], svc.Scope())
    ) == ["AAAA"]
    out = svc.search([svc.Predicate("boss", "VANTOM_BOSS", act=1)], svc.Scope())
    assert [r["seed"] for r in out["results"]] == ["AAAA", "EEEE", "BBBB", "AAAA"]


def test_predicate_validation():
    with pytest.raises(svc.PredicateError):
        svc.Predicate("neow", "X", count=2)
    with pytest.raises(svc.PredicateError):
        svc.Predicate("offered", "X", act=5)
    with pytest.raises(svc.PredicateError):
        svc.Predicate("relic", "X", floor_min=9, floor_max=3)
    with pytest.raises(svc.PredicateError):
        svc.Predicate("nope", "X")
    assert svc.normalize_seed(" ab-oi1 ") == "AB011"


def test_profile_random_and_meta(lake):
    prof = svc.profile("aaaa")
    assert prof["seed"] == "AAAA" and [v["build_id"] for v in prof["variants"]] == [
        "v0.107.1",
        "v0.111.0",
    ]
    main = prof["variants"][0]
    assert (
        main["shops"][0]["items"][0]["id"] == "WHIRLWIND"
        and main["map_act1"][0]["coord"] == "0,0"
    )
    decks = {f["id"]: f["n"] for f in main["facts"] if f["kind"] == "deck"}
    assert decks["STRIKE"] == 4 and decks["DEMON_FORM"] == 1
    assert {f["id"] for f in main["facts"] if f["kind"] == "card_offer"} == {
        "BASH",
        "CLEAVE",
        "ANGER",
        "DEMON_FORM",
    }
    assert main["run_hashes"] == ["r1", "r2"] and main["path"][0]["path"].startswith(
        "ancient,monster"
    )
    assert svc.profile("AAAA", build_id="v0.111.0")["variants"][0]["neow_offers"] == [
        "WINGED_BOOTS"
    ]
    assert svc.profile("ZZZZ")["variants"] == []
    seen = {svc.random_seed(build_id="v0.107.1")["seed"] for _ in range(12)}
    assert seen <= {"AAAA", "BBBB", "EEEE"}
    assert svc.random_seed(build_id="v9.9.9") is None
    assert svc.available() and svc.meta()["seeds"] == 4 and svc.generation()


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
    assert [p.label() for p in preds] == [
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
    with pytest.raises(svc.PredicateError):
        _seed_predicates("", "BASH!!", "", "", None, None, "", "", "", "", "")
    with pytest.raises(svc.PredicateError):
        _seed_predicates(
            "",
            ",".join(f"C{i}" for i in range(13)),
            "",
            "",
            None,
            None,
            "",
            "",
            "",
            "",
            "",
        )


@pytest.fixture
def api(monkeypatch):
    from fastapi.testclient import TestClient

    from app.dependencies import shared_limiter
    from app.main import app
    from app.services import cache as app_cache

    monkeypatch.setattr(shared_limiter, "enabled", False)
    monkeypatch.setattr(app_cache, "get_json", lambda key: None)
    monkeypatch.setattr(app_cache, "set_json", lambda *a, **k: None)
    return TestClient(app)


def test_routes_serve_the_index(lake, api):
    body = api.get(
        "/api/runs/seed-finder",
        params={"neow": "LEAD_PAPERWEIGHT", "build_id": "v0.107.1"},
    ).json()
    assert (
        body["available"] and body["engine"] == "index" and body["index"]["seeds"] == 4
    )
    assert body["results"][0]["seed"] == "AAAA" and body["results"][0]["full_match"]
    assert api.get("/api/runs/seed-finder").json()["available"] is False
    assert (
        api.get("/api/runs/seed-finder", params={"offered": "BASH:99"}).status_code
        == 422
    )
    assert (
        api.get("/api/runs/seed-finder", params={"offered": "BA SH!"}).status_code
        == 422
    )
    meta = api.get("/api/runs/seed-finder/meta").json()
    assert meta["available"] is True and meta["seeds"] == 4
    prof = api.get("/api/runs/seed-finder/seed/aaoa").json()
    assert prof["available"] and prof["seed"] == "AA0A" and prof["variants"] == []
    prof = api.get(
        "/api/runs/seed-finder/seed/aaaa", params={"build_id": "v0.111.0"}
    ).json()
    assert len(prof["variants"]) == 1
    rnd = api.get(
        "/api/runs/seed-finder/random", params={"build_id": "v0.111.0"}
    ).json()
    assert rnd["available"] and rnd["seed"]["seed"] == "AAAA"
    assert api.get(
        "/api/runs/seed-finder/random", params={"build_id": "v9.9.9"}
    ).json() == {"available": False, "detail": "no_seed"}


def test_routes_never_answer_loosely(lake, api, monkeypatch):
    from app.routers import runs as runs_router

    monkeypatch.setattr(svc, "available", lambda: False)
    monkeypatch.setattr(
        runs_router,
        "_legacy_seed_finder",
        lambda *a, **k: {"results": [{"seed": "LEGACY"}], "engine": "legacy"},
    )
    body = api.get("/api/runs/seed-finder", params={"relics": "ANCHOR"}).json()
    assert body["engine"] == "legacy" and body["results"][0]["seed"] == "LEGACY"
    for params in (
        {"neow": "LEAD_PAPERWEIGHT"},
        {"relics": "ANCHOR<=4"},
        {"relics": "ANCHOR", "build_id": "v0.107.1"},
        {"relics": "ANCHOR", "character": "IRONCLAD,SILENT"},
        {"offered": "BASH@1"},
    ):
        r = api.get("/api/runs/seed-finder", params=params)
        assert r.status_code == 503 and r.json()["detail"] == "index_building", params
    assert api.get("/api/runs/seed-finder/seed/aaaa").status_code == 503
    assert api.get("/api/runs/seed-finder/random").status_code == 503
    monkeypatch.setattr(svc, "available", lambda: True)

    def boom(*a, **k):
        raise RuntimeError("segment")

    monkeypatch.setattr(svc, "search", boom)
    r = api.get("/api/runs/seed-finder", params={"neow": "LEAD_PAPERWEIGHT"})
    assert r.status_code == 503 and r.json()["detail"] == "index_error"
