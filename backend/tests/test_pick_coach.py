"""The build coach and deck advisor over a tiny fixture matrix: advice never
repeats what the draft holds, winners rank by support, a target lock sticks,
offered cards score by commitment plus support, and the route blends the
draft-recs take score in and says when the index is missing."""

import json

import numpy as np
import pytest
import scipy.sparse as sp
from fastapi.testclient import TestClient

from app.dependencies import shared_limiter
from app.main import app
from app.services import run_vectors

VOCAB = ["ANGER", "BASH", "FLEX", "WHIRLWIND", "R:AKABEKO", "R:ANCHOR"]


def _row(*terms: str) -> list[float]:
    return [1.0 if v in terms else 0.0 for v in VOCAB]


@pytest.fixture
def index(tmp_path, monkeypatch):
    rows = [
        _row("WHIRLWIND", "ANGER", "R:AKABEKO"),
        _row("WHIRLWIND", "ANGER", "BASH"),
        _row("WHIRLWIND", "R:ANCHOR"),
        _row("FLEX", "BASH"),
        _row("FLEX", "R:ANCHOR"),
        _row("ANGER"),
    ]
    mat = sp.csr_matrix(np.array(rows, dtype=np.float32))
    meta = {"win": np.array([1, 1, 0, 1, 0, 1], dtype=np.int8)}
    monkeypatch.setattr(
        run_vectors, "_load_vocab", lambda: {v: i for i, v in enumerate(VOCAB)}
    )
    monkeypatch.setattr(run_vectors, "_load_shard", lambda ch: (mat, meta))
    monkeypatch.setattr(run_vectors, "_nondraftable", lambda: frozenset())
    clusters = [
        {
            "defining_cards": ["WHIRLWIND", "ANGER"],
            "defining_relics": ["AKABEKO"],
            "size": 60,
            "win_rate": 55.0,
        },
        {
            "defining_cards": ["FLEX"],
            "defining_relics": [],
            "size": 40,
            "win_rate": 35.0,
        },
    ]
    monkeypatch.setattr(
        run_vectors, "load_archetypes", lambda: {"characters": {"IRONCLAD": clusters}}
    )
    centers = np.array(
        [_row("WHIRLWIND", "ANGER", "R:AKABEKO"), _row("FLEX", "BASH")],
        dtype=np.float32,
    )
    centers /= np.linalg.norm(centers, axis=1, keepdims=True)
    monkeypatch.setattr(run_vectors, "_VEC_DIR", tmp_path)
    np.save(tmp_path / "IRONCLAD_centroids.npy", centers)
    return clusters


def test_deck_advisor_ranks_winner_picks_the_draft_lacks(index):
    recs = run_vectors.deck_advisor("IRONCLAD", [{"id": "WHIRLWIND"}], [])
    ids = [r["id"] for r in recs]
    assert "WHIRLWIND" not in ids
    assert ids[0] == "ANGER"
    anger = recs[0]
    assert anger["etype"] == "cards" and anger["support"] == 100.0
    relic = next(r for r in recs if r["id"] == "AKABEKO")
    assert relic["etype"] == "relics" and relic["support"] == 50.0


def test_deck_advisor_without_index_is_none(monkeypatch):
    monkeypatch.setattr(run_vectors, "_load_vocab", lambda: None)
    assert run_vectors.deck_advisor("IRONCLAD", [{"id": "BASH"}], []) is None


def test_pick_coach_scores_offers_and_matches_the_nearest_build(index):
    coach = run_vectors.pick_coach(
        "IRONCLAD", [{"id": "WHIRLWIND"}], [], ["ANGER", "FLEX"]
    )
    assert coach["target"]["defining_cards"] == ["WHIRLWIND", "ANGER"]
    assert coach["target"]["locked"] is False
    assert [c["key"] for c in coach["candidates"]] == ["ANGER+WHIRLWIND", "FLEX"]
    offers = {o["id"]: o for o in coach["offers"]}
    assert offers["ANGER"]["commitment_delta"] > 0
    assert offers["FLEX"]["commitment_delta"] < 0
    assert offers["ANGER"]["winner_support"] == 100.0
    assert offers["FLEX"]["winner_support"] == 0.0
    assert [o["id"] for o in coach["offers"]] == ["ANGER", "FLEX"]


def test_pick_coach_honours_a_target_lock(index):
    coach = run_vectors.pick_coach(
        "IRONCLAD", [{"id": "WHIRLWIND"}], [], ["FLEX"], target="FLEX"
    )
    assert coach["target"]["key"] == "FLEX"
    assert coach["target"]["locked"] is True
    assert coach["offers"][0]["commitment_delta"] > 0


def test_pick_coach_ignores_an_unknown_target(index):
    coach = run_vectors.pick_coach("IRONCLAD", [{"id": "FLEX"}], [], [], target="NOPE")
    assert coach["target"]["key"] == "FLEX"
    assert coach["target"]["locked"] is False
    assert coach["offers"] == []


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setattr(shared_limiter, "enabled", False)
    monkeypatch.setattr("app.services.cache.get_json", lambda k: None)
    monkeypatch.setattr(
        "app.services.cache.set_json", lambda k, v, ttl_seconds=None: None
    )
    return TestClient(app)


def test_route_blends_the_take_score_and_names_everything(api, monkeypatch):
    def fake_coach(character, deck, relics, offer, target=None):
        return {
            "target": {
                "key": "ANGER+WHIRLWIND",
                "locked": False,
                "defining_cards": ["WHIRLWIND", "ANGER"],
                "defining_relics": ["AKABEKO"],
                "win_rate": 55.0,
                "share": 60.0,
                "similarity": 88.8,
            },
            "candidates": [],
            "offers": [
                {
                    "id": o,
                    "commitment_delta": 1.0,
                    "winner_support": 50.0,
                    "coach_score": 35.0,
                }
                for o in offer
            ],
        }

    seen = {}

    def fake_score(held, offered, lang="eng"):
        seen["held"] = held
        seen["offered"] = offered
        return {
            "ranked": [
                {"id": "ANGER", "score": 0.61, "base": 0.44},
            ]
        }

    monkeypatch.setattr("app.services.run_vectors.pick_coach", fake_coach)
    monkeypatch.setattr("app.services.draft_recs.score_offer", fake_score)
    body = api.get(
        "/api/runs/pick-coach",
        params={
            "character": "ironclad",
            "cards": "whirlwind,bash",
            "relics": "akabeko",
            "offer": "anger,flex",
        },
    ).json()
    assert body["available"] is True
    assert seen["held"] == ["cards:BASH", "cards:WHIRLWIND", "relics:AKABEKO"]
    assert seen["offered"] == ["ANGER", "FLEX"]
    by_id = {o["id"]: o for o in body["offers"]}
    assert by_id["ANGER"]["take_score"] == 0.61
    assert by_id["ANGER"]["take_base"] == 0.44
    assert by_id["FLEX"]["take_score"] is None
    assert by_id["ANGER"]["name"] == "Anger"
    assert body["target"]["defining_cards"][0] == {
        "id": "WHIRLWIND",
        "name": "Whirlwind",
    }
    assert body["target"]["defining_relics"][0]["id"] == "AKABEKO"
    assert body["target"]["name"]


def test_route_without_an_offer_skips_the_take_score(api, monkeypatch):
    calls = []
    monkeypatch.setattr(
        "app.services.run_vectors.pick_coach",
        lambda *a, **k: {
            "target": {
                "key": "FLEX",
                "locked": False,
                "defining_cards": ["FLEX"],
                "defining_relics": [],
                "win_rate": 35.0,
                "share": 40.0,
                "similarity": 70.0,
            },
            "candidates": [],
            "offers": [],
        },
    )
    monkeypatch.setattr(
        "app.services.draft_recs.score_offer", lambda *a, **k: calls.append(a)
    )
    body = api.get(
        "/api/runs/pick-coach", params={"character": "IRONCLAD", "cards": "FLEX"}
    ).json()
    assert body["offers"] == []
    assert calls == []


def test_routes_report_unavailable_when_the_index_is_missing(api, monkeypatch):
    monkeypatch.setattr("app.services.run_vectors.pick_coach", lambda *a, **k: None)
    monkeypatch.setattr("app.services.run_vectors.deck_advisor", lambda *a, **k: None)
    coach = api.get(
        "/api/runs/pick-coach", params={"character": "IRONCLAD", "cards": "FLEX"}
    )
    advisor = api.get(
        "/api/runs/deck-advisor", params={"character": "IRONCLAD", "cards": "FLEX"}
    )
    assert coach.json() == {"available": False}
    assert advisor.json() == {"available": False, "items": []}
    assert coach.headers["cache-control"] == "no-store"
    assert json.loads(advisor.text)["available"] is False
