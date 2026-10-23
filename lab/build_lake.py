"""Staging pages -> the parquet lake, parsing only what changed.

Every page is parsed once by build_page.sql, plus the flat per-seat tables
in floor_tables.sql, into /lake/parts/<page>/ and kept. A cycle parses the
pages that are new or changed, drops the output of pages that are gone,
reassembles the single-file tables every reader uses from the live pages'
parts, and lets build.sql rebuild the sidecar and per-user tables.
Everything is written to /lake/.next first and moved into the lake only
after every statement succeeded. Editing either SQL file reparses every
page on the next cycle.

    docker compose -f docker-compose.prod.yml run --rm --entrypoint python \
        lake-ingest /lab/build_lake.py
"""

import hashlib
import json
import os
import pathlib
import shutil
import time

LAB = pathlib.Path(__file__).resolve().parent
LAKE = pathlib.Path("/lake")

TABLES = (
    "runs",
    "floor_events",
    "deck",
    "floors",
    "players",
    "relic_choices",
    "potions",
    "shop_potions",
    "relics_removed",
    "relics",
    "shop_items",
    "potion_events",
    "card_choices",
    "rest_choices",
    "upgrades",
    "event_choices",
)


def _stem(page: pathlib.Path) -> str:
    return page.name.split(".")[0]


def _key(page: pathlib.Path) -> dict:
    """Size, mtime and the gzip trailer (CRC32 and length of the
    uncompressed content), so a rewrite that keeps size and mtime still
    reads as changed without hashing the whole page."""
    st = page.stat()
    with open(page, "rb") as f:
        f.seek(max(0, st.st_size - 8))
        tail = f.read(8).hex()
    return {"size": st.st_size, "mtime_ns": st.st_mtime_ns, "tail": tail}


def _save(path: pathlib.Path, manifest: dict) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(manifest, indent=1))
    tmp.replace(path)


def _load_manifest(path: pathlib.Path, fmt: str) -> dict:
    try:
        manifest = json.loads(path.read_text())
    except (OSError, ValueError):
        manifest = None
    if (
        not isinstance(manifest, dict)
        or manifest.get("format") != fmt
        or not isinstance(manifest.get("pages"), dict)
    ):
        manifest = {"format": fmt, "pages": {}}
    return manifest


def build(con, lake: pathlib.Path = LAKE) -> dict:
    lake = pathlib.Path(lake)
    pages = sorted((lake / "staging").glob("[0-9]*.jsonl.gz"))
    if not pages:
        raise RuntimeError(f"no staging pages under {lake / 'staging'}")
    live = [_stem(p) for p in pages]
    parts = lake / "parts"
    parts.mkdir(exist_ok=True)
    nxt = lake / ".next"
    if nxt.exists():
        shutil.rmtree(nxt)
    nxt.mkdir()

    template = (LAB / "build_page.sql").read_text()
    floor_tables = (LAB / "floor_tables.sql").read_text()
    manifest_path = parts / "manifest.json"
    manifest = _load_manifest(
        manifest_path, hashlib.sha256((template + floor_tables).encode()).hexdigest()
    )
    done = manifest["pages"]
    removed = False
    for d in parts.iterdir():
        if d.is_dir() and d.name not in live:
            shutil.rmtree(d)
            removed = True
    for stem in [s for s in done if s not in live]:
        done.pop(stem)
        removed = True
    if removed:
        _save(manifest_path, manifest)

    t0 = time.time()
    parsed = 0
    for page in pages:
        stem, key = _stem(page), _key(page)
        final = parts / stem
        if done.get(stem) == key and all(
            (final / f"{t}.parquet").is_file() for t in TABLES
        ):
            continue
        started = time.time()
        tmp = parts / f".{stem}.tmp"
        tmp.mkdir()
        con.execute(template.replace("__SRC__", str(page)).replace("__OUT__", str(tmp)))
        con.execute(floor_tables.replace("__OUT__", str(tmp)))
        if final.exists():
            shutil.rmtree(final)
        tmp.rename(final)
        done[stem] = key
        _save(manifest_path, manifest)
        parsed += 1
        print(f"page {stem} parsed in {time.time() - started:.0f}s", flush=True)
    t_parse = time.time()

    for table in TABLES:
        files = [str(parts / s / f"{table}.parquet") for s in live]
        con.execute(
            f"COPY (SELECT * FROM read_parquet({files!r}))"
            f" TO '{nxt}/{table}.parquet' (FORMAT parquet, COMPRESSION zstd)"
        )
    runs = [str(parts / s / "runs.parquet") for s in live]
    shared = con.execute(
        f"SELECT count(*) FROM (SELECT run_hash FROM read_parquet({runs!r},"
        " filename=true) GROUP BY 1 HAVING count(DISTINCT filename) > 1)"
    ).fetchone()[0]
    if shared:
        print(
            f"WARNING: {shared} run_hash values appear in more than one page;"
            " their floor numbers and relic rows can differ from one pass"
            " over every page",
            flush=True,
        )
    con.execute(
        (LAB / "build.sql")
        .read_text()
        .replace("__LAKE__", str(lake))
        .replace("__NEXT__", str(nxt))
    )
    for f in sorted(nxt.iterdir()):
        os.replace(f, lake / f.name)
    nxt.rmdir()
    return {
        "pages": len(pages),
        "parsed": parsed,
        "shared_runs": shared,
        "parse_seconds": round(t_parse - t0, 1),
        "assemble_seconds": round(time.time() - t_parse, 1),
    }


if __name__ == "__main__":
    import fcntl
    import sys

    import duckdb

    lock = open(LAKE / "ingest.lock", "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print("an ingest holds /lake/ingest.lock; exiting", flush=True)
        sys.exit(1)
    con = duckdb.connect(str(LAKE / "build.duckdb"))
    con.execute(
        f"SET memory_limit='{os.environ.get('LAKE_BUILD_MEMORY', '') or '3500MB'}'"
    )
    con.execute("SET threads=5")
    con.execute(f"SET temp_directory='{LAKE / 'tmp'}'")
    con.execute("SET preserve_insertion_order=false")
    print(build(con), flush=True)
