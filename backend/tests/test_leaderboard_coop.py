"""Leaderboards list a co-op run once, serve every filter from the lake
table before the live query, drop hidden runs on read, and rank a run on
its own board."""

import pathlib

import pytest
from pymongo.errors import ExecutionTimeout

from app.services import cache as app_cache
from app.services import lake_stats, runs_db_mongo


def _matches(doc, q):
    for k, v in q.items():
        if k == "$or":
            if not any(_matches(doc, branch) for branch in v):
                return False
            continue
        val = doc.get(k)
        if isinstance(v, dict):
            if "$in" in v and val not in v["$in"]:
                return False
            if "$ne" in v and val == v["$ne"]:
                return False
            for op, test in (
                ("$gt", lambda a, b: a > b),
                ("$gte", lambda a, b: a >= b),
                ("$lt", lambda a, b: a < b),
                ("$lte", lambda a, b: a <= b),
            ):
                if op in v and (val is None or not test(val, v[op])):
                    return False
        elif val != v:
            return False
    return True


class Cursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, spec):
        for field, direction in reversed(spec):
            self.docs.sort(key=lambda d: d.get(field) or 0, reverse=direction < 0)
        return self

    def skip(self, n):
        self.docs = self.docs[n:]
        return self

    def limit(self, n):
        self.docs = self.docs[:n]
        return self

    def __iter__(self):
        return iter(self.docs)


class Coll:
    name = "runs"

    def __init__(self, docs, slow_group=False):
        self.docs = docs
        self.slow_group = slow_group
        self.finds = []
        self.counts = []

    def find(self, q, projection=None):
        self.finds.append(q)
        return Cursor([dict(d) for d in self.docs if _matches(d, q)])

    def find_one(self, q, projection=None):
        return next((dict(d) for d in self.docs if _matches(d, q)), None)

    def count_documents(self, q, **kwargs):
        self.counts.append(q)
        return sum(1 for d in self.docs if _matches(d, q))

    def aggregate(self, pipeline, **kwargs):
        if self.slow_group:
            raise ExecutionTimeout("timed out")
        fields = pipeline[1]["$group"]["_id"]
        keys = {
            tuple(d.get(f) for f in fields)
            for d in self.docs
            if _matches(d, pipeline[0]["$match"])
        }
        return iter([{"n": len(keys)}] if keys else [])


def _seat(run_hash, character, run_time, seed, size, username=None, **extra):
    return {
        "_id": run_hash,
        "character": character,
        "win": True,
        "ascension": 10,
        "game_mode": "standard",
        "run_time": run_time,
        "seed": seed,
        "played_at": f"start-{seed}",
        "player_count": size,
        "username": username,
        **extra,
    }


DOCS = [
    _seat("s1", "IRONCLAD", 500, "A", 1, "solo"),
    _seat("t1", "IRONCLAD", 600, "T", 3),
    _seat("t2", "SILENT", 600, "T", 3, "named"),
    _seat("t3", "DEFECT", 600, "T", 3),
    _seat("d1", "REGENT", 700, "D", 2, "duo"),
    _seat("d2", "SILENT", 700, "D", 2),
    _seat("x1", "SILENT", 100, "X", 2, "cheat", hidden=True),
]


@pytest.fixture
def live(monkeypatch):
    store = {}
    monkeypatch.setattr(app_cache, "get_json", lambda k: store.get(k))
    monkeypatch.setattr(
        app_cache, "set_json", lambda k, v, ttl_seconds=None: store.__setitem__(k, v)
    )
    coll = Coll(DOCS)
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    return coll


def test_live_ladder_lists_a_coop_run_once(live):
    out = runs_db_mongo._leaderboard_live()
    assert [r["run_hash"] for r in out["runs"]] == ["s1", "t2", "d1"]
    assert out["total"] == 3 and out["total_is_lower_bound"] is False
    assert "party" not in out["runs"][0]
    assert out["runs"][1]["party"] == [
        {"run_hash": "t1", "character": "IRONCLAD", "username": None},
        {"run_hash": "t2", "character": "SILENT", "username": "named"},
        {"run_hash": "t3", "character": "DEFECT", "username": None},
    ]
    assert "seed" not in out["runs"][1] and "played_at" not in out["runs"][1]
    assert out["runs"][1]["player_count"] == 3


def test_live_coop_pages_and_party_size_filters(live):
    page2 = runs_db_mongo._leaderboard_live(players="multi", page=2, limit=1)
    assert [r["run_hash"] for r in page2["runs"]] == ["d1"]
    assert page2["total"] == 2 and page2["total_pages"] == 2
    trio = runs_db_mongo._leaderboard_live(players="3")
    assert [r["run_hash"] for r in trio["runs"]] == ["t2"] and trio["total"] == 1
    silent = runs_db_mongo._leaderboard_live(character="SILENT", players="multi")
    assert [r["run_hash"] for r in silent["runs"]] == ["t2", "d2"]
    assert len(silent["runs"][1]["party"]) == 2


def test_live_solo_ladder_is_untouched(live):
    out = runs_db_mongo._leaderboard_live(players="1")
    assert out["total"] == 1 and out["total_is_lower_bound"] is False


def test_live_coop_total_is_a_flagged_lower_bound_when_grouping_times_out(
    live, monkeypatch
):
    live.slow_group = True
    out = runs_db_mongo._leaderboard_live(players="3")
    assert out["total"] == 1 and out["total_is_lower_bound"] is True


class Summary:
    def __init__(self, docs=None):
        self.docs = docs or {}
        self.written = {}

    def find_one(self, q):
        return self.docs.get(q["_id"])

    def replace_one(self, q, doc, upsert=False):
        self.written[q["_id"]] = doc


def _no_live(**kw):
    raise AssertionError("live query reached")


def test_filtered_ladders_are_lake_slices_not_live_queries(live, monkeypatch):
    asked = []

    def fake_slice(**kw):
        asked.append(kw)
        return {"runs": [{"run_hash": "s1"}], "total": 1}

    monkeypatch.setattr(runs_db_mongo, "_leaderboard_summary_coll", lambda: Summary())
    monkeypatch.setattr(lake_stats, "leaderboard_slice", fake_slice)
    monkeypatch.setattr(runs_db_mongo, "_leaderboard_live", _no_live)
    for kw in (
        {"ascension_min": 10, "players": "1", "game_mode": "standard"},
        {"ascension_min": 10, "winrate_min": 50.0},
        {"build_id": "v0.111.0", "category": "highest_ascension"},
        {"game_mode": "daily", "players": "4", "page": 70, "limit": 20},
        {"game_mode": "custom", "character": "REGENT"},
        {},
    ):
        assert runs_db_mongo.leaderboard(**kw)["total"] == 1
    assert asked[0]["ascension_min"] == 10 and asked[0]["exclude"] == []
    assert asked[3]["page"] == 70


def test_todays_daily_board_stays_live(live, monkeypatch):
    monkeypatch.setattr(lake_stats, "leaderboard_slice", _no_live)
    monkeypatch.setattr(
        runs_db_mongo, "_leaderboard_live", lambda **kw: {"live": kw["today"]}
    )
    assert runs_db_mongo.leaderboard(game_mode="daily", today=True) == {"live": True}


def test_no_table_falls_back_to_live(live, monkeypatch):
    monkeypatch.setattr(runs_db_mongo, "_leaderboard_summary_coll", lambda: Summary())
    monkeypatch.setattr(lake_stats, "leaderboard_slice", lambda **kw: None)
    out = runs_db_mongo.leaderboard(ascension_min=10)
    assert [r["run_hash"] for r in out["runs"]] == ["s1", "t2", "d1"]


def test_hidden_run_leaves_a_stored_board_on_the_next_read(live, monkeypatch):
    key = runs_db_mongo._leaderboard_key(players="2", game_mode="standard")
    stored = {
        "_id": key,
        "runs": [
            {"run_hash": "x1", "player_count": 2},
            {"run_hash": "d1", "player_count": 2},
        ],
        "total": 2,
        "category": "fastest",
    }
    calls = []

    def fake_slice(**kw):
        calls.append(list(kw["exclude"]))
        runs = [r for r in stored["runs"] if r["run_hash"] not in kw["exclude"]]
        return {"runs": runs, "total": len(runs)}

    monkeypatch.setattr(
        runs_db_mongo, "_leaderboard_summary_coll", lambda: Summary({key: stored})
    )
    monkeypatch.setattr(lake_stats, "leaderboard_slice", fake_slice)
    monkeypatch.setattr(runs_db_mongo, "_leaderboard_live", _no_live)
    out = runs_db_mongo.leaderboard(players="2", game_mode="standard")
    assert [r["run_hash"] for r in out["runs"]] == ["d1"] and out["total"] == 1
    assert calls == [[], ["x1"]]

    clean = {**stored, "runs": stored["runs"][1:], "total": 1}
    monkeypatch.setattr(
        runs_db_mongo, "_leaderboard_summary_coll", lambda: Summary({key: clean})
    )
    monkeypatch.setattr(lake_stats, "leaderboard_slice", _no_live)
    out = runs_db_mongo.leaderboard(players="2", game_mode="standard")
    assert [r["run_hash"] for r in out["runs"]] == ["d1"]


def test_a_hidden_party_seat_takes_the_run_off_the_board(live):
    rows = [{"run_hash": "d1", "party": [{"run_hash": "d1"}, {"run_hash": "x1"}]}]
    assert runs_db_mongo._gone_board_hashes(rows) == ["x1"]
    assert runs_db_mongo._gone_board_hashes([{"run_hash": "never-stored"}]) == [
        "never-stored"
    ]
    assert runs_db_mongo._gone_board_hashes([{"run_hash": "s1"}]) == []


def test_ingest_refresh_fails_loudly_and_serving_refresh_falls_back(live, monkeypatch):
    seen = []

    def boards(build=True):
        seen.append(build)
        raise RuntimeError("lake unavailable")

    summary = Summary()
    monkeypatch.setattr(lake_stats, "leaderboard_boards", boards)
    monkeypatch.setattr(runs_db_mongo, "_leaderboard_summary_coll", lambda: summary)
    with pytest.raises(RuntimeError):
        runs_db_mongo.refresh_leaderboard_summary(build=True)
    assert summary.written == {}
    written = runs_db_mongo.refresh_leaderboard_summary()
    assert seen == [True, False]
    assert written == len(runs_db_mongo.HOT_LEADERBOARD_COMBOS) == len(summary.written)


def test_serving_refresh_keeps_boards_newer_than_its_table(live, monkeypatch):
    from datetime import datetime, timedelta, timezone

    from app.services import cache as app_cache

    keys = [
        runs_db_mongo._leaderboard_key(
            category=c.get("category", "fastest"),
            character=c.get("character"),
            players=c.get("players"),
            game_mode=c.get("game_mode"),
        )
        for c in runs_db_mongo.HOT_LEADERBOARD_COMBOS
    ]
    table_at = datetime(2026, 11, 9, 12, 0, tzinfo=timezone.utc)
    fresh, stale = keys[0], keys[1]

    class Stamped(Summary):
        def find(self, q, proj=None):
            return [
                {"_id": fresh, "updated_at": datetime(2026, 11, 10, 0, 1)},
                {"_id": stale, "updated_at": table_at - timedelta(hours=1)},
            ]

    cut = {"runs": [], "total": 0}
    monkeypatch.setattr(
        lake_stats, "leaderboard_boards", lambda build=True: {k: cut for k in keys}
    )
    monkeypatch.setattr(lake_stats, "leaderboard_table_time", lambda: table_at)
    monkeypatch.setattr(runs_db_mongo, "_leaderboard_live", _no_live)
    monkeypatch.setattr(app_cache, "set_json", lambda *a, **k: None)
    summary = Stamped()
    monkeypatch.setattr(runs_db_mongo, "_leaderboard_summary_coll", lambda: summary)
    written = runs_db_mongo.refresh_leaderboard_summary()
    assert fresh not in summary.written and stale in summary.written
    assert written == len(keys) - 1

    summary = Stamped()
    monkeypatch.setattr(runs_db_mongo, "_leaderboard_summary_coll", lambda: summary)
    assert runs_db_mongo.refresh_leaderboard_summary(build=True) == len(keys)
    assert fresh in summary.written


def test_rank_pool_is_the_runs_own_board(live, monkeypatch):
    monkeypatch.setattr(lake_stats, "leaderboard_rank", lambda h, c: None)
    live.docs = DOCS + [
        _seat("fast_daily", "REGENT", 10, "Q", 2, game_mode="daily"),
        _seat("fast_solo", "REGENT", 10, "R", 1),
        _seat("fast_modded", "REGENT", 10, "S", 2, ascension=15),
        _seat("fast_quad", "REGENT", 10, "U", 4),
    ]
    assert runs_db_mongo.get_run_rank("d1") == {"rank": 1, "category": "fastest"}
    assert runs_db_mongo.get_run_rank("d1", "highest_ascension")["rank"] == 1
    scoped = [q for q in live.counts if "hidden" not in q]
    assert all(q["player_count"] == 2 and q["game_mode"] == "standard" for q in scoped)
    assert scoped[0]["ascension"] == {"$gte": 0, "$lte": 10}
    live.docs = live.docs + [_seat("faster_duo", "REGENT", 20, "V", 2)]
    assert runs_db_mongo.get_run_rank("d1")["rank"] == 2
    assert runs_db_mongo.get_run_rank("fast_modded") == {"rank": None}
    assert runs_db_mongo.get_run_rank("x1") == {"rank": None}
    assert runs_db_mongo.get_run_rank("fast_quad")["rank"] == 1


def test_rank_reads_the_lake_table_when_it_holds_the_run(live, monkeypatch):
    monkeypatch.setattr(lake_stats, "leaderboard_rank", lambda h, c: 41)
    assert runs_db_mongo.get_run_rank("d1") == {"rank": 41, "category": "fastest"}
    assert live.counts == []


def test_cheap_stages_run_before_the_long_ones():
    src = (
        pathlib.Path(__file__).resolve().parents[2] / "lab" / "ingest.py"
    ).read_text()
    order = [
        src.index(f'"{name}",')
        for name in (
            "leaderboard_summary",
            "community_payload",
            "deep_tables",
            "stats_core",
        )
    ]
    assert order == sorted(order)
    assert src.index('"stats_core",') < src.index('_stage("charts_blob"')
    assert '_stage(\n        "stats_core",' in src
    assert '_stage(\n        "leaderboard_summary",' in src
