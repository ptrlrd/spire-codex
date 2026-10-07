"""Per-player stats: a run counts for the account that uploaded it, on
the only seat of a solo run or the co-op seat with the account's Steam id
(the lake guess when no id is linked, never on a tie), and the serve fold
sums the filter slices into the profile grids."""

import sys
from pathlib import Path

import duckdb
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "lab"))

import player_stats as stage  # noqa: E402

from app.dependencies import shared_limiter  # noqa: E402
from app.main import app  # noqa: E402
from app.services import player_stats as svc  # noqa: E402

RUNS = [
    ("r1", "IRONCLAD", True, 0, 1, "a"),
    ("r2", "IRONCLAD", False, 10, 1, "a"),
    ("r3", "SILENT", True, 0, 2, "a"),
    ("r4", "DEFECT", True, 0, 2, "b"),
    ("r5", "DEFECT", False, 0, 2, "b"),
    ("r6", "REGENT", False, 0, 1, "b"),
    ("r7", "IRONCLAD", True, 0, 1, None),
]
SEATS = [
    ("r1", 1, 1, "IRONCLAD"),
    ("r2", 1, 1, "IRONCLAD"),
    ("r3", 1, 200, "DEFECT"),
    ("r3", 2, 100, "SILENT"),
    ("r4", 1, 400, "DEFECT"),
    ("r4", 2, 300, "SILENT"),
    ("r5", 1, 400, "DEFECT"),
    ("r5", 2, 300, "SILENT"),
    ("r6", 1, 1, "REGENT"),
    ("r7", 1, 1, "IRONCLAD"),
]
DECK = [
    ("r1", 1, "STRIKE_IRONCLAD", 0),
    ("r1", 1, "ANGER", 2),
    ("r1", 1, "ANGER", 3),
    ("r2", 1, "ANGER", 1),
    ("r3", 1, "ZAP", 0),
    ("r3", 2, "NEUTRALIZE", 0),
    ("r4", 1, "ZAP", 0),
    ("r6", 1, "VENERATE", 0),
    ("r7", 1, "ANGER", 1),
]


def _player(seat_events, rests, cards):
    ev = ", ".join(
        f"{{'title': {{'key': '{k}', 'table': 'events'}}}}" for k in seat_events
    )
    rs = ", ".join(f"'{r}'" for r in rests)
    cc = ", ".join(
        f"{{'was_picked': {str(p).lower()}, 'card': {{'id': 'CARD.{c}'}}}}"
        for c, p in cards
    )
    return (
        f'{{\'event_choices\': [{ev}]::STRUCT(title STRUCT("key" VARCHAR, "table" VARCHAR))[], '
        f"'rest_site_choices': [{rs}]::VARCHAR[], "
        f"'card_choices': [{cc}]::STRUCT(was_picked BOOLEAN, card STRUCT(id VARCHAR))[]}}"
    )


@pytest.fixture
def lake(tmp_path, monkeypatch):
    con = duckdb.connect()
    w = lambda name, sql: con.execute(  # noqa: E731
        f"COPY ({sql}) TO '{tmp_path}/{name}.parquet' (FORMAT parquet)"
    )
    vals = ", ".join(
        f"('{h}', '{c}', {str(win).lower()}, {a}, {pc}, {repr(u) if u else 'NULL'})"
        for h, c, win, a, pc, u in RUNS
    )
    w(
        "runs",
        f"""SELECT h AS run_hash, c AS character, win, a::BIGINT AS ascension,
          pc::BIGINT AS player_count, 'v0.1' AS build_id, u AS user_id
        FROM (VALUES {vals}) t(h, c, win, a, pc, u)""",
    )
    w("excluded", "SELECT 'none' AS run_hash WHERE false")
    w(
        "players",
        "SELECT * FROM (VALUES "
        + ", ".join(f"('{h}', {i}::BIGINT, {p}::BIGINT, '{c}')" for h, i, p, c in SEATS)
        + ") t(run_hash, player_idx, player_id, character)",
    )
    w(
        "deck",
        "SELECT * FROM (VALUES "
        + ", ".join(f"('{h}', {i}::BIGINT, '{c}', {f}::BIGINT)" for h, i, c, f in DECK)
        + ") t(run_hash, player_idx, card, floor_added)",
    )
    solo = _player(
        ["NEOW.pages.INITIAL.options.GOLD.title"],
        ["SMITH"],
        [("ANGER", True), ("ZAP", False)],
    )
    other = _player([], [], [])
    floor_rows = []
    for h, _c, _w, _a, pc, _u in RUNS:
        for i in range(3):
            seats = [solo] if pc == 1 else [other, solo]
            floor_rows.append(
                f"('{h}', 0::BIGINT, {i}::BIGINT, [{', '.join(seats)}], "
                f"{'[' + repr('shop') + ']' if i == 2 else '[]::VARCHAR[]'})"
            )
    w(
        "floors",
        "SELECT * FROM (VALUES "
        + ", ".join(floor_rows)
        + ") t(run_hash, act, floor_idx, players, room_types)",
    )
    w(
        "relics",
        "SELECT 'r1' AS run_hash, 1::BIGINT AS player_idx, 'ANCHOR' AS relic, 1::BIGINT AS floor_added",
    )
    w(
        "potions",
        "SELECT 'r2' AS run_hash, 1::BIGINT AS player_idx, 'FIRE_POTION' AS potion",
    )
    w(
        "shop_items",
        """SELECT * FROM (VALUES ('r1', 1::BIGINT, 'cards', 'ANGER', true),
          ('r1', 1::BIGINT, 'relics', 'ANCHOR', false))
          t(run_hash, player_idx, entity_type, id, bought)""",
    )
    w(
        "relic_choices",
        """SELECT * FROM (VALUES ('r1', 1::BIGINT, 'ANCHOR', true, false, 3::BIGINT, 1::BIGINT))
          t(run_hash, player_idx, relic, picked, is_shop, n_options, n_picked)""",
    )
    monkeypatch.setattr(stage, "LAKE", tmp_path)
    monkeypatch.setattr(svc, "LAKE_DIR", tmp_path)
    svc._cache.clear()
    return tmp_path


def _build(monkeypatch, steam=()):
    monkeypatch.setattr(stage, "_account_steam_ids", lambda: list(steam))
    return stage.build()


def _ids(rows):
    return {r["id"]: r for r in rows}


def test_solo_and_linked_coop_seats(lake, monkeypatch):
    _build(monkeypatch, [("a", 100)])
    a = svc.get_player_stats("a")
    assert (a["runs"], a["wins"]) == (3, 2)
    cards = _ids(a["tables"]["cards"])
    assert cards["ANGER"]["runs"] == 2 and cards["ANGER"]["wins"] == 1
    assert "NEUTRALIZE" in cards and "ZAP" not in cards
    assert cards["ANGER"]["offered"] == 6 and cards["ANGER"]["taken"] == 6


def test_unlinked_coop_tie_counts_only_solo(lake, monkeypatch):
    _build(monkeypatch)
    b = svc.get_player_stats("b")
    assert (b["runs"], b["wins"]) == (1, 0)
    assert set(_ids(b["tables"]["cards"])) == {"VENERATE"}
    svc._cache.clear()
    _build(monkeypatch, [("b", 400)])
    assert svc.get_player_stats("b")["runs"] == 3


def test_runs_without_an_account_are_skipped(lake, monkeypatch):
    out = _build(monkeypatch, [("a", 100)])
    assert out["users"] == 2


def test_filters_fold_slices(lake, monkeypatch):
    _build(monkeypatch, [("a", 100)])
    ic = svc.get_player_stats("a", character="IRONCLAD")
    assert (ic["runs"], ic["wins"]) == (2, 1)
    a10 = svc.get_player_stats("a", ascension=10)
    assert (a10["runs"], a10["wins"]) == (1, 0)
    assert svc.get_player_stats("a", players=2)["runs"] == 1
    assert svc.get_player_stats("a", version="v9")["runs"] == 0


def test_other_grids(lake, monkeypatch):
    _build(monkeypatch, [("a", 100)])
    t = svc.get_player_stats("a")["tables"]
    ev = t["events"][0]
    assert (ev["event"], ev["option"], ev["chosen"]) == ("NEOW", "GOLD", 9)
    assert t["campfires"][0]["choice"] == "SMITH"
    assert t["campfires"][0]["chosen"] == 9
    shops = {(s["entity_type"], s["id"]): s for s in t["shops"]}
    assert shops[("cards", "ANGER")] == {
        "entity_type": "cards",
        "id": "ANGER",
        "seen": 1,
        "bought": 1,
    }
    relic = _ids(t["relics"])["ANCHOR"]
    assert (relic["offered"], relic["taken"]) == (1, 1)
    assert _ids(t["potions"])["FIRE_POTION"]["runs"] == 1


def test_lift_needs_five_seats():
    rows = [
        ("cards", "X", "", 4, 4, 4, 4, 2.0, 0, 0),
        ("cards", "Y", "", 6, 3, 6, 3, 2.4, 0, 0),
    ]
    out = svc.fold(rows)
    lifts = {r["id"]: r["lift"] for r in out["tables"]["cards"]}
    assert lifts == {"X": None, "Y": 10.0}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://test")
    shared_limiter.reset()
    return TestClient(app)


def _user(monkeypatch, user):
    import app.services.users_db as users_db

    monkeypatch.setattr(users_db, "get_user_by_username", lambda name: user)


def test_endpoint_private_is_404(client, monkeypatch):
    _user(monkeypatch, {"_id": "a", "username": "A", "profile_private": True})
    assert client.get("/api/players/A/stats").status_code == 404


def test_endpoint_without_file(client, monkeypatch, tmp_path):
    monkeypatch.setattr(svc, "LAKE_DIR", tmp_path)
    _user(monkeypatch, {"_id": "a", "username": "A"})
    r = client.get("/api/players/A/stats")
    assert r.status_code == 200 and r.json()["available"] is False


def test_endpoint_serves_and_validates(lake, client, monkeypatch):
    _build(monkeypatch, [("a", 100)])
    _user(monkeypatch, {"_id": "a", "username": "A"})
    r = client.get("/api/players/A/stats?character=ironclad")
    body = r.json()
    assert r.status_code == 200 and body["available"] and body["runs"] == 2
    assert client.get("/api/players/A/stats?players=9").status_code == 400


def test_own_stats_need_sign_in(client, monkeypatch):
    import app.services.auth_jwt as auth_jwt

    monkeypatch.setattr(auth_jwt, "get_current_user", lambda request: None)
    assert client.get("/api/auth/player-stats").status_code == 401


def test_own_stats_serve_a_private_profile_uncached(lake, client, monkeypatch):
    import app.routers.auth as auth_router

    _build(monkeypatch, [("a", 100)])
    owner = {"_id": "a", "username": "A", "profile_private": True}
    monkeypatch.setattr(auth_router, "require_user", lambda request: owner)
    r = client.get("/api/auth/player-stats?character=ironclad")
    body = r.json()
    assert r.status_code == 200 and body["available"] and body["runs"] == 2
    assert r.headers["cache-control"] == "private, no-store"
    assert client.get("/api/auth/player-stats?players=9").status_code == 400
    _user(monkeypatch, owner)
    assert client.get("/api/players/A/stats").status_code == 404
