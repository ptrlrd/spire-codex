"""Build the full-corpus run export once a day from the lake's staging pages.

The unbounded /api/exports/runs used to stream every run blob out of Mongo
on the serving box on demand; one client pulling it thirty times a day put
the box into swap. The dump is now built here, off the serving box, from the
staging pages the extract already wrote, and published with the other serve
artifacts so nginx can hand it out as a static file.

Each line is the raw run blob plus run_hash and player_token, the same shape
as a paged export line. The same pass splits the corpus into one file per
game version under exports_by_version/ (runs_<build_id>.jsonl.gz) so a
single patch is a static download too. Hidden and deleted runs are left out
via the excluded sidecar; the _meta envelope never leaves this box.
"""

import gzip
import hashlib
import json
import os
import pathlib
import re
import sys
import time

sys.path.insert(0, "/app")

LAKE = pathlib.Path(os.environ.get("LAKE_DIR", "/lake"))
STAGING = LAKE / "staging"
DUMP_NAME = "runs_export.jsonl.gz"
MANIFEST_NAME = "runs_export.json"
VERSION_DIR = "exports_by_version"
VERSION_RE = re.compile(r"^v\d+(\.\d+)*(-rc\.\d+)?$")
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


def _version_sort_key(vid: str) -> tuple:
    """Natural version order: v0.111.0 > v0.111.0-rc.2 > v0.110.9."""
    base, _, rc = vid.partition("-rc.")
    nums = tuple(int(n) for n in base[1:].split("."))
    return nums + ((0, int(rc)) if rc else (1,))


def _version_entry(vdir: pathlib.Path, vid: str, runs: int) -> dict:
    path = vdir / f"runs_{vid}.jsonl.gz"
    return {
        "runs": runs,
        "bytes": path.stat().st_size,
        "sha256": _sha256(path),
        "url": f"/exports/runs-{vid}.jsonl.gz",
    }


def build(force: bool = False) -> dict | None:
    """Write the dump, the per-version splits and the manifest; None when the
    current one is still younger than a day and force is off."""
    if not force and fresh():
        return None
    from app.services.player_token import player_token

    pages = sorted(STAGING.glob("[0-9]*.jsonl.gz"))
    if not pages:
        raise RuntimeError("no staging pages under %s" % STAGING)
    skip = _excluded()
    seen: set[str] = set()
    tmp = LAKE / (DUMP_NAME + ".tmp")
    vdir = LAKE / VERSION_DIR
    vdir.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    written = 0
    per_version: dict[str, int] = {}
    outs: dict[str, gzip.GzipFile] = {}
    try:
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
                        vid = str(obj.get("build_id") or "").strip()
                        if vid and VERSION_RE.match(vid):
                            vout = outs.get(vid)
                            if vout is None:
                                vout = gzip.open(
                                    vdir / f"runs_{vid}.jsonl.gz.tmp",
                                    "wt",
                                    encoding="utf-8",
                                    compresslevel=6,
                                )
                                outs[vid] = vout
                            vout.write(line)
                            vout.write("\n")
                            per_version[vid] = per_version.get(vid, 0) + 1
    finally:
        for vout in outs.values():
            vout.close()
    tmp.replace(LAKE / DUMP_NAME)
    final = LAKE / DUMP_NAME
    for vid in per_version:
        (vdir / f"runs_{vid}.jsonl.gz.tmp").replace(vdir / f"runs_{vid}.jsonl.gz")
    for stale in vdir.glob("runs_*.jsonl.gz"):
        if stale.name[len("runs_") : -len(".jsonl.gz")] not in per_version:
            stale.unlink()
    manifest = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "runs": written,
        "bytes": final.stat().st_size,
        "sha256": _sha256(final),
        "build_seconds": round(time.time() - t0, 1),
        "versions": {
            vid: _version_entry(vdir, vid, per_version[vid])
            for vid in sorted(per_version, key=_version_sort_key, reverse=True)
        },
    }
    (LAKE / MANIFEST_NAME).write_text(json.dumps(manifest, indent=1))
    return manifest


if __name__ == "__main__":
    out = build(force="--force" in sys.argv)
    print(out or "runs export still fresh, not rebuilt", flush=True)
