"""Semantic entity search over Workers AI bge-m3 embeddings.

Vectors come from `python -m scripts.build_embeddings` (data/embeddings/);
queries embed at request time via Workers AI (WORKERS_AI_TOKEN +
CF_ACCOUNT_ID env) with a Redis cache in front. Unavailable (no files or
no token) degrades to None and the search UI simply shows no semantic
section.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import logging
import os
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

_EMB_DIR = (
    Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data"))
    / "embeddings"
)
_META_PATH = _EMB_DIR / "entities.json.gz"
_VECS_PATH = _EMB_DIR / "entities.f32"
_MODEL = "@cf/baai/bge-m3"
_DIMS = 1024

_lock = threading.Lock()
_meta: list[dict] | None = None
_mat = None


def _creds() -> tuple[str, str] | None:
    token = os.environ.get("WORKERS_AI_TOKEN", "").strip()
    account = os.environ.get("CF_ACCOUNT_ID", "").strip()
    return (account, token) if token and account else None


def available() -> bool:
    return _creds() is not None and _META_PATH.exists() and _VECS_PATH.exists()


def _load() -> bool:
    global _meta, _mat
    if _mat is not None:
        return True
    with _lock:
        if _mat is not None:
            return True
        try:
            import numpy as np

            meta = json.loads(gzip.open(_META_PATH, "rt", encoding="utf-8").read())
            mat = np.fromfile(_VECS_PATH, dtype=np.float32).reshape(len(meta), _DIMS)
            norms = np.linalg.norm(mat, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            _mat = mat / norms
            _meta = meta
            logger.info("semantic search: loaded %d entity vectors", len(meta))
            return True
        except Exception:
            logger.warning("semantic search: failed to load vectors", exc_info=True)
            return False


def embed_texts(texts: list[str]) -> list[list[float]] | None:
    creds = _creds()
    if not creds:
        return None
    account, token = creds
    import httpx

    resp = httpx.post(
        f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{_MODEL}",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": texts},
        timeout=10.0,
    )
    resp.raise_for_status()
    body = resp.json()
    if not body.get("success"):
        raise RuntimeError(f"workers ai error: {body.get('errors')}")
    return body["result"]["data"]


def _embed_query(q: str) -> list[float] | None:
    from . import cache

    key = f"semq:{hashlib.sha1(q.lower().encode()).hexdigest()}"
    cached = cache.get_json(key)
    if cached is not None:
        return cached
    try:
        vecs = embed_texts([q])
    except Exception:
        logger.warning("semantic search: query embed failed", exc_info=True)
        return None
    if not vecs:
        return None
    cache.set_json(key, vecs[0], ttl_seconds=7 * 24 * 3600)
    return vecs[0]


def search(q: str, limit: int = 12) -> list[dict] | None:
    """Top entities by cosine similarity, or None when unavailable."""
    if not available() or not _load():
        return None
    vec = _embed_query(q)
    if vec is None:
        return None
    import numpy as np

    v = np.asarray(vec, dtype=np.float32)
    n = np.linalg.norm(v)
    if n == 0:
        return None
    v = v / n
    scores = _mat @ v
    limit = max(1, min(limit, 30))
    idx = np.argpartition(-scores, min(limit, len(scores) - 1))[:limit]
    idx = idx[np.argsort(-scores[idx])]
    out = []
    for i in idx:
        m = _meta[int(i)]
        out.append(
            {
                "etype": m["etype"],
                "id": m["id"],
                "name": m["name"],
                "score": round(float(scores[int(i)]), 4),
            }
        )
    return out
