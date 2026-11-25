"""The live roster lists competitive runs first and can carry a small deck
and relic preview so the page needs one request."""

from datetime import datetime, timezone

from app.services import presence_db


class Cursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, order):
        for key, _ in reversed(order):
            self.docs.sort(key=lambda d: d.get(key) or 0, reverse=True)
        return self

    def limit(self, n):
        return self.docs[:n]


class Coll:
    def __init__(self, docs):
        self.docs = docs
        self.fields = []

    def find(self, flt, fields):
        self.fields.append(fields)
        want = flt["competitive"]
        if "$in" in want:
            keep = [dict(d) for d in self.docs if d.get("competitive") in want["$in"]]
        else:
            keep = [
                dict(d) for d in self.docs if d.get("competitive") not in want["$nin"]
            ]
        return Cursor(keep)


def _doc(name, floor, competitive=None):
    doc = {"_id": name, "total_floor": floor, "updated_at": datetime.now(timezone.utc)}
    if competitive:
        doc["competitive"] = competitive
    return doc


def _roster(monkeypatch, docs, **kw):
    coll = Coll(docs)
    monkeypatch.setattr(presence_db, "_presence_coll", lambda: coll)
    return [p["steam_id"] for p in presence_db.active(**kw)], coll


def test_competitive_runs_come_first_then_the_deepest(monkeypatch):
    docs = [
        _doc("deep", 40),
        _doc("early_cleared", 2, "cleared"),
        _doc("mid", 20, "off"),
        _doc("flagged", 10, "flagged"),
    ]
    order, _ = _roster(monkeypatch, docs)
    assert order == ["flagged", "early_cleared", "deep", "mid"]


def test_the_limit_keeps_competitive_runs_over_deeper_ones(monkeypatch):
    docs = [_doc("deep", 40), _doc("deeper", 45), _doc("early_cleared", 2, "cleared")]
    order, _ = _roster(monkeypatch, docs, limit=2)
    assert order == ["early_cleared", "deeper"]


def test_preview_asks_for_relics_and_the_last_few_cards(monkeypatch):
    _, coll = _roster(monkeypatch, [_doc("a", 1)], preview=True)
    assert "relics" not in coll.fields[0]
    assert coll.fields[0]["deck"] == {"$slice": -presence_db.PREVIEW_CARDS}
    _, plain = _roster(monkeypatch, [_doc("a", 1)])
    assert plain.fields[0]["deck"] == 0 and plain.fields[0]["relics"] == 0
