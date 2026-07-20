"""Seed finder: mine submitted runs for seeds whose observed content matches
a combination of predicates (cards offered or kept, relics obtained, events
seen, ancient relic offers).

Funnel: vector shards answer "which runs have these cards/relics at all"
in memory (anchor stage), the flattened card_choices on the run docs verify
offer counts, and only events/ancient predicates fall through to blobs.
Results rank full matches first, then by how many predicates hit."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_NAMESPACES = {"CARD", "RELIC", "ENCOUNTER", "EVENT", "POTION", "ENCHANTMENT"}

MAX_CANDIDATES = 8000
MAX_BLOB_FETCH = 2000


def _bare(raw: str | None) -> str:
    if not raw:
        return ""
    parts = raw.split(".")
    if len(parts) > 1 and parts[0] in _NAMESPACES:
        return ".".join(parts[1:])
    return raw


def _anchor_hashes(characters: list[str], terms: list[str]) -> list[str] | None:
    """Run hashes whose composition vector contains every anchor term,
    newest first. None when the vector build isn't available."""
    import numpy as np

    from .run_vectors import _load_shard, _load_vocab

    vocab = _load_vocab()
    if vocab is None:
        return None
    cols = []
    for t in terms:
        idx = vocab.get(t)
        if idx is None:
            return []
        cols.append(idx)
    dated: list[tuple[bytes, bytes]] = []
    for ch in characters:
        loaded = _load_shard(ch)
        if loaded is None:
            continue
        mat, meta = loaded
        mask = None
        for col in cols:
            e = np.zeros(mat.shape[1], dtype=np.float32)
            e[col] = 1.0
            pres = np.asarray(mat.dot(e)) > 0
            mask = pres if mask is None else (mask & pres)
        if mask is None or not mask.any():
            continue
        rows = np.flatnonzero(mask)
        dates = meta["date"][rows]
        hashes = meta["hash"][rows]
        dated.extend(zip(dates, hashes))
    dated.sort(reverse=True)
    return [h.decode() for _, h in dated[:MAX_CANDIDATES]]


def _blob_matches(
    blob: dict,
    events: list[str],
    ancient_relic: str | None,
    ancient_act: int | None,
) -> tuple[set[str], set[str]]:
    """(matched, missing) labels for the blob-only predicates of one run."""
    want_events = set(events)
    seen_events: set[str] = set()
    ancient_hit = False
    for act_idx, act_floors in enumerate(blob.get("map_point_history") or []):
        for floor in act_floors or []:
            for ps in floor.get("player_stats") or []:
                for ec in ps.get("event_choices") or []:
                    title = ec.get("title") or {}
                    if title.get("table") != "events":
                        continue
                    eid = (title.get("key") or "").split(".", 1)[0].upper()
                    if eid in want_events:
                        seen_events.add(eid)
                if ancient_relic and not ancient_hit:
                    if ancient_act is not None and act_idx != ancient_act - 1:
                        continue
                    for offer in ps.get("ancient_choice") or []:
                        rid = offer.get("TextKey") or _bare(
                            (offer.get("title") or {}).get("key")
                        )
                        if (rid or "").upper() == ancient_relic:
                            ancient_hit = True
                            break
    matched: set[str] = set()
    missing: set[str] = set()
    for eid in want_events:
        (matched if eid in seen_events else missing).add(f"event:{eid}")
    if ancient_relic:
        label = f"ancient:{ancient_relic}" + (
            f":act{ancient_act}" if ancient_act else ""
        )
        (matched if ancient_hit else missing).add(label)
    return matched, missing


def find_seeds(
    character: str | None,
    deck_cards: list[tuple[str, int]],
    offered_cards: list[tuple[str, int]],
    relics: list[str],
    events: list[str],
    ancient_relic: str | None,
    ancient_act: int | None,
    limit: int = 20,
) -> dict | None:
    """Rank submitted runs by how many predicates their seed demonstrated."""
    from .run_vectors import _OFFICIAL_CHARACTERS
    from .runs_db_mongo import _get_collection, get_run_blobs

    characters = (
        [character] if character in _OFFICIAL_CHARACTERS else list(_OFFICIAL_CHARACTERS)
    )
    anchor_terms = [cid for cid, _ in deck_cards] + [f"R:{rid}" for rid in relics]

    coll = _get_collection()
    sampled = False
    if anchor_terms:
        hashes = _anchor_hashes(characters, anchor_terms)
        if hashes is None:
            return None
        if not hashes:
            return {"sampled": False, "scanned": 0, "results": []}
        query = {"_id": {"$in": hashes}}
    else:
        # No composition anchor to narrow on: sample the newest runs.
        sampled = True
        query = {
            "hidden": {"$ne": True},
            "player_count": 1,
            "character": {"$in": characters},
            "seed": {"$nin": ["", None]},
        }

    projection = {
        "seed": 1,
        "character": 1,
        "ascension": 1,
        "win": 1,
        "submitted_at": 1,
        "player_count": 1,
        "hidden": 1,
        "deck.id": 1,
        "relics.id": 1,
        "card_choices.card_id": 1,
    }
    cursor = coll.find(query, projection)
    if sampled:
        cursor = cursor.sort("submitted_at", -1).limit(MAX_CANDIDATES)

    need_blob = bool(events or ancient_relic)
    doc_total = len(deck_cards) + len(offered_cards) + len(relics)
    blob_total = len(events) + (1 if ancient_relic else 0)

    scanned = 0
    rows = []
    for doc in cursor:
        scanned += 1
        seed = (doc.get("seed") or "").strip()
        if not seed or doc.get("hidden") or (doc.get("player_count") or 1) != 1:
            continue
        matched: set[str] = set()
        missing: set[str] = set()
        deck_counts: dict[str, int] = {}
        for c in doc.get("deck") or []:
            cid = str(c.get("id") or "").upper()
            deck_counts[cid] = deck_counts.get(cid, 0) + 1
        for cid, n in deck_cards:
            label = f"deck:{cid}" + (f"x{n}" if n > 1 else "")
            (matched if deck_counts.get(cid, 0) >= n else missing).add(label)
        relic_ids = {str(r.get("id") or "").upper() for r in doc.get("relics") or []}
        for rid in relics:
            (matched if rid in relic_ids else missing).add(f"relic:{rid}")
        offer_counts: dict[str, int] = {}
        for ch in doc.get("card_choices") or []:
            cid = str(ch.get("card_id") or "").upper()
            offer_counts[cid] = offer_counts.get(cid, 0) + 1
        for cid, n in offered_cards:
            label = f"offered:{cid}" + (f"x{n}" if n > 1 else "")
            (matched if offer_counts.get(cid, 0) >= n else missing).add(label)
        rows.append(
            {
                "run_hash": doc["_id"],
                "seed": seed,
                "character": doc.get("character"),
                "ascension": doc.get("ascension"),
                "win": bool(doc.get("win")),
                "date": str(doc.get("submitted_at") or "")[:10],
                "matched": matched,
                "missing": missing,
            }
        )

    if need_blob and rows:
        # Blob predicates are unknowable from the doc, so fetch blobs for the
        # rows that matched everything checkable so far, best first.
        rows.sort(key=lambda r: (len(r["missing"]), -len(r["matched"])))
        to_fetch = [r for r in rows[:MAX_BLOB_FETCH]]
        if len(rows) > MAX_BLOB_FETCH:
            sampled = True
        blobs = get_run_blobs([r["run_hash"] for r in to_fetch])
        for r in rows:
            blob = blobs.get(r["run_hash"])
            if blob is None:
                r["missing"] |= {f"event:{e}" for e in events}
                if ancient_relic:
                    r["missing"].add(f"ancient:{ancient_relic}")
                continue
            m, mi = _blob_matches(blob, events, ancient_relic, ancient_act)
            r["matched"] |= m
            r["missing"] |= mi

    total = doc_total + blob_total
    rows.sort(
        key=lambda r: (len(r["missing"]), -len(r["matched"]), not r["win"]),
    )
    out = []
    for r in rows[:limit]:
        out.append(
            {
                **r,
                "matched": sorted(r["matched"]),
                "missing": sorted(r["missing"]),
                "full_match": not r["missing"],
                "url": f"/runs/{r['run_hash']}",
            }
        )
    return {
        "sampled": sampled,
        "scanned": scanned,
        "predicates": total,
        "results": out,
    }
