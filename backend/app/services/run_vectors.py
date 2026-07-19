"""Run-composition vectors: nightly per-character shards for similar-run lookups."""

from __future__ import annotations

import gzip
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
    per_char: dict[str, dict[str, list]] = {
        ch: {"rows": [], "cols": [], "vals": [], "meta": []}
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
    for ch, acc in per_char.items():
        n = len(acc["meta"])
        if n == 0:
            continue
        mat = sparse.csr_matrix(
            (acc["vals"], (acc["rows"], acc["cols"])),
            shape=(n, len(vocab_list)),
            dtype=np.float32,
        )
        norms = sparse.linalg.norm(mat, axis=1)
        norms[norms == 0] = 1.0
        mat = sparse.diags(1.0 / norms).dot(mat).tocsr()
        sparse.save_npz(_VEC_DIR / f"{ch}.npz", mat)
        with gzip.open(_VEC_DIR / f"{ch}_meta.json.gz", "wt", encoding="utf-8") as f:
            json.dump(acc["meta"], f, ensure_ascii=False)
        total += n
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
    from scipy import sparse

    with _lock:
        hit = _shards.get(character)
        if hit is not None:
            return hit
    try:
        mat = sparse.load_npz(_VEC_DIR / f"{character}.npz")
        with gzip.open(
            _VEC_DIR / f"{character}_meta.json.gz", "rt", encoding="utf-8"
        ) as f:
            meta = json.load(f)
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
    seen_hashes = {run_hash}
    for i in order:
        if len(items) >= limit or sims[i] <= 0:
            break
        m = meta[int(i)]
        if not m["win"] or m["hash"] in seen_hashes:
            continue
        seen_hashes.add(m["hash"])
        items.append(
            {
                "run_hash": m["hash"],
                "ascension": m["asc"],
                "run_time": m["time"],
                "username": m["user"],
                "date": m["date"],
                "build_id": m.get("ver"),
                "similarity": round(float(sims[i]) * 100, 1),
            }
        )
    own_terms = set(terms)
    counts: dict[str, int] = {}
    hash_to_row = {m["hash"]: idx for idx, m in enumerate(meta)}
    inv = {i: t for t, i in vocab.items()}
    for it in items:
        row = hash_to_row.get(it["run_hash"])
        if row is None:
            continue
        start, end = mat.indptr[row], mat.indptr[row + 1]
        for c in mat.indices[start:end]:
            term = inv[int(c)]
            if term not in own_terms:
                counts[term] = counts.get(term, 0) + 1
    threshold = max(2, (len(items) + 1) // 2)
    also = sorted(
        ((t, n) for t, n in counts.items() if n >= threshold),
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
    }
