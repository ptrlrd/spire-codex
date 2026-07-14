"""Offer-conditioned draft recommendations: P(pick A | offered A, have B).

Stronger than raw co-occurrence (item_pairings) because it conditions on the
*offer* — the card actually being shown as a reward — which removes the RNG /
rarity confound entirely (you can only "choose" what you're shown). For each
offered card A and each card/relic B already in the deck at that offer, it
measures how much having B shifts the take-rate of A:

  pref(A|B)   picks(A,B) / offers(A,B)        take-rate of A when offered, given B
  pref(A)     picks(A)   / offers(A)          A's baseline take-rate when offered
  lift(A|B)   pref(A|B) / pref(A)             >1 => B makes players want A more

Small (A,B) samples are shrunk toward A's baseline (empirical Bayes) so a
handful of offers can't scream 100%, and pairs below a hard offer floor are
dropped. Reads the flattened `card_choices` + `deck`/`relics` (with floor_added)
off the run doc — a temporal replay, but no map_point_history needed.

Decoupled and infrequent like item_pairings (draft patterns move on patches):
run via scripts.build_draft_recs. Two things are stored — per-context docs
("have B -> these get drafted", for entity pages) and a base-rate doc (for the
live offer scorer). Starters are excluded (reuses item_pairings' official sets).
"""

import logging
import os
from collections import defaultdict
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

logger = logging.getLogger("spire-codex")

DRAFT_RECS_COLLECTION_NAME = "draft_recs"

# Minimum offers(A,B) before a recommendation is reported — kills thin-sample
# noise (conditioning already handles rarity, but rare x rare is still sparse).
_MIN_OFFERS = 100
# Empirical-Bayes shrinkage strength: pref(A|B) is pulled toward pref(A) with
# this many pseudo-observations, so small samples sit near baseline.
_SHRINK_ALPHA = 30
# Recommendations kept per context item.
_TOP_N = 12
# Per-term lift clamp for the live scorer, so one lopsided pair can't dominate.
_LIFT_CLAMP = (0.5, 3.0)


def _official_sets():
    # Reuse the pairings catalog (official + starters excluded) so context items
    # and offered cards are drafted content only.
    from .item_pairings import _official_sets as pairing_sets

    return pairing_sets()


def _run_context_and_offers(run, off_cards, off_relics):
    """(context timeline, offers) for one run. Context = official deck cards +
    relics with their floor_added; offers = official offered cards + was_picked
    + floor."""
    ctx = []
    for c in run.get("deck") or []:
        cid = (c.get("id") or "").upper()
        if cid in off_cards:
            ctx.append((c.get("floor_added") or 0, "cards", cid))
    for r in run.get("relics") or []:
        rid = (r.get("id") or "").upper()
        if rid in off_relics:
            ctx.append((r.get("floor_added") or 0, "relics", rid))
    offers = []
    for ch in run.get("card_choices") or []:
        aid = (ch.get("card_id") or "").upper()
        if aid in off_cards:
            offers.append((aid, bool(ch.get("was_picked")), ch.get("floor") or 0))
    return ctx, offers


def _iter_runs(batch_size: int = 2000):
    """Stream official runs (A0-A10, not hidden), projecting the draft fields."""
    from .runs_db_mongo import _get_collection

    cursor = _get_collection().find(
        {"ascension": {"$gte": 0, "$lte": 10}, "hidden": {"$ne": True}},
        {
            "deck.id": 1,
            "deck.floor_added": 1,
            "relics.id": 1,
            "relics.floor_added": 1,
            "card_choices": 1,
            "win": 1,
        },
        batch_size=batch_size,
    )
    for run in cursor:
        yield run


def compute_recs(runs_iter=None) -> dict[str, Any]:
    """Temporal walk: for every offer, tally picks against the items already in
    the deck. Returns the per-context recommendation docs + base rates."""
    off = _official_sets()
    off_cards, off_relics = off["cards"], off["relics"]
    if runs_iter is None:
        runs_iter = _iter_runs()

    offers = defaultdict(int)  # (A, (bkind, bid)) -> offers of A with B held
    picks = defaultdict(int)  # -> of those, A taken
    picks_win = defaultdict(int)  # -> of those takes, run won
    offers_base = defaultdict(int)  # A -> total offers of A
    picks_base = defaultdict(int)  # A -> total takes of A
    n_runs = 0

    for run in runs_iter:
        ctx, offs = _run_context_and_offers(run, off_cards, off_relics)
        if not offs:
            continue
        n_runs += 1
        won = bool(run.get("win"))
        for a_id, picked, floor in offs:
            offers_base[a_id] += 1
            if picked:
                picks_base[a_id] += 1
            # Items in the deck strictly before this offer (exclude A itself).
            held = {
                (k, i) for (fa, k, i) in ctx if fa < floor and (k, i) != ("cards", a_id)
            }
            for b in held:
                key = (a_id, b)
                offers[key] += 1
                if picked:
                    picks[key] += 1
                    if won:
                        picks_win[key] += 1

    logger.info(
        "draft-recs: walked %d runs, %d offered cards, %d (offer,context) pairs",
        n_runs,
        len(offers_base),
        len(offers),
    )
    return _score(offers, picks, picks_win, offers_base, picks_base, n_runs)


def _score(offers, picks, picks_win, offers_base, picks_base, n_runs) -> dict[str, Any]:
    pref_base = {
        a: picks_base[a] / offers_base[a] for a in offers_base if offers_base[a]
    }
    ctx_recs: dict[tuple, list] = defaultdict(list)
    for (a_id, b), off_ab in offers.items():
        if off_ab < _MIN_OFFERS:
            continue
        pb = pref_base.get(a_id, 0.0)
        pk = picks[(a_id, b)]
        # Empirical-Bayes shrinkage toward the baseline take-rate.
        pref = (pk + _SHRINK_ALPHA * pb) / (off_ab + _SHRINK_ALPHA)
        lift = pref / pb if pb > 0 else 0.0
        wr = picks_win[(a_id, b)] / pk if pk else 0.0
        ctx_recs[b].append(
            {
                "id": a_id,
                "pref": round(pref, 4),
                "pref_base": round(pb, 4),
                "lift": round(lift, 4),
                "offers": off_ab,
                "picks": pk,
                "winrate": round(wr, 4),
            }
        )

    now = datetime.now(timezone.utc)
    docs = []
    for (bkind, bid), recs in ctx_recs.items():
        recs.sort(key=lambda r: (r["lift"], r["offers"]), reverse=True)
        docs.append(
            {
                "_id": f"{bkind}:{bid}",
                "kind": bkind,
                "item_id": bid,
                "recommends": recs[:_TOP_N],
                "built_at": now,
            }
        )
    base_doc = {
        "_id": "__base__",
        "pref_base": {a: round(pref_base[a], 4) for a in pref_base},
        "built_at": now,
    }
    return {"docs": docs, "base": base_doc, "n_runs": n_runs, "built_at": now}


def store_recs(result: dict[str, Any]) -> int:
    from .runs_db_mongo import _get_collection

    coll = _get_collection().database[DRAFT_RECS_COLLECTION_NAME]
    coll.delete_many({})
    if result["docs"]:
        coll.insert_many(result["docs"], ordered=False)
    coll.replace_one({"_id": "__base__"}, result["base"], upsert=True)
    coll.replace_one(
        {"_id": "__meta__"},
        {
            "_id": "__meta__",
            "n_runs": result["n_runs"],
            "context_count": len(result["docs"]),
            "built_at": result["built_at"],
        },
        upsert=True,
    )
    return len(result["docs"])


def build_and_store() -> int:
    if not os.environ.get("MONGO_URL", "").strip():
        logger.warning("draft-recs: MONGO_URL unset; skipping")
        return 0
    result = compute_recs()
    n = store_recs(result)
    logger.info("draft-recs: stored %d contexts from %d runs", n, result["n_runs"])
    return n


@lru_cache(maxsize=32)
def _card_meta(lang: str) -> dict[str, dict[str, str]]:
    """{ID: {name, desc}} for offered cards, for read-time enrichment."""
    from .data_service import load_cards

    try:
        return {
            (c["id"]).upper(): {
                "name": c.get("name") or c["id"],
                "desc": c.get("description") or "",
            }
            for c in load_cards(lang)
            if c.get("id")
        }
    except Exception:
        logger.warning("draft-recs: card meta load failed for %s", lang, exc_info=True)
        return {}


def _enrich(recs: list[dict], lang: str) -> list[dict]:
    meta = _card_meta(lang)
    for r in recs:
        m = meta.get(r["id"]) or {}
        r["name"] = m.get("name", r["id"])
        r["desc"] = m.get("desc", "")
    return recs


def get_draft_recs(
    item_type: str, item_id: str, lang: str = "eng"
) -> dict[str, Any] | None:
    """Given a context item you already have (card/relic), the offered cards
    players draft most given it, ranked by lift. Names/descs enriched."""
    if not os.environ.get("MONGO_URL", "").strip():
        return None
    from .runs_db_mongo import _get_collection

    coll = _get_collection().database[DRAFT_RECS_COLLECTION_NAME]
    doc = coll.find_one({"_id": f"{item_type}:{item_id.upper()}"})
    if not doc:
        return None
    doc.pop("_id", None)
    doc["recommends"] = _enrich(doc.get("recommends") or [], lang)
    return doc


def score_offer(
    deck: list[str], offered: list[str], lang: str = "eng"
) -> dict[str, Any]:
    """Live advisor: given the items you hold (`deck`, "kind:ID" strings) and the
    cards you're offered (`offered`, card ids), rank the offer. Each offered
    card starts at its baseline take-rate and is nudged by the lift of every
    held item that lists it (naive-Bayes-style product, per-term clamped)."""
    if not os.environ.get("MONGO_URL", "").strip():
        return {"ranked": []}
    from .runs_db_mongo import _get_collection

    coll = _get_collection().database[DRAFT_RECS_COLLECTION_NAME]
    offered_up = [o.upper() for o in offered]
    offered_set = set(offered_up)

    base = (coll.find_one({"_id": "__base__"}) or {}).get("pref_base", {})
    scores = {a: base.get(a, 0.0) for a in offered_up}
    reasons: dict[str, list] = {a: [] for a in offered_up}

    # One query for every held item's context doc. Deck entries are "kind:ID"
    # (bare ids default to a card); normalize to "kind:ID_UPPER".
    def _norm(d: str) -> str:
        kind, _, ident = d.partition(":")
        if not ident:
            kind, ident = "cards", d
        return f"{kind}:{ident.upper()}"

    ids = [_norm(d) for d in deck]
    lo, hi = _LIFT_CLAMP
    for cdoc in coll.find({"_id": {"$in": ids}}):
        for rec in cdoc.get("recommends") or []:
            if rec["id"] in offered_set:
                lift = min(hi, max(lo, rec.get("lift", 1.0)))
                scores[rec["id"]] *= lift
                reasons[rec["id"]].append(
                    {
                        "from": cdoc["_id"],
                        "lift": rec.get("lift"),
                        "winrate": rec.get("winrate"),
                    }
                )

    meta = _card_meta(lang)
    ranked = sorted(offered_up, key=lambda a: scores.get(a, 0.0), reverse=True)
    return {
        "ranked": [
            {
                "id": a,
                "name": (meta.get(a) or {}).get("name", a),
                "score": round(scores.get(a, 0.0), 4),
                "base": round(base.get(a, 0.0), 4),
                "reasons": sorted(
                    reasons[a], key=lambda x: x["lift"] or 0, reverse=True
                )[:5],
            }
            for a in ranked
        ]
    }
