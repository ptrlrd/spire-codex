"""Build the full-corpus run export once a day from the lake's staging pages.

The unbounded /api/exports/runs used to stream every run blob out of Mongo
on the serving box on demand; one client pulling it thirty times a day put
the box into swap. The dump is now built here, off the serving box, from the
staging pages the extract already wrote, and published with the other serve
artifacts so nginx can hand it out as a static file.

Each line is the raw run blob plus run_hash and player_token, the same shape
as a paged export line. Hidden and deleted runs are left out via the
excluded sidecar; the _meta envelope never leaves this box.
"""

import gzip
import hashlib
import json
import os
import pathlib
import sys
import time

sys.path.insert(0, "/app")

LAKE = pathlib.Path(os.environ.get("LAKE_DIR", "/lake"))
STAGING = LAKE / "staging"
DUMP_NAME = "runs_export.jsonl.gz"
MANIFEST_NAME = "runs_export.json"
MIN_AGE_SECONDS = 20 * 3600


def _excluded() -> set[str]:
    path = LAKE / "excluded_current.jsonl.gz"
    if not path.exists():
        return set()
    out: set[str] = set()
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            try:
                out.add(json.loads(line)["run_hash"])
            except Exception:
                continue
    return out


def _sha256(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def export_line(obj: dict, token_for) -> str | None:
    """One export line from one staging line, or None when the run is not
    exportable. The staging _meta carries what player_token needs and
    nothing of it is written out."""
    meta = obj.pop("_meta", None) or {}
    if meta.get("hidden") or meta.get("deleted"):
        return None
    obj["player_token"] = token_for(
        {"username": meta.get("username"), "user_id": meta.get("user_id")}
    )
    return json.dumps(obj, separators=(",", ":"))


def fresh(now: float | None = None) -> bool:
    path = LAKE / DUMP_NAME
    if not path.exists():
        return False
    return (now or time.time()) - path.stat().st_mtime < MIN_AGE_SECONDS


def build(force: bool = False) -> dict | None:
    """Write the dump and its manifest; None when the current one is still
    younger than a day and force is off."""
    if not force and fresh():
        return None
    from app.services.player_token import player_token

    pages = sorted(STAGING.glob("[0-9]*.jsonl.gz"))
    if not pages:
        raise RuntimeError("no staging pages under %s" % STAGING)
    skip = _excluded()
    seen: set[str] = set()
    tmp = LAKE / (DUMP_NAME + ".tmp")
    t0 = time.time()
    written = 0
    with gzip.open(tmp, "wt", encoding="utf-8", compresslevel=6) as out:
        for page in pages:
            with gzip.open(page, "rt", encoding="utf-8") as f:
                for raw in f:
                    try:
                        obj = json.loads(raw)
                    except Exception:
                        continue
                    h = obj.get("run_hash")
                    if not h or h in seen or h in skip:
                        continue
                    line = export_line(obj, player_token)
                    if line is None:
                        continue
                    seen.add(h)
                    out.write(line)
                    out.write("\n")
                    written += 1
    tmp.replace(LAKE / DUMP_NAME)
    final = LAKE / DUMP_NAME
    manifest = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "runs": written,
        "bytes": final.stat().st_size,
        "sha256": _sha256(final),
        "build_seconds": round(time.time() - t0, 1),
    }
    (LAKE / MANIFEST_NAME).write_text(json.dumps(manifest, indent=1))
    return manifest


if __name__ == "__main__":
    out = build(force="--force" in sys.argv)
    print(out or "runs export still fresh, not rebuilt", flush=True)
