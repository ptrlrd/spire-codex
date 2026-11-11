"""The moderator review queue: ranking, co-op seats sharing a row, verdicts
that stick, hides that only undo what the tool hid, the old-cutoff unhide,
and a moderated run coming back hidden when its file is uploaded again."""

from datetime import datetime, timezone

import pytest
from fastapi import Request
from fastapi.testclient import TestClient

from app.main import app
from app.services import auth_jwt, cheat_detect, cheat_review, runs_db_mongo

client = TestClient(app, raise_server_exceptions=False)
ADMIN = {"_id": "a" * 24, "username": "Admin"}
NOW = datetime(2026, 11, 1, tzinfo=timezone.utc)


def _match(doc, flt):
    for key, want in flt.items():
        if key == "$or":
            if not any(_match(doc, alt) for alt in want):
                return False
            continue
        have = doc.get(key)
        if isinstance(want, dict):
            if "$in" in want and have not in want["$in"]:
                return False
            if "$ne" in want and have == want["$ne"]:
                return False
            if "$gt" in want and not (have is not None and have > want["$gt"]):
                return False
            if "$gte" in want and not (have is not None and have >= want["$gte"]):
                return False
            if "$lt" in want and not (have is not None and have < want["$lt"]):
                return False
        elif have != want:
            return False
    return True


class Cursor:
    def __init__(self, coll, docs):
        self.coll = coll
        self.docs = docs

    def sort(self, key, direction=1):
        self.docs = sorted(self.docs, key=lambda d: d.get(key) or 0)
        return self

    def limit(self, n):
        self.docs = self.docs[:n]
        return self

    def hint(self, hint):
        self.coll.hints.append(hint)
        return self

    def max_time_ms(self, ms):
        self.coll.time_limits.append(ms)
        return self

    def __iter__(self):
        return iter([dict(d) for d in self.docs])


class Coll:
    def __init__(self, docs):
        self.docs = {d["_id"]: dict(d) for d in docs}
        self.hints: list = []
        self.time_limits: list[int] = []
        self.finds = 0

    def find(self, flt, projection=None):
        self.finds += 1
        return Cursor(self, [d for d in self.docs.values() if _match(d, flt)])

    def find_one(self, flt, projection=None):
        return next((dict(d) for d in self.docs.values() if _match(d, flt)), None)

    def update_many(self, flt, update):
        n = 0
        for d in self.docs.values():
            if _match(d, flt):
                d.update(update.get("$set", {}))
                for key in update.get("$unset", {}):
                    d.pop(key, None)
                n += 1
        return type("R", (), {"matched_count": n, "modified_count": n})()


def _win(_id, run_time, **extra):
    return {
        "_id": _id,
        "win": True,
        "seed": f"SEED{_id}",
        "character": "SILENT",
        "ascension": 10,
        "game_mode": "standard",
        "player_count": 1,
        "run_time": run_time,
        "floors_reached": 49,
        "username": f"p{_id}",
        "username_lower": f"p{_id}",
        "user_id": f"uid-{_id}",
        "submitted_at": NOW,
        **extra,
    }


@pytest.fixture
def store(monkeypatch):
    def wire(docs):
        coll = Coll(docs)
        bumps: list[tuple[str, int]] = []
        evicted: list[str] = []
        monkeypatch.setattr(cheat_review, "_coll", lambda: coll)
        monkeypatch.setattr(cheat_review, "_characters", lambda: {"SILENT": "Silent"})
        monkeypatch.setattr(
            runs_db_mongo, "get_user_winrates", lambda: {"pfast": [2, 2]}
        )
        monkeypatch.setattr(
            runs_db_mongo,
            "bump_stats_counters",
            lambda row, delta=1: bumps.append((row["_id"], delta)),
        )
        monkeypatch.setattr(runs_db_mongo, "evict_run_pages", evicted.extend)
        dropped: list[str] = []
        monkeypatch.setattr(
            runs_db_mongo,
            "drop_moderation_tombstones",
            lambda hashes: dropped.extend(hashes) or len(hashes),
        )
        coll.dropped = dropped
        coll.bumps = bumps
        coll.evicted = evicted
        return coll

    return wire


def test_queue_puts_the_most_suspicious_win_first(store):
    store(
        [
            _win("fast", 400),
            _win("slow", 1700),
            _win("mid", 1000),
            _win("loss", 200, win=False),
            _win("gone", 350, hidden=True),
            _win("deleted", 360, deleted_at=NOW),
        ]
    )
    out = cheat_review.review_queue()
    assert [r["id"] for r in out["rows"]] == ["fast", "mid", "slow"]
    top = out["rows"][0]
    assert top["board"] == {"label": "Silent solo", "rank": 1}
    assert top["seats"][0]["runs"] == 2 and top["seats"][0]["wins"] == 2
    assert top["seconds_per_floor"] == 8.2
    assert "uploader has 2 runs" in top["flags"]
    assert out["auto_hide_seconds"] == 300 and out["errors"] == []


def test_every_queue_query_is_hinted_and_time_limited(store):
    coll = store([_win("fast", 400)])
    cheat_review.review_queue()
    assert coll.finds == len(coll.time_limits)
    assert len(coll.hints) == coll.finds - 1
    assert all(0 < ms <= 10_000 for ms in coll.time_limits)


def test_a_failed_query_is_reported_not_raised(store, monkeypatch):
    store([_win("fast", 400)])

    def boom(*a, **k):
        raise RuntimeError("timeout")

    monkeypatch.setattr(cheat_review, "_fastest", boom)
    out = cheat_review.review_queue()
    assert out["rows"] == [] and len(out["errors"]) == 5


def test_cleared_run_never_comes_back_but_keeps_its_rank(store):
    coll = store([_win("legit", 500), _win("next", 700)])
    assert cheat_review.set_cleared(["legit"], True, "admin")["matched"] == 1
    assert coll.docs["legit"]["review_cleared_by"] == "admin"
    out = cheat_review.review_queue()
    assert [r["id"] for r in out["rows"]] == ["next"]
    assert out["rows"][0]["board"]["rank"] == 2
    cheat_review.set_cleared(["legit"], False, None)
    assert [r["id"] for r in cheat_review.review_queue()["rows"]] == ["legit", "next"]


def test_coop_seats_share_one_row_and_one_verdict(store):
    seats = [
        _win(f"seat{i}", 600, seed="COOP", player_count=2, character=c)
        for i, c in enumerate(("SILENT", "DEFECT"))
    ]
    coll = store(seats)
    rows = cheat_review.review_queue()["rows"]
    assert len(rows) == 1 and rows[0]["hashes"] == ["seat0", "seat1"]
    assert rows[0]["board"] == {"label": "co-op 2p", "rank": 1}
    out = cheat_review.hide_runs(["seat0"], "edited save")
    assert sorted(out["hashes"]) == ["seat0", "seat1"]
    assert coll.docs["seat1"]["hidden_reason"] == "mod:edited save"
    assert sorted(coll.bumps) == [("seat0", -1), ("seat1", -1)]
    assert cheat_review.review_queue()["rows"] == []


def test_undo_only_gives_back_what_the_tool_hid(store):
    coll = store(
        [
            _win("mine", 400),
            _win("auto", 100, hidden=True, hidden_reason="auto:impossible_time:100s"),
            _win("own", 900, hidden=True, hidden_reason="owner"),
        ]
    )
    cheat_review.hide_runs(["mine"], None)
    assert coll.docs["mine"]["hidden_reason"] == "mod:cheated"
    out = cheat_review.unhide_runs(["mine", "auto", "own"])
    assert out["hashes"] == ["mine"]
    assert "hidden" not in coll.docs["mine"]
    assert coll.docs["auto"]["hidden"] and coll.docs["own"]["hidden"]
    assert coll.bumps == [("mine", -1), ("mine", 1)]
    assert coll.dropped == ["mine"]


def test_hide_player_takes_every_run_and_undoes_exactly_those(store):
    coll = store(
        [
            _win("a", 400, user_id="cheater"),
            _win("b", 2400, user_id="cheater", win=False),
            _win("c", 500, user_id="cheater", hidden=True, hidden_reason="owner"),
            _win("d", 450, user_id="someone-else"),
            _win(
                "e",
                100,
                user_id="cheater",
                hidden=True,
                hidden_reason="auto:impossible_time:100s",
            ),
        ]
    )
    out = cheat_review.set_player_hidden("a", True, "speedhack")
    assert out["changed"] == 3 and out["matched_on"] == "account"
    assert coll.docs["a"]["hidden_reason"] == "mod:player: speedhack"
    assert coll.docs["b"]["hidden"] and "hidden" not in coll.docs["d"]
    assert coll.docs["c"]["hidden_reason"] == "mod:player: speedhack"
    assert coll.docs["e"]["hidden_reason"] == "auto:impossible_time:100s"
    assert coll.bumps == [("a", -1), ("b", -1)]
    assert "c" in coll.evicted
    undo = cheat_review.set_player_hidden("a", False, "speedhack")
    assert undo["changed"] == 3
    assert "hidden" not in coll.docs["a"] and "hidden" not in coll.docs["b"]
    assert coll.docs["c"]["hidden"] and coll.docs["c"]["hidden_reason"] == "owner"
    assert "hidden_before" not in coll.docs["c"]
    assert coll.bumps == [("a", -1), ("b", -1), ("a", 1), ("b", 1)]
    assert sorted(coll.dropped) == ["a", "b"]


def test_owner_cannot_unhide_a_run_taken_by_hide_player(store, monkeypatch):
    from app.services import replays_db

    coll = store(
        [_win("c", 500, user_id="cheater", hidden=True, hidden_reason="owner")]
    )
    cheat_review.set_player_hidden("c", True, None)
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    monkeypatch.setattr(replays_db, "owns_run", lambda run, user: True)
    out = runs_db_mongo.set_run_hidden_by_owner("c", {"_id": "cheater"}, False)
    assert out == {"error": "This run was hidden by a moderator"}
    assert runs_db_mongo._is_moderator_hidden(coll.docs["c"])


def test_hide_player_needs_a_player(store):
    store([_win("anon", 400, user_id=None, username=None, username_lower=None)])
    assert cheat_review.set_player_hidden("anon", True, None) == {
        "error": "This run has no player attached"
    }
    assert cheat_review.set_player_hidden("nope", True, None) == {
        "error": "Run not found"
    }


def test_detector_reasons_outrank_everything_else(store):
    act = [{"rooms": [{"room_type": "monster", "turns_taken": 4}]}] * 15
    boss = [{"rooms": [{"room_type": "boss", "turns_taken": 6}]}]
    full = [act + boss] * 3
    teleport = [act + boss, boss, act + boss]
    store(
        [
            _win("quick", 420, map_point_history=full),
            _win("teleport", 1500, map_point_history=teleport, floors_reached=33),
        ]
    )
    rows = cheat_review.review_queue()["rows"]
    assert [r["id"] for r in rows] == ["teleport", "quick"]
    assert rows[0]["detector"] == ["boss_teleport:act2:1floors"]
    assert rows[1]["boss_turns"] == [6, 6, 6] and rows[1]["detector"] == []


def test_score_reads_each_signal():
    score, flags = cheat_review.score_row(
        {
            "run_time": 400,
            "floors": 30,
            "seconds_per_floor": 13.3,
            "game_mode": "standard",
            "board": {"label": "Silent solo", "rank": 2},
            "boss_turns": [2, 5],
            "seats": [{"player_key": None, "runs": None}],
            "player_rows": 0,
        }
    )
    assert score == 22 + 40 + 8 + 25 + 20 + 10
    assert flags == [
        "#2 Silent solo",
        "win in 6m40s",
        "13.3s per floor",
        "only 30 floors",
        "boss down in 2 turns",
        "anonymous upload",
    ]


def test_old_cutoff_unhide_only_takes_time_only_auto_hides(monkeypatch):
    docs = [
        _win("back", 600, hidden=True, hidden_reason="auto:impossible_time:600s"),
        _win(
            "both",
            640,
            hidden=True,
            hidden_reason="auto:impossible_time:640s,impossible_pace:640s/49fl",
        ),
        _win("tooquick", 200, hidden=True, hidden_reason="auto:impossible_time:200s"),
        _win("mod", 600, hidden=True, hidden_reason="mod:cheated"),
        _win("bare", 600, hidden=True),
        _win("owner", 600, hidden=True, hidden_reason="owner"),
        _win(
            "mixed",
            600,
            hidden=True,
            hidden_reason="auto:impossible_time:600s,missing_acts:1of3bosses",
        ),
        _win(
            "pace",
            400,
            hidden=True,
            hidden_reason="auto:impossible_time:400s",
            floors_reached=70,
        ),
        _win("visible", 600),
    ]
    coll = Coll(docs)
    unhidden: list[str] = []
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    monkeypatch.setattr(
        runs_db_mongo, "set_run_hidden", lambda h, hidden: unhidden.append(h)
    )
    dry = runs_db_mongo.unhide_relaxed_time_runs()
    assert unhidden == []
    assert dry["candidates"] == 7 and dry["other_reason"] == 4
    assert dry["still_flagged"] == 1 and dry["unhidden"] == 2
    assert sorted(dry["hashes"]) == ["back", "both"]
    runs_db_mongo.unhide_relaxed_time_runs(apply=True)
    assert sorted(unhidden) == ["back", "both"]


def test_coop_card_backfill_reads_the_stored_deck(monkeypatch):
    from app.services import run_entity_stats

    coll = Coll(
        [
            _win("solo", 2000, deck=[{"id": "MIDNIGHT"}, {"id": "STRIKE"}]),
            _win("clean", 2000, deck=[{"id": "STRIKE"}]),
        ]
    )
    real = coll.find
    coll.find = lambda flt, projection=None: real(
        {k: v for k, v in flt.items() if k != "deck.id"}
    )
    hidden: list[tuple[str, str]] = []
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    monkeypatch.setattr(
        run_entity_stats, "_multiplayer_card_ids", lambda: frozenset({"MIDNIGHT"})
    )
    monkeypatch.setattr(
        runs_db_mongo,
        "set_run_hidden",
        lambda h, state, reason=None: hidden.append((h, reason)),
    )
    out = runs_db_mongo.rehide_coop_card_solo_runs()
    assert out["hashes"] == ["solo"]
    assert hidden == [("solo", "auto:coop_card_solo:MIDNIGHT")]


class InsertOnly:
    def __init__(self):
        self.docs: dict[str, dict] = {}

    def insert_one(self, doc):
        self.docs[doc["_id"]] = dict(doc)


def _blob(run_time=2000):
    return {
        "seed": "ABC",
        "start_time": 1756684800,
        "run_time": run_time,
        "win": True,
        "acts": [1, 2, 3],
        "map_point_history": [[{"player_stats": []}] * 17] * 3,
        "players": [{"character": "CHARACTER.SILENT", "deck": [], "relics": []}],
    }


@pytest.fixture
def uploads(monkeypatch, tmp_path):
    coll = InsertOnly()
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    monkeypatch.setattr(runs_db_mongo, "_data_dir", tmp_path)
    monkeypatch.setattr(runs_db_mongo, "save_run_blob", lambda *a, **k: None)
    monkeypatch.setattr(runs_db_mongo, "bump_stats_counters", lambda doc: None)
    monkeypatch.setattr(cheat_detect, "detect_cheats", lambda data: [])
    return coll


def test_reupload_of_a_moderated_run_comes_in_hidden(uploads, monkeypatch):
    monkeypatch.setattr(runs_db_mongo, "moderation_tombstone", lambda h: None)
    first = runs_db_mongo.submit_run(_blob())
    assert "hidden" not in uploads.docs[first["run_hash"]]
    uploads.docs.clear()
    monkeypatch.setattr(
        runs_db_mongo,
        "moderation_tombstone",
        lambda h: "mod:edited" if h == first["run_hash"] else None,
    )
    again = runs_db_mongo.submit_run(_blob())
    doc = uploads.docs[again["run_hash"]]
    assert again["run_hash"] == first["run_hash"]
    assert doc["hidden"] is True and doc["hidden_reason"] == "mod:edited"


def test_submit_feeds_the_floor_count_to_the_pace_rule(uploads, monkeypatch):
    monkeypatch.setattr(runs_db_mongo, "moderation_tombstone", lambda h: None)
    seen: list[dict] = []
    monkeypatch.setattr(
        cheat_detect, "detect_cheats", lambda data: seen.append(data) or []
    )
    runs_db_mongo.submit_run(_blob())
    assert seen[0]["floors_reached"] == 51


@pytest.fixture
def admin(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://test")

    def as_admin(request: Request):
        request.state.admin_user = ADMIN
        return ADMIN

    app.dependency_overrides[auth_jwt.require_admin] = as_admin
    from app.routers import runs as runs_router

    monkeypatch.setattr(
        runs_router,
        "_load_run_blob_cached",
        type("C", (), {"cache_clear": staticmethod(lambda: None)}),
    )
    yield
    app.dependency_overrides.pop(auth_jwt.require_admin, None)


def test_endpoints_need_an_admin():
    assert client.get("/api/admin/cheat-review/queue").status_code in (401, 403, 404)
    r = client.post("/api/admin/cheat-review/hide", json={"run_hashes": ["a"]})
    assert r.status_code in (401, 403, 404)


def test_endpoints_drive_the_service(admin, store):
    coll = store([_win("fast", 400), _win("other", 700)])
    r = client.get("/api/admin/cheat-review/queue?limit=1")
    assert r.status_code == 200
    assert [row["id"] for row in r.json()["rows"]] == ["fast"]
    assert r.json()["total"] == 2

    r = client.post(
        "/api/admin/cheat-review/hide",
        json={"run_hashes": ["fast", "fast "], "reason": "  edited   save "},
    )
    assert r.json() == {"hidden": 1, "hashes": ["fast"]}
    assert coll.docs["fast"]["hidden_reason"] == "mod:edited save"
    r = client.post(
        "/api/admin/cheat-review/hide", json={"run_hashes": ["fast"], "hidden": False}
    )
    assert r.json() == {"unhidden": 1, "hashes": ["fast"]}

    r = client.post("/api/admin/cheat-review/clear", json={"run_hashes": ["other"]})
    assert r.json()["matched"] == 1
    assert coll.docs["other"]["review_cleared_by"] == ADMIN["_id"]

    r = client.post("/api/admin/cheat-review/hide-player", json={"run_hash": "fast"})
    assert r.json()["changed"] == 1 and r.json()["reason"] == "mod:player: cheated"
    r = client.post("/api/admin/cheat-review/hide-player", json={"run_hash": "zzz"})
    assert r.status_code == 404


def test_batches_are_bounded(admin, store):
    store([])
    url = "/api/admin/cheat-review/hide"
    assert client.post(url, json={"run_hashes": []}).status_code == 422
    assert client.post(url, json={"run_hashes": ["x"] * 201}).status_code == 422
