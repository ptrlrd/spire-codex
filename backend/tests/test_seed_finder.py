"""Seed finder: predicate matching over run docs and blobs, counted ids,
unknown ids, runs that match nothing are dropped, scanned counts only what
was checked, and the unavailable reasons reach the route."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import shared_limiter
from app.services import data_service, runs_db_mongo, seed_finder

client = TestClient(app)


class Cursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, *_):
        return self

    def limit(self, n):
        self.docs = self.docs[:n]
        return self

    def __iter__(self):
        return iter(self.docs)


class Coll:
    def __init__(self, docs):
        self.docs = docs
        self.queries = []

    def find(self, query, projection=None):
        self.queries.append(query)
        if "_id" in query:
            wanted = set(query["_id"]["$in"])
            return Cursor([d for d in self.docs if d["_id"] in wanted])
        return Cursor(list(self.docs))


def _doc(h, seed=None, deck=(), relics=(), offers=(), **over):
    d = {
        "_id": h,
        "seed": "SEED" + h if seed is None else seed,
        "character": "IRONCLAD",
        "ascension": 5,
        "win": True,
        "submitted_at": "2026-09-01T00:00:00",
        "player_count": 1,
        "deck": [{"id": c} for c in deck],
        "relics": [{"id": r} for r in relics],
        "card_choices": [{"card_id": c} for c in offers],
    }
    d.update(over)
    return d


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://test")
    monkeypatch.setattr(
        data_service,
        "load_cards",
        lambda lang: [{"id": "BASH"}, {"id": "ANGER"}, {"id": "WHIRLWIND"}],
    )
    monkeypatch.setattr(
        data_service, "load_relics", lambda lang: [{"id": "AKABEKO"}, {"id": "ANCHOR"}]
    )
    monkeypatch.setattr(data_service, "load_events", lambda lang: [{"id": "BIG_FISH"}])
    docs = [
        _doc(
            "h1",
            deck=("BASH", "BASH", "ANGER"),
            relics=("AKABEKO",),
            offers=("WHIRLWIND",),
        ),
        _doc("h2", deck=("BASH",), relics=("ANCHOR",), offers=()),
        _doc(
            "h3",
            deck=("ANGER",),
            relics=(),
            offers=("WHIRLWIND", "WHIRLWIND"),
            win=False,
        ),
        _doc("h4", seed="", deck=("BASH",)),
        _doc("h5", deck=("BASH",), hidden=True),
        _doc("h6", deck=("BASH",), player_count=2),
    ]
    coll = Coll(docs)
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    monkeypatch.setattr(runs_db_mongo, "get_run_blobs", lambda hashes: {})
    monkeypatch.setattr(
        seed_finder,
        "_anchor_hashes",
        lambda chars, terms: [d["_id"] for d in docs],
    )
    return coll


def test_counted_deck_predicate_and_ranking(env):
    out = seed_finder.find_seeds(None, [("BASH", 2)], [], [], [], None, None)
    assert [r["run_hash"] for r in out["results"]] == ["h1"]
    assert out["results"][0]["matched"] == ["deck:BASHx2"]
    assert out["results"][0]["full_match"] is True
    assert out["predicates"] == 1


def test_partial_matches_rank_after_full_and_zero_matches_are_dropped(env):
    out = seed_finder.find_seeds(
        None, [("BASH", 1)], [("WHIRLWIND", 1)], ["AKABEKO"], [], None, None
    )
    hashes = [r["run_hash"] for r in out["results"]]
    assert hashes[0] == "h1"
    assert set(hashes) == {"h1", "h2", "h3"}
    by = {r["run_hash"]: r for r in out["results"]}
    assert by["h1"]["full_match"] and not by["h2"]["full_match"]
    assert by["h2"]["missing"] == ["offered:WHIRLWIND", "relic:AKABEKO"]


def test_runs_matching_nothing_never_appear(env):
    out = seed_finder.find_seeds(None, [], [], ["ANCHOR"], [], None, None)
    assert [r["run_hash"] for r in out["results"]] == ["h2"]


def test_scanned_counts_only_usable_docs(env):
    out = seed_finder.find_seeds(None, [("BASH", 1)], [], [], [], None, None)
    assert out["scanned"] == 3


def test_unknown_ids_are_reported_not_searched(env):
    out = seed_finder.find_seeds(
        None, [("BSH", 1)], [], ["AKABEKO"], ["NOPE"], "ZZZ", None
    )
    assert out["results"] == []
    assert out["unknown"] == ["card:BSH", "event:NOPE", "relic:ZZZ"]
    assert env.queries == []


def test_limit_is_capped_at_fifty(env):
    out = seed_finder.find_seeds(None, [("BASH", 1)], [], [], [], None, None, limit=500)
    assert len(out["results"]) <= 50
    assert seed_finder.MAX_LIMIT == 50


def test_sampled_query_covers_ascension_zero_to_ten(env):
    seed_finder.find_seeds(None, [], [], [], ["BIG_FISH"], None, None)
    assert env.queries[-1]["ascension"] == {"$lte": 10}
    assert env.queries[-1]["player_count"] == 1


def test_blob_predicates_match_events_and_ancient_offers(env, monkeypatch):
    blob = {
        "map_point_history": [
            [
                {
                    "player_stats": [
                        {
                            "event_choices": [
                                {"title": {"table": "events", "key": "BIG_FISH.title"}}
                            ],
                            "ancient_choice": [{"TextKey": "ANCHOR"}],
                        }
                    ]
                }
            ],
            [
                {
                    "player_stats": [
                        {"ancient_choice": [{"title": {"key": "RELIC.AKABEKO"}}]}
                    ]
                }
            ],
        ]
    }
    monkeypatch.setattr(runs_db_mongo, "get_run_blobs", lambda hashes: {"h1": blob})
    out = seed_finder.find_seeds(None, [], [], [], ["BIG_FISH"], "AKABEKO", 2)
    assert [r["run_hash"] for r in out["results"]] == ["h1"]
    assert out["results"][0]["matched"] == ["ancient:AKABEKO:act2", "event:BIG_FISH"]
    out = seed_finder.find_seeds(None, [], [], [], [], "AKABEKO", 1)
    assert out["results"] == []


def test_unavailable_reasons(env, monkeypatch):
    monkeypatch.setattr(seed_finder, "_anchor_hashes", lambda chars, terms: None)
    assert seed_finder.find_seeds(None, [("BASH", 1)], [], [], [], None, None) == {
        "available": False,
        "detail": "index_building",
    }
    monkeypatch.setenv("MONGO_URL", "")
    assert seed_finder.find_seeds(None, [("BASH", 1)], [], [], [], None, None) == {
        "available": False,
        "detail": "no_database",
    }


def test_route_passes_the_detail_through(monkeypatch):
    monkeypatch.setattr(shared_limiter, "enabled", False)
    monkeypatch.setattr("app.services.cache.get_json", lambda k: None)
    monkeypatch.setattr("app.services.cache.set_json", lambda k, v, ttl_seconds: None)
    monkeypatch.setattr(
        seed_finder,
        "find_seeds",
        lambda *a, **k: {"available": False, "detail": "index_building"},
    )
    r = client.get("/api/runs/seed-finder", params={"deck": "bash:2"})
    assert r.json() == {"available": False, "detail": "index_building"}
    assert r.headers["cache-control"] == "no-store"
    r = client.get("/api/runs/seed-finder")
    assert r.json()["available"] is False
