"""An archetype lists the wider set of cards and relics it leans on, not only
the three cards and two relics that name it."""

import numpy as np
import scipy.sparse as sp
from fastapi.testclient import TestClient

from app.dependencies import shared_limiter
from app.main import app
from app.services import cache as app_cache
from app.services import run_vectors

VOCAB = ["CLAW", "FERAL", "SCRAPE", "ALL_FOR_ONE", "ZAP", "R:KUNAI", "R:ANCHOR"]


def _row(*terms: str) -> list[float]:
    return [1.0 if v in terms else 0.0 for v in VOCAB]


def _clusters(monkeypatch):
    claw = _row("CLAW", "FERAL", "SCRAPE", "ALL_FOR_ONE", "R:KUNAI")
    zap = _row("ZAP", "R:ANCHOR")
    rows = [claw] * 6 + [zap] * 6
    mat = sp.csr_matrix(np.array(rows, dtype=np.float32))
    mat = sp.csr_matrix(mat.multiply(1 / np.sqrt(mat.multiply(mat).sum(axis=1))))
    meta = [{"win": i % 2, "hash": f"h{i}", "ver": "v1"} for i in range(len(rows))]
    monkeypatch.setattr(run_vectors, "_nondraftable", lambda: frozenset())
    return run_vectors._cluster_shard("DEFECT", mat, meta, VOCAB, 2)[0]


def test_cluster_keeps_every_leaning_card_and_relic(monkeypatch):
    clusters = _clusters(monkeypatch)
    claw = next(c for c in clusters if "ZAP" not in c["defining_cards"])
    assert len(claw["defining_cards"]) == 3
    assert {m[0] for m in claw["cards"]} == {"CLAW", "FERAL", "SCRAPE", "ALL_FOR_ONE"}
    assert [m[0] for m in claw["cards"][:3]] == claw["defining_cards"]
    assert [m[0] for m in claw["relics"]] == ["KUNAI"]
    assert all(m[1] > 1 for m in claw["cards"] + claw["relics"])


def _get(monkeypatch, cluster):
    monkeypatch.setattr(app_cache, "get_json", lambda key: None)
    monkeypatch.setattr(app_cache, "set_json", lambda *a, **k: None)
    monkeypatch.setattr(
        run_vectors,
        "load_archetypes",
        lambda: {"characters": {"DEFECT": [cluster]}, "built_at": "now"},
    )
    shared_limiter.reset()
    res = TestClient(app).get("/api/runs/archetypes")
    assert res.status_code == 200
    return res.json()["characters"]["DEFECT"][0]


BASE = {
    "size": 80,
    "win_rate": 12.0,
    "defining_cards": ["CLAW", "FERAL"],
    "defining_relics": ["KUNAI"],
    "example_runs": [],
    "versions": {},
}


def test_api_lists_members_with_lift(monkeypatch):
    row = _get(
        monkeypatch,
        {**BASE, "cards": [["CLAW", 4.2], ["SCRAPE", 2.0]], "relics": [["KUNAI", 3]]},
    )
    assert [(m["id"], m["lift"]) for m in row["cards"]] == [
        ("CLAW", 4.2),
        ("SCRAPE", 2.0),
    ]
    assert row["relics"][0]["id"] == "KUNAI"
    assert row["cards"][0]["name"]


def test_api_falls_back_to_defining_before_the_next_build(monkeypatch):
    row = _get(monkeypatch, BASE)
    assert [(m["id"], m["lift"]) for m in row["cards"]] == [
        ("CLAW", None),
        ("FERAL", None),
    ]
    assert [m["id"] for m in row["relics"]] == ["KUNAI"]
