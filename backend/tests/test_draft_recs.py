from collections import defaultdict

from app.services import draft_recs


def _counts(pairs):
    offers, picks, wins = defaultdict(int), defaultdict(int), defaultdict(int)
    offers_base, picks_base = defaultdict(int), defaultdict(int)
    for a_id, off, pk, won in pairs:
        key = (a_id, ("cards", "OFFERING"))
        offers[key], picks[key], wins[key] = off, pk, won
        offers_base[a_id], picks_base[a_id] = off * 10, pk * 5
    return offers, picks, wins, offers_base, picks_base


def test_thin_pick_counts_never_rank():
    floor = draft_recs.MIN_PICKS
    out = draft_recs._score(
        *_counts(
            [
                ("THIN", 438, 9, 8),
                ("EDGE", 600, floor - 1, 30),
                ("REAL", 900, floor, 20),
            ]
        ),
        n_runs=10,
    )
    recs = {d["_id"]: d["recommends"] for d in out["docs"]}["cards:OFFERING"]
    assert [r["id"] for r in recs] == ["REAL"]
    assert recs[0]["picks"] == floor and recs[0]["offers"] == 900
    assert recs[0]["winrate"] == round(20 / floor, 4)


def test_stored_docs_from_before_the_floor_are_filtered_on_read(monkeypatch):
    floor = draft_recs.MIN_PICKS
    stored = {
        "_id": "cards:OFFERING",
        "kind": "cards",
        "item_id": "OFFERING",
        "recommends": [
            {"id": "THIN", "lift": 2.2, "offers": 438, "picks": 9, "winrate": 0.89},
            {"id": "OLD", "lift": 1.9, "offers": 400, "winrate": 0.5},
            {"id": "REAL", "lift": 1.4, "offers": 900, "picks": floor, "winrate": 0.4},
        ],
    }

    class Coll:
        database = {}

        def find_one(self, query):
            return dict(stored) if query["_id"] == stored["_id"] else None

    coll = Coll()
    coll.database = {draft_recs.DRAFT_RECS_COLLECTION_NAME: coll}
    from app.services import runs_db_mongo

    monkeypatch.setenv("MONGO_URL", "mongodb://unused")
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)
    monkeypatch.setattr(draft_recs, "_card_meta", lambda lang: {})
    doc = draft_recs.get_draft_recs("cards", "offering")
    assert [r["id"] for r in doc["recommends"]] == ["REAL"]
    assert doc["min_picks"] == floor
