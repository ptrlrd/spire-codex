"""Embed the entity catalog with Workers AI and write data/embeddings/.
Needs WORKERS_AI_TOKEN + CF_ACCOUNT_ID. Rerun after each patch parse.

    python -m scripts.build_embeddings
"""

import gzip
import json
import os
import struct
import time
from pathlib import Path

TYPES = [
    "cards",
    "relics",
    "potions",
    "powers",
    "events",
    "enchantments",
    "monsters",
    "keywords",
]


def build_corpus(data_dir: Path) -> list[dict]:
    out = []
    for t in TYPES:
        path = data_dir / "eng" / f"{t}.json"
        if not path.exists():
            continue
        rows = json.load(open(path, encoding="utf-8"))
        if isinstance(rows, dict):
            rows = next(v for v in rows.values() if isinstance(v, list))
        for r in rows:
            if not isinstance(r, dict) or not r.get("id"):
                continue
            bits = [r.get("name") or str(r["id"])]
            for f in ("character", "type", "rarity", "pool"):
                v = r.get(f)
                if isinstance(v, str) and v:
                    bits.append(v)
            if r.get("cost") is not None:
                bits.append(f"cost {r['cost']}")
            desc = r.get("description") or r.get("desc") or ""
            if isinstance(desc, str) and desc:
                bits.append(desc)
            upg = r.get("upgrade_description") or r.get("upgraded_description")
            if isinstance(upg, str) and upg and upg != desc:
                bits.append("Upgraded: " + upg)
            text = ". ".join(b.strip() for b in bits if b and str(b).strip())[:1200]
            out.append(
                {
                    "etype": t,
                    "id": str(r["id"]),
                    "name": r.get("name") or str(r["id"]),
                    "text": text,
                }
            )
    return out


def main() -> int:
    from app.services.semantic_search import _DIMS, embed_texts

    data_dir = Path(os.environ.get("DATA_DIR", "data"))
    corpus = build_corpus(data_dir)
    if not corpus:
        print("no entities found")
        return 1
    print(f"{len(corpus)} entities to embed")
    vectors: list[list[float]] = []
    t0 = time.time()
    for i in range(0, len(corpus), 80):
        batch = [e["text"] for e in corpus[i : i + 80]]
        vecs = embed_texts(batch)
        if vecs is None:
            print("WORKERS_AI_TOKEN / CF_ACCOUNT_ID not set")
            return 1
        vectors.extend(vecs)
        print(f"{min(i + 80, len(corpus))}/{len(corpus)}", flush=True)
    out_dir = data_dir / "embeddings"
    out_dir.mkdir(parents=True, exist_ok=True)
    with gzip.open(out_dir / "entities.json.gz", "wt", encoding="utf-8") as f:
        json.dump(
            [{"etype": e["etype"], "id": e["id"], "name": e["name"]} for e in corpus],
            f,
        )
    with open(out_dir / "entities.f32", "wb") as f:
        for vec in vectors:
            if len(vec) != _DIMS:
                raise SystemExit(f"unexpected dims {len(vec)}")
            f.write(struct.pack(f"<{_DIMS}f", *vec))
    print(f"done: {len(vectors)} vectors -> {out_dir} in {time.time() - t0:.0f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
