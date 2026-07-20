"""Run-composition vectors: nightly per-character shards for similar-run lookups."""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_VEC_DIR = (
    Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data"))
    / "vectors"
)

_OFFICIAL_CHARACTERS = ("IRONCLAD", "SILENT", "DEFECT", "NECROBINDER", "REGENT")

_lock = threading.Lock()
_vocab: dict[str, int] | None = None
_vocab_mtime: float = 0.0
_shards: dict[str, tuple[Any, dict]] = {}


def available() -> bool:
    return (_VEC_DIR / "vocab.json").exists()


def _build_vocab() -> list[str]:
    from . import data_service

    cards = {str(c.get("id", "")).upper() for c in data_service.load_cards("eng")}
    relics = {
        f"R:{str(r.get('id', '')).upper()}" for r in data_service.load_relics("eng")
    }
    return sorted(cards - {""}) + sorted(relics - {"R:"})


def _row_terms(deck: list, relics: list) -> dict[str, float]:
    import math

    counts: dict[str, int] = {}
    for c in deck or []:
        cid = str((c or {}).get("id", "")).upper()
        if cid:
            counts[cid] = counts.get(cid, 0) + 1
    terms = {cid: math.log1p(n) for cid, n in counts.items()}
    for r in relics or []:
        rid = str((r or {}).get("id", "")).upper()
        if rid:
            terms[f"R:{rid}"] = 1.0
    return terms


def build_run_vectors() -> dict:
    import numpy as np
    from scipy import sparse

    from .runs_db_mongo import _get_collection

    t0 = time.time()
    vocab_list = _build_vocab()
    index = {term: i for i, term in enumerate(vocab_list)}
    coll = _get_collection()
    cursor = coll.find(
        {
            "hidden": {"$ne": True},
            "ascension": {"$gte": 0, "$lte": 10},
            "player_count": 1,
            "character": {"$in": list(_OFFICIAL_CHARACTERS)},
        },
        {
            "_id": 1,
            "character": 1,
            "win": 1,
            "ascension": 1,
            "run_time": 1,
            "username": 1,
            "submitted_at": 1,
            "build_id": 1,
            "deck.id": 1,
            "relics.id": 1,
        },
    )
    from array import array

    per_char: dict[str, dict] = {
        ch: {"rows": array("i"), "cols": array("i"), "vals": array("f"), "meta": []}
        for ch in _OFFICIAL_CHARACTERS
    }
    for doc in cursor:
        ch = doc.get("character")
        acc = per_char.get(ch)
        if acc is None:
            continue
        terms = _row_terms(doc.get("deck"), doc.get("relics"))
        pairs = [(index[t], v) for t, v in terms.items() if t in index]
        if not pairs:
            continue
        row = len(acc["meta"])
        for col, val in pairs:
            acc["rows"].append(row)
            acc["cols"].append(col)
            acc["vals"].append(val)
        sub = doc.get("submitted_at")
        acc["meta"].append(
            {
                "hash": doc["_id"],
                "win": 1 if doc.get("win") else 0,
                "asc": int(doc.get("ascension") or 0),
                "time": int(doc.get("run_time") or 0),
                "user": doc.get("username"),
                "date": sub.strftime("%Y-%m-%d")
                if hasattr(sub, "strftime")
                else str(sub or "")[:10],
                "ver": doc.get("build_id"),
            }
        )

    _VEC_DIR.mkdir(parents=True, exist_ok=True)
    total = 0
    archetypes: dict[str, list] = {}
    for ch, acc in per_char.items():
        n = len(acc["meta"])
        if n == 0:
            continue
        mat = sparse.csr_matrix(
            (
                np.asarray(acc["vals"], dtype=np.float32),
                (
                    np.asarray(acc["rows"], dtype=np.int32),
                    np.asarray(acc["cols"], dtype=np.int32),
                ),
            ),
            shape=(n, len(vocab_list)),
        )
        norms = sparse.linalg.norm(mat, axis=1)
        norms[norms == 0] = 1.0
        mat = sparse.diags(1.0 / norms).dot(mat).tocsr()
        # Raw .npy components instead of one .npz: workers reload them with
        # mmap_mode="r", so all four share a single page-cache copy.
        np.save(_VEC_DIR / f"{ch}_vdata.npy", mat.data.astype(np.float32))
        np.save(_VEC_DIR / f"{ch}_vindices.npy", mat.indices.astype(np.int32))
        np.save(_VEC_DIR / f"{ch}_vindptr.npy", mat.indptr.astype(np.int32))
        m = acc["meta"]
        np.savez(
            _VEC_DIR / f"{ch}_meta.npz",
            hash=np.array([r["hash"] for r in m], dtype="S24"),
            win=np.array([r["win"] for r in m], dtype=np.uint8),
            asc=np.array([r["asc"] for r in m], dtype=np.int8),
            time=np.array([r["time"] for r in m], dtype=np.int32),
            user=np.array([r["user"] or "" for r in m], dtype="S32"),
            date=np.array([r["date"] for r in m], dtype="S10"),
            ver=np.array([r.get("ver") or "" for r in m], dtype="S16"),
        )
        total += n
        k = max(4, min(14, n // 3000))
        if n >= 200 and k >= 2:
            try:
                clusters, _labels, dists, centers = _cluster_shard(
                    ch, mat, acc["meta"], vocab_list, k
                )
                np.save(_VEC_DIR / f"{ch}_dists.npy", dists)
                np.save(_VEC_DIR / f"{ch}_centroids.npy", centers)
                archetypes[ch] = clusters
            except Exception:
                logger.warning("archetype clustering failed for %s", ch, exc_info=True)
    if archetypes:
        (_VEC_DIR / "archetypes.json").write_text(
            json.dumps(
                {
                    "characters": archetypes,
                    "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
            ),
            encoding="utf-8",
        )
    tmp = _VEC_DIR / "vocab.json.tmp"
    tmp.write_text(
        json.dumps(
            {
                "terms": vocab_list,
                "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
        ),
        encoding="utf-8",
    )
    tmp.replace(_VEC_DIR / "vocab.json")
    with _lock:
        _shards.clear()
        global _vocab
        _vocab = None
    logger.info(
        "run vectors built: %d solo runs across %d characters in %.0fs",
        total,
        sum(1 for a in per_char.values() if a["meta"]),
        time.time() - t0,
    )
    return {"runs": total, "seconds": round(time.time() - t0)}


def _load_vocab() -> dict[str, int] | None:
    global _vocab, _vocab_mtime
    path = _VEC_DIR / "vocab.json"
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return None
    with _lock:
        if _vocab is not None and mtime == _vocab_mtime:
            return _vocab
        data = json.loads(path.read_text(encoding="utf-8"))
        _vocab = {t: i for i, t in enumerate(data.get("terms", []))}
        _vocab_mtime = mtime
        _shards.clear()
        return _vocab


def _load_shard(character: str):
    import numpy as np
    from scipy import sparse

    with _lock:
        hit = _shards.get(character)
        if hit is not None:
            return hit
    vocab = _load_vocab()
    if vocab is None:
        return None
    try:
        data = np.load(_VEC_DIR / f"{character}_vdata.npy", mmap_mode="r")
        indices = np.load(_VEC_DIR / f"{character}_vindices.npy", mmap_mode="r")
        indptr = np.load(_VEC_DIR / f"{character}_vindptr.npy", mmap_mode="r")
        mat = sparse.csr_matrix(
            (data, indices, indptr),
            shape=(len(indptr) - 1, len(vocab)),
            copy=False,
        )
        with np.load(_VEC_DIR / f"{character}_meta.npz") as z:
            meta = {k: z[k] for k in z.files}
    except OSError:
        return None
    with _lock:
        _shards[character] = (mat, meta)
    return mat, meta


def similar_runs(run_hash: str, limit: int = 5) -> dict | None:
    """Nearest winning solo decks to this run, plus the composition diff."""
    import numpy as np

    vocab = _load_vocab()
    if vocab is None:
        return None
    from .runs_db_mongo import _get_collection

    doc = _get_collection().find_one(
        {"$or": [{"_id": run_hash}, {"run_hash": run_hash}]},
        {"character": 1, "deck.id": 1, "relics.id": 1},
    )
    if not doc or doc.get("character") not in _OFFICIAL_CHARACTERS:
        return None
    loaded = _load_shard(doc["character"])
    if loaded is None:
        return None
    mat, meta = loaded
    terms = _row_terms(doc.get("deck"), doc.get("relics"))
    cols = [(vocab[t], v) for t, v in terms.items() if t in vocab]
    if not cols:
        return None
    q = np.zeros(mat.shape[1], dtype=np.float32)
    for c, v in cols:
        q[c] = v
    norm = float(np.linalg.norm(q))
    if norm == 0:
        return None
    q /= norm
    sims = mat.dot(q)
    order = np.argsort(sims)[::-1]
    items = []
    picked_rows: list[int] = []
    seen_hashes = {run_hash}
    for i in order:
        if len(items) >= limit or sims[i] <= 0:
            break
        ri = int(i)
        h = meta["hash"][ri].decode()
        if not meta["win"][ri] or h in seen_hashes:
            continue
        seen_hashes.add(h)
        picked_rows.append(ri)
        items.append(
            {
                "run_hash": h,
                "ascension": int(meta["asc"][ri]),
                "run_time": int(meta["time"][ri]),
                "username": meta["user"][ri].decode() or None,
                "date": meta["date"][ri].decode(),
                "build_id": meta["ver"][ri].decode() or None,
                "similarity": round(float(sims[i]) * 100, 1),
            }
        )
    own_terms = set(terms)
    counts: dict[str, int] = {}
    inv = {i: t for t, i in vocab.items()}
    for row in picked_rows:
        start, end = int(mat.indptr[row]), int(mat.indptr[row + 1])
        for c in mat.indices[start:end]:
            term = inv[int(c)]
            if term not in own_terms:
                counts[term] = counts.get(term, 0) + 1
    threshold = max(2, (len(items) + 1) // 2)
    skip = _nondraftable()
    also = sorted(
        ((t, n) for t, n in counts.items() if n >= threshold and t not in skip),
        key=lambda tn: -tn[1],
    )[:6]
    winners_also_took = [
        {
            "id": t[2:] if t.startswith("R:") else t,
            "etype": "relics" if t.startswith("R:") else "cards",
            "count": n,
        }
        for t, n in also
    ]
    return {
        "character": doc["character"],
        "items": items,
        "winners_also_took": winners_also_took,
        "neighbors": len(items),
        "archetype": match_archetype(
            doc["character"], doc.get("deck"), doc.get("relics")
        ),
    }


def _spherical_kmeans(mat, k: int, iters: int = 25, seed: int = 0):
    import numpy as np

    rng = np.random.default_rng(seed)
    n = mat.shape[0]
    first = int(rng.integers(n))
    centroid_rows = [first]
    sims = mat.dot(mat[first].T.toarray().ravel())
    for _ in range(k - 1):
        d = 1.0 - sims
        d = np.clip(d, 0, None) ** 2
        total = float(d.sum())
        if total <= 0:
            centroid_rows.append(int(rng.integers(n)))
            continue
        pick = int(rng.choice(n, p=d / total))
        centroid_rows.append(pick)
        sims = np.maximum(sims, mat.dot(mat[pick].T.toarray().ravel()))
    centers = mat[centroid_rows].toarray()
    labels = None
    for _ in range(iters):
        scores = mat.dot(centers.T)
        new_labels = np.asarray(scores.argmax(axis=1)).ravel()
        if labels is not None and (new_labels == labels).all():
            break
        labels = new_labels
        for j in range(k):
            members = mat[labels == j]
            if members.shape[0] == 0:
                continue
            c = np.asarray(members.mean(axis=0)).ravel()
            norm = np.linalg.norm(c)
            centers[j] = c / norm if norm > 0 else c
    dists = 1.0 - np.asarray(mat.dot(centers.T))[np.arange(n), labels]
    return labels, centers, dists


def _cluster_shard(character: str, mat, meta: list, vocab_list: list[str], k: int):
    vocab_index = {t: i for i, t in enumerate(vocab_list)}
    import numpy as np

    labels, centers, dists = _spherical_kmeans(mat, k)
    global_mean = np.asarray(mat.mean(axis=0)).ravel()
    wins = np.array([m["win"] for m in meta], dtype=np.int32)
    vers = [m.get("ver") or "" for m in meta]
    out = []
    kept_centers = []
    for j in range(k):
        mask = labels == j
        size = int(mask.sum())
        if size == 0:
            continue
        lift = centers[j] / (global_mean + 1e-6)
        lift[centers[j] < 0.02] = 0
        for term in _nondraftable():
            idx = vocab_index.get(term)
            if idx is not None:
                lift[idx] = 0
        top = np.argsort(lift)[::-1]
        cards, relics = [], []
        for idx in top:
            if lift[idx] <= 1.0 or (len(cards) >= 3 and len(relics) >= 2):
                break
            term = vocab_list[idx]
            if term.startswith("R:"):
                if len(relics) < 2:
                    relics.append(term[2:])
            elif len(cards) < 3:
                cards.append(term)
        member_idx = np.flatnonzero(mask)
        win_members = member_idx[wins[member_idx] == 1]
        pool = win_members if win_members.size else member_idx
        examples = pool[np.argsort(dists[pool])][:3]
        by_ver: dict[str, list[int]] = {}
        for i in member_idx:
            v = vers[int(i)]
            if not v:
                continue
            slot = by_ver.setdefault(v, [0, 0])
            slot[0] += 1
            slot[1] += int(wins[int(i)])
        out.append(
            {
                "character": character,
                "size": size,
                "wins": int(wins[mask].sum()),
                "win_rate": round(float(wins[mask].mean()) * 100, 1) if size else 0.0,
                "defining_cards": cards,
                "defining_relics": relics,
                "example_runs": [meta[int(i)]["hash"] for i in examples],
                "versions": by_ver,
            }
        )
        kept_centers.append(centers[j])
    order = sorted(range(len(out)), key=lambda i: -out[i]["size"])
    out = [out[i] for i in order]
    kept = np.array([kept_centers[i] for i in order], dtype=np.float32)
    return out, labels, dists, kept


def load_archetypes() -> dict | None:
    try:
        return json.loads((_VEC_DIR / "archetypes.json").read_text(encoding="utf-8"))
    except OSError:
        return None


def anomalous_runs(limit: int = 30) -> list[dict]:
    """Runs farthest from every archetype centroid: nothing else looks like them."""
    import numpy as np

    out: list[dict] = []
    for ch in _OFFICIAL_CHARACTERS:
        try:
            dists = np.load(_VEC_DIR / f"{ch}_dists.npy")
            with np.load(_VEC_DIR / f"{ch}_meta.npz") as z:
                hashes = z["hash"]
        except OSError:
            continue
        n = min(len(hashes), len(dists))
        for i in np.argsort(dists[:n])[::-1][:limit]:
            out.append(
                {
                    "run_hash": hashes[int(i)].decode(),
                    "distance": round(float(dists[int(i)]), 3),
                }
            )
    out.sort(key=lambda r: -r["distance"])
    return out[:limit]


def _query_vector(character: str, deck: list, relics: list):
    import numpy as np

    vocab = _load_vocab()
    if vocab is None:
        return None
    loaded = _load_shard(character)
    if loaded is None:
        return None
    mat, meta = loaded
    terms = _row_terms(deck, relics)
    q = np.zeros(mat.shape[1], dtype=np.float32)
    for t, v in terms.items():
        idx = vocab.get(t)
        if idx is not None:
            q[idx] = v
    norm = float(np.linalg.norm(q))
    if norm == 0:
        return None
    return q / norm, mat, meta, set(terms)


def match_archetype(character: str, deck: list, relics: list) -> dict | None:
    """Nearest archetype for a deck: the cluster dict plus match similarity."""
    import numpy as np

    arch = load_archetypes()
    clusters = ((arch or {}).get("characters") or {}).get(character)
    if not clusters:
        return None
    try:
        centers = np.load(_VEC_DIR / f"{character}_centroids.npy")
    except OSError:
        return None
    if centers.shape[0] != len(clusters):
        return None
    built = _query_vector(character, deck, relics)
    if built is None:
        return None
    q = built[0]
    sims = centers.dot(q)
    j = int(np.argmax(sims))
    total = sum(c["size"] for c in clusters) or 1
    c = clusters[j]
    return {
        "defining_cards": c["defining_cards"],
        "win_rate": c["win_rate"],
        "share": round(c["size"] / total * 100, 1),
        "similarity": round(float(sims[j]) * 100, 1),
    }


def deck_advisor(
    character: str, deck: list, relics: list, limit: int = 8
) -> list[dict] | None:
    """Most common cards/relics among the winning decks nearest this draft
    that the draft doesn't have yet, with the share of neighbors carrying each."""
    import numpy as np

    built = _query_vector(character, deck, relics)
    if built is None:
        return None
    q, mat, meta, own_terms = built
    sims = np.asarray(mat.dot(q))
    wins = meta["win"].astype(bool)
    win_idx = np.flatnonzero(wins & (sims > 0))
    if win_idx.size == 0:
        return []
    top = win_idx[np.argsort(sims[win_idx])[::-1][:150]]
    vocab = _load_vocab() or {}
    inv = {i: t for t, i in vocab.items()}
    counts: dict[str, int] = {}
    for row in top:
        start, end = mat.indptr[int(row)], mat.indptr[int(row) + 1]
        for c in mat.indices[start:end]:
            term = inv[int(c)]
            if term not in own_terms:
                counts[term] = counts.get(term, 0) + 1
    skip = _nondraftable()
    ranked = sorted(
        ((t, n) for t, n in counts.items() if t not in skip),
        key=lambda tn: -tn[1],
    )[:limit]
    n = int(top.size)
    return [
        {
            "id": t[2:] if t.startswith("R:") else t,
            "etype": "relics" if t.startswith("R:") else "cards",
            "support": round(cnt / n * 100, 1),
        }
        for t, cnt in ranked
    ]


def pick_coach(
    character: str,
    deck: list,
    relics: list,
    offer: list[str],
    target: str | None = None,
) -> dict | None:
    """Score offered cards by commitment delta toward a target archetype's
    centroid plus how many nearby winning decks carry them."""
    import numpy as np

    arch = load_archetypes()
    clusters = ((arch or {}).get("characters") or {}).get(character)
    if not clusters:
        return None
    try:
        centers = np.load(_VEC_DIR / f"{character}_centroids.npy")
    except OSError:
        return None
    if centers.shape[0] != len(clusters):
        return None
    built = _query_vector(character, deck, relics)
    if built is None:
        return None
    q, mat, meta, _own = built
    vocab = _load_vocab() or {}
    total = sum(c["size"] for c in clusters) or 1

    def _key(c: dict) -> str:
        return "+".join(sorted(c["defining_cards"][:2]))

    sims = centers.dot(q)
    candidates = sorted(
        (
            {
                "key": _key(c),
                "defining_cards": c["defining_cards"],
                "defining_relics": c["defining_relics"],
                "win_rate": c["win_rate"],
                "share": round(c["size"] / total * 100, 1),
                "similarity": round(float(sims[i]) * 100, 1),
            }
            for i, c in enumerate(clusters)
            if c["defining_cards"] or c["defining_relics"]
        ),
        key=lambda c: -c["similarity"],
    )[:5]

    t_idx = None
    if target:
        for i, c in enumerate(clusters):
            if _key(c) == target:
                t_idx = i
                break
    if t_idx is None:
        for i in np.argsort(sims)[::-1]:
            c = clusters[int(i)]
            if c["defining_cards"] or c["defining_relics"]:
                t_idx = int(i)
                break
    if t_idx is None:
        return None
    center = centers[t_idx]
    base_sim = float(center.dot(q))

    neigh = np.asarray(mat.dot(q))
    wins = meta["win"].astype(bool)
    win_idx = np.flatnonzero(wins & (neigh > 0))
    top = win_idx[np.argsort(neigh[win_idx])[::-1][:150]]
    n_top = int(top.size)
    offer_cols = {o: vocab.get(o) for o in offer}
    support = dict.fromkeys(offer, 0)
    for row in top:
        start, end = mat.indptr[int(row)], mat.indptr[int(row) + 1]
        row_cols = set(int(x) for x in mat.indices[start:end])
        for oid, ci in offer_cols.items():
            if ci is not None and ci in row_cols:
                support[oid] += 1

    offers = []
    for oid in offer:
        built2 = _query_vector(character, deck + [{"id": oid}], relics)
        delta = None
        if built2 is not None:
            delta = round((float(center.dot(built2[0])) - base_sim) * 100, 2)
        sup = round(support[oid] / n_top * 100, 1) if n_top else None
        score = max(0.0, delta or 0.0) * 10 + (sup or 0.0) * 0.5
        offers.append(
            {
                "id": oid,
                "commitment_delta": delta,
                "winner_support": sup,
                "coach_score": round(score, 1),
            }
        )
    offers.sort(key=lambda o: -o["coach_score"])

    tc = clusters[t_idx]
    return {
        "target": {
            "key": _key(tc),
            "locked": bool(target) and _key(tc) == target,
            "defining_cards": tc["defining_cards"],
            "defining_relics": tc["defining_relics"],
            "win_rate": tc["win_rate"],
            "share": round(tc["size"] / total * 100, 1),
            "similarity": round(float(sims[t_idx]) * 100, 1),
        },
        "candidates": candidates,
        "offers": offers,
    }


_nondraftable_cache: frozenset[str] | None = None


def _nondraftable() -> frozenset[str]:
    """Vocab terms that sit in ~every deck by default (Basic cards, Ascender's
    Bane, starter relics) — excluded from names/suggestions, never vectors."""
    global _nondraftable_cache
    if _nondraftable_cache is None:
        try:
            from . import data_service

            terms: set[str] = {"ASCENDERS_BANE"}
            for c in data_service.load_cards("eng"):
                if c.get("rarity_key") == "Basic" or c.get("rarity") == "Basic":
                    terms.add(str(c.get("id", "")).upper())
            for r in data_service.load_relics("eng"):
                if "Starter" in str(r.get("rarity") or ""):
                    terms.add(f"R:{str(r.get('id', '')).upper()}")
            _nondraftable_cache = frozenset(terms - {""})
        except Exception:
            logger.warning("nondraftable set load failed", exc_info=True)
            _nondraftable_cache = frozenset()
    return _nondraftable_cache


_alias_cache: tuple[float, dict] | None = None


def archetype_alias(defining_cards: list[str]) -> str | None:
    """Community name for a cluster signature from data/archetype_names.json."""
    global _alias_cache
    path = _VEC_DIR.parent / "archetype_names.json"
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return None
    if _alias_cache is None or _alias_cache[0] != mtime:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            _alias_cache = (
                mtime,
                {k: v for k, v in data.items() if not k.startswith("_")},
            )
        except Exception:
            _alias_cache = (mtime, {})
    key = "+".join(sorted(defining_cards[:2]))
    return _alias_cache[1].get(key)
