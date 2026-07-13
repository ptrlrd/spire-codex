"""Co-occurrence / synergy pairings across cards, relics, and potions.

"Players who take X usually also take Y." Decoupled on purpose from the
entity-stats snapshot walk (which is memory-heavy and rebuilds every couple of
hours): the underlying draft patterns only shift on game patches, so this is an
infrequent, cached job. It streams official runs from Mongo, counts how often
each pair of items lands in the same run, and scores the pairs. Results are
stored per item (top-N partners) for the card / relic pages to read in O(1).

Metrics, per unordered pair (a, b) over N official runs:
  co          runs containing both a and b
  P(a)        count[a] / N                      base rate of a
  P(a, b)     co / N
  PMI         log( P(a,b) / (P(a) P(b)) )
  NPMI        PMI / -log P(a,b)                 in [-1, 1]; >0 synergy, 0 = independent,
                                                <0 = actively avoided together
  conf        co / count[this]                  directional: of decks with THIS
                                                item, fraction that also run the partner
  conf_rev    co / count[partner]               the other direction, P(this | partner);
                                                both are stored so neither is missed
  winrate     wins_together / co                the pair's win rate

Cards and relics are drafted, so their co-occurrence is a real synergy signal
and is ranked by NPMI. Potions are RNG drops (we only count ones the player
actually took), so their signal is weaker — they're ranked by raw frequency and
surfaced as "commonly seen with", not a synergy claim. Pairs below a per-type
support floor are dropped so rare-but-always-together noise never shows up.
"""

import logging
import math
import os
from collections import defaultdict
from datetime import datetime, timezone
from functools import lru_cache
from itertools import combinations
from typing import Any

logger = logging.getLogger("spire-codex")

# Mongo collection holding the cached results (one doc per item + a __meta__).
PAIRINGS_COLLECTION_NAME = "item_pairings"

# Minimum co-occurrence count for a pair to be reported, per partner type. Kills
# rare-but-always-together noise. Potions get a higher floor: they're a weaker,
# RNG-driven signal, so we only surface the ones seen a lot.
_MIN_SUPPORT = {"cards": 250, "relics": 250, "potions": 500}

# Partners kept per (item, partner-type). Enough for a "top synergies" panel
# without bloating the cached doc.
_TOP_N = 12

# The three item kinds we pair across. Matches the run-doc field names.
_ITEM_KINDS = ("cards", "relics", "potions")


_official_cache: dict[str, frozenset[str]] | None = None


def _official_sets() -> dict[str, frozenset[str]]:
    """Upper-cased official id sets for cards / relics / potions, so modded ids
    in a run get dropped (they'd otherwise pollute the synergy signal). Loaded
    once from the committed game-data catalogs."""
    global _official_cache
    if _official_cache is None:
        from .data_service import load_cards, load_potions, load_relics

        def ids(rows):
            return frozenset((r.get("id") or "").upper() for r in rows if r.get("id"))

        try:
            _official_cache = {
                "cards": ids(load_cards()),
                "relics": ids(load_relics()),
                "potions": ids(load_potions()),
            }
        except Exception:
            logger.warning("item-pairings: catalog load failed", exc_info=True)
            _official_cache = {k: frozenset() for k in _ITEM_KINDS}
    return _official_cache


def _run_items(run: dict, official: dict[str, frozenset[str]]) -> set[tuple[str, str]]:
    """The set of official (kind, id) items in one run: every distinct deck card
    (multiples collapse to one), every relic, and every potion the player
    actually took. Modded / unknown ids are dropped."""
    items: set[tuple[str, str]] = set()
    for c in run.get("deck") or []:
        cid = (c.get("id") or "").upper()
        if cid in official["cards"]:
            items.add(("cards", cid))
    for r in run.get("relics") or []:
        rid = (r.get("id") or "").upper()
        if rid in official["relics"]:
            items.add(("relics", rid))
    for p in run.get("potions") or []:
        # Potions are RNG; only count ones the player chose to take, not every
        # potion that was merely offered.
        if not (p.get("was_picked") or p.get("was_used")):
            continue
        pid = (p.get("id") or "").upper()
        if pid in official["potions"]:
            items.add(("potions", pid))
    return items


def _iter_official_runs(batch_size: int = 2000):
    """Stream official runs (A0-A10, not hidden) from Mongo, projecting only the
    fields the pairing needs. Streamed so peak memory stays bounded regardless
    of run count — the whole point of keeping this off the snapshot walk."""
    from .runs_db_mongo import _get_collection

    cursor = _get_collection().find(
        {"ascension": {"$gte": 0, "$lte": 10}, "hidden": {"$ne": True}},
        {"deck.id": 1, "relics.id": 1, "potions": 1, "win": 1},
        batch_size=batch_size,
    )
    for run in cursor:
        yield run


def compute_pairings(runs_iter=None) -> dict[str, Any]:
    """Walk the runs once, accumulate co-occurrence + wins, and return the
    per-item top-N partner structure plus totals. `runs_iter` defaults to the
    Mongo stream; injectable for tests."""
    official = _official_sets()
    if runs_iter is None:
        runs_iter = _iter_official_runs()

    # Item -> compact int index (keeps the pair dict keys small and hashing
    # cheap over the ~500M pair increments).
    idx_of: dict[tuple[str, str], int] = {}
    items_list: list[tuple[str, str]] = []

    count = defaultdict(int)  # idx -> runs containing it
    wins = defaultdict(int)  # idx -> winning runs containing it
    co = defaultdict(int)  # (i, j) i<j -> runs containing both
    co_win = defaultdict(int)  # (i, j) -> winning runs containing both
    n_runs = 0

    for run in runs_iter:
        item_set = _run_items(run, official)
        if len(item_set) < 2:
            continue
        n_runs += 1
        won = bool(run.get("win"))
        idxs = []
        for it in item_set:
            i = idx_of.get(it)
            if i is None:
                i = len(items_list)
                idx_of[it] = i
                items_list.append(it)
            idxs.append(i)
            count[i] += 1
            if won:
                wins[i] += 1
        idxs.sort()
        for a, b in combinations(idxs, 2):
            co[(a, b)] += 1
            if won:
                co_win[(a, b)] += 1

    logger.info(
        "item-pairings: walked %d runs, %d distinct items, %d distinct pairs",
        n_runs,
        len(items_list),
        len(co),
    )
    return _score_and_rank(items_list, count, wins, co, co_win, n_runs)


def _score_and_rank(items_list, count, wins, co, co_win, n_runs) -> dict[str, Any]:
    """Turn raw counts into NPMI / confidence / win-rate and keep the top-N
    partners per item, split by partner kind."""
    # partners[i] -> {"cards": [...], "relics": [...], "potions": [...]}
    partners: dict[int, dict[str, list]] = defaultdict(
        lambda: {k: [] for k in _ITEM_KINDS}
    )

    for (i, j), c in co.items():
        ki, idi = items_list[i]
        kj, idj = items_list[j]
        # Support floor is per partner *kind*; a card->potion pair is gated by
        # the potion floor from the card's side and vice-versa, so apply each
        # direction against the partner's kind.
        ci, cj = count[i], count[j]
        # PMI / NPMI are symmetric. NPMI normalizes PMI by -log P(a,b) into
        # [-1, 1]. When the pair is in *every* counted run (p_ij == 1) the
        # denominator is 0 and both items are ubiquitous, i.e. independent, so
        # NPMI is 0 — not a synergy (guards against a divide-by-zero too).
        p_ij = c / n_runs
        pmi = math.log(p_ij / ((ci / n_runs) * (cj / n_runs)))
        denom = -math.log(p_ij)
        npmi = pmi / denom if denom > 0 else 0.0
        cw = co_win.get((i, j), 0)
        winrate = round(cw / c, 4) if c else 0.0

        # Store BOTH confidence directions: conf = P(partner | this item), and
        # conf_rev = P(this item | partner). One direction alone misleads — a
        # rare card can be a near-mandatory pick inside a common card's decks
        # while barely denting that common card's overall rate. `conf` always
        # reads "of THIS page's decks, the fraction that also run the partner".
        if c >= _MIN_SUPPORT.get(kj, 250):
            partners[i][kj].append(
                {
                    "id": idj,
                    "co": c,
                    "conf": round(c / ci, 4),  # P(j | i)
                    "conf_rev": round(c / cj, 4),  # P(i | j)
                    "npmi": round(npmi, 4),
                    "winrate": winrate,
                }
            )
        if c >= _MIN_SUPPORT.get(ki, 250):
            partners[j][ki].append(
                {
                    "id": idi,
                    "co": c,
                    "conf": round(c / cj, 4),  # P(i | j)
                    "conf_rev": round(c / ci, 4),  # P(j | i)
                    "npmi": round(npmi, 4),
                    "winrate": winrate,
                }
            )

    docs = []
    now = datetime.now(timezone.utc)
    for i, kinds in partners.items():
        kind, item_id = items_list[i]
        out_kinds = {}
        for pk, lst in kinds.items():
            if not lst:
                continue
            # Cards/relics rank by synergy (NPMI); potions by raw frequency
            # (they're "commonly seen with", not a synergy claim).
            if pk == "potions":
                lst.sort(key=lambda d: (d["co"], d["conf"]), reverse=True)
            else:
                lst.sort(key=lambda d: (d["npmi"], d["co"]), reverse=True)
            out_kinds[pk] = lst[:_TOP_N]
        if out_kinds:
            docs.append(
                {
                    "_id": f"{kind}:{item_id}",
                    "kind": kind,
                    "item_id": item_id,
                    "count": count[i],
                    "winrate": round(wins[i] / count[i], 4) if count[i] else 0.0,
                    "partners": out_kinds,
                    "built_at": now,
                }
            )
    return {"docs": docs, "n_runs": n_runs, "built_at": now}


def store_pairings(result: dict[str, Any]) -> int:
    """Replace the cached pairings collection with a freshly computed set.
    Returns the number of item docs written."""
    from .runs_db_mongo import _get_collection

    db = _get_collection().database
    coll = db[PAIRINGS_COLLECTION_NAME]
    docs = result["docs"]
    # Rewrite wholesale: drop stale items (an item can lose all its partners
    # between builds) then bulk-insert the fresh set + a meta doc.
    coll.delete_many({})
    if docs:
        coll.insert_many(docs, ordered=False)
    coll.replace_one(
        {"_id": "__meta__"},
        {
            "_id": "__meta__",
            "n_runs": result["n_runs"],
            "item_count": len(docs),
            "built_at": result["built_at"],
        },
        upsert=True,
    )
    return len(docs)


def build_and_store() -> int:
    """Full job: walk runs, score, persist. Returns items written. Safe to run
    manually or on a slow schedule."""
    if not os.environ.get("MONGO_URL", "").strip():
        logger.warning("item-pairings: MONGO_URL unset; skipping")
        return 0
    result = compute_pairings()
    n = store_pairings(result)
    logger.info("item-pairings: stored %d items from %d runs", n, result["n_runs"])
    return n


@lru_cache(maxsize=32)
def _name_maps(lang: str) -> dict[str, dict[str, str]]:
    """Per-language {kind: {ID: display name}} for enriching partner ids at read
    time. The cached pairings are language-agnostic (built once), so names are
    resolved here per request. Cached per lang; catalogs are static per deploy."""
    from .data_service import load_cards, load_potions, load_relics

    def m(rows):
        return {
            (r["id"]).upper(): (r.get("name") or r["id"]) for r in rows if r.get("id")
        }

    try:
        return {
            "cards": m(load_cards(lang)),
            "relics": m(load_relics(lang)),
            "potions": m(load_potions(lang)),
        }
    except Exception:
        logger.warning(
            "item-pairings: name map load failed for %s", lang, exc_info=True
        )
        return {k: {} for k in _ITEM_KINDS}


def get_pairings(
    item_type: str, item_id: str, lang: str = "eng"
) -> dict[str, Any] | None:
    """Read one item's cached partners for the API, with each partner's
    localized display name attached. None if not computed yet."""
    if not os.environ.get("MONGO_URL", "").strip():
        return None
    from .runs_db_mongo import _get_collection

    db = _get_collection().database
    doc = db[PAIRINGS_COLLECTION_NAME].find_one(
        {"_id": f"{item_type}:{item_id.upper()}"}
    )
    if not doc:
        return None
    doc.pop("_id", None)
    names = _name_maps(lang)
    for kind, lst in (doc.get("partners") or {}).items():
        nm = names.get(kind, {})
        for p in lst:
            p["name"] = nm.get(p["id"], p["id"])
    return doc
