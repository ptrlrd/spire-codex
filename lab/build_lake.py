"""Staging pages -> the parquet lake, parsing only what changed.

Every page is parsed once by build_page.sql into /lake/parts/<page>/ and
kept. A cycle parses the pages that are new or changed (by size and mtime),
drops the output of pages that are gone, then build.sql reassembles the
single-file tables every reader uses. Editing build_page.sql reparses every
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


def _stem(page: pathlib.Path) -> str:
    return page.name.split(".")[0]


def _key(page: pathlib.Path) -> dict:
    st = page.stat()
    return {"size": st.st_size, "mtime_ns": st.st_mtime_ns}


def _save(path: pathlib.Path, manifest: dict) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(manifest, indent=1))
    tmp.replace(path)


def build(con, lake: pathlib.Path = LAKE) -> dict:
    lake = pathlib.Path(lake)
    pages = sorted((lake / "staging").glob("[0-9]*.jsonl.gz"))
    if not pages:
        raise RuntimeError(f"no staging pages under {lake / 'staging'}")
    parts = lake / "parts"
    parts.mkdir(exist_ok=True)
    for tmp in parts.glob(".*.tmp"):
        shutil.rmtree(tmp, ignore_errors=True)

    template = (LAB / "build_page.sql").read_text()
    fmt = hashlib.sha256(template.encode()).hexdigest()
    manifest_path = parts / "manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text())
    except (OSError, ValueError):
        manifest = {}
    if manifest.get("format") != fmt:
        manifest = {"format": fmt, "pages": {}}
    done = manifest["pages"]

    live = {_stem(p) for p in pages}
    for d in parts.iterdir():
        if d.is_dir() and d.name not in live:
            shutil.rmtree(d, ignore_errors=True)
    for stem in [s for s in done if s not in live]:
        done.pop(stem)

    t0 = time.time()
    parsed = 0
    for page in pages:
        stem, key = _stem(page), _key(page)
        final = parts / stem
        if done.get(stem) == key and final.is_dir():
            continue
        started = time.time()
        tmp = parts / f".{stem}.tmp"
        tmp.mkdir()
        con.execute(template.replace("__SRC__", str(page)).replace("__OUT__", str(tmp)))
        shutil.rmtree(final, ignore_errors=True)
        tmp.rename(final)
        done[stem] = key
        _save(manifest_path, manifest)
        parsed += 1
        print(f"page {stem} parsed in {time.time() - started:.0f}s", flush=True)
    t_parse = time.time()

    sql = (LAB / "build.sql").read_text()
    if lake != LAKE:
        sql = sql.replace("'/lake/", f"'{lake}/")
    con.execute(sql)
    return {
        "pages": len(pages),
        "parsed": parsed,
        "parse_seconds": round(t_parse - t0, 1),
        "assemble_seconds": round(time.time() - t_parse, 1),
    }


if __name__ == "__main__":
    import duckdb

    con = duckdb.connect(str(LAKE / "build.duckdb"))
    con.execute(
        f"SET memory_limit='{os.environ.get('LAKE_BUILD_MEMORY', '') or '3500MB'}'"
    )
    con.execute("SET threads=5")
    con.execute(f"SET temp_directory='{LAKE / 'tmp'}'")
    con.execute("SET preserve_insertion_order=false")
    print(build(con), flush=True)
