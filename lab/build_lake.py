"""Staging pages -> the parquet lake, parsing only what changed.

Every page is parsed once by build_page.sql, plus the flat per-seat tables
in floor_tables.sql, into /lake/parts/<page>/ and kept. A cycle parses the
pages that are new or changed, drops the output of pages that are gone,
reassembles the single-file tables every reader uses from the live pages'
parts, and lets build.sql rebuild the sidecar and per-user tables.
Reassembly keeps one copy of every run: a run that sits in two pages (a
re-upload or a reconcile rewrites it with a fresh submitted_at) keeps the
newest, and a run whose document is gone from Mongo is left out.
modded.parquet lists the runs that carry content the game never shipped.
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
    "party",
    "shop_items",
    "potion_events",
    "card_choices",
    "rest_choices",
    "upgrades",
    "event_choices",
)


GONE_GUARD_MIN_RUNS = 1000
GONE_GUARD_SHARE = 0.2


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


def _stale_rows(con, lake: pathlib.Path, runs: list[str]) -> tuple[int, int]:
    """Fills the temp table stale(run_hash, stem) with the page copies to
    leave out: every copy but the newest of a run that sits in more than
    one page, and every copy of a run whose document no longer exists. The
    scalars sidecar is the extractor's scan of every current document; a
    run submitted within an hour of the newest one it saw, or later, may
    just have missed the scan and is never treated as gone. A sidecar that
    is missing a fifth of the lake is a broken scan, not deletes, and stops
    the build."""
    con.execute(
        "CREATE OR REPLACE TEMP TABLE page_runs AS"
        " SELECT run_hash, submitted_at, split_part(filename, '/', -2) AS stem"
        f" FROM read_parquet({runs!r}, filename=true)"
    )
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE stale AS
        SELECT run_hash, stem FROM (
          SELECT run_hash, stem, row_number() OVER (PARTITION BY run_hash
            ORDER BY submitted_at DESC NULLS LAST, stem DESC) AS rn
          FROM page_runs
          WHERE run_hash IN (
            SELECT run_hash FROM page_runs GROUP BY 1 HAVING count(*) > 1)
        ) WHERE rn > 1
        """
    )
    duplicated = con.execute("SELECT count(*) FROM stale").fetchone()[0]
    gone = 0
    sidecar = lake / "run_scalars_current.jsonl.gz"
    if sidecar.exists():
        con.execute(
            "CREATE OR REPLACE TEMP TABLE docs AS SELECT DISTINCT run_hash"
            f" FROM read_ndjson('{sidecar}', columns={{run_hash: 'VARCHAR'}})"
        )
        con.execute(
            """
            INSERT INTO stale
            SELECT p.run_hash, p.stem FROM page_runs p
            ANTI JOIN docs d ON p.run_hash = d.run_hash
            ANTI JOIN stale s ON p.run_hash = s.run_hash AND p.stem = s.stem
            WHERE p.submitted_at <= (
              SELECT max(k.submitted_at) - INTERVAL 1 HOUR FROM page_runs k
              SEMI JOIN docs d2 ON k.run_hash = d2.run_hash)
            """
        )
        gone = con.execute("SELECT count(*) FROM stale").fetchone()[0] - duplicated
        con.execute("DROP TABLE docs")
        total = con.execute("SELECT count(*) FROM page_runs").fetchone()[0]
        if gone > max(GONE_GUARD_MIN_RUNS, total * GONE_GUARD_SHARE):
            raise RuntimeError(
                f"{gone} of {total} staged runs have no document in {sidecar.name};"
                " refusing to drop that many"
            )
    return duplicated, gone


def _assemble_sql(con, parts: pathlib.Path, live: list[str], table: str) -> str:
    """Every live page's rows of one table, minus the stale page copies.
    Pages without stale rows are read straight through."""
    dirty = {r[0] for r in con.execute("SELECT DISTINCT stem FROM stale").fetchall()}
    selects = []
    clean = [str(parts / s / f"{table}.parquet") for s in live if s not in dirty]
    if clean:
        selects.append(f"SELECT * FROM read_parquet({clean!r})")
    for stem in live:
        if stem in dirty:
            selects.append(
                f"SELECT t.* FROM read_parquet('{parts / stem / f'{table}.parquet'}') t"
                f" ANTI JOIN (SELECT run_hash FROM stale WHERE stem = '{stem}') s"
                " ON t.run_hash = s.run_hash"
            )
    return " UNION ALL ".join(selects)


def _official_ids() -> dict[str, list[str]] | None:
    """Official character, card and relic ids across main, the current beta
    and every archived version, or None when the catalogs cannot tell
    retired content from modded content (no archive, or an unreadable
    catalog). The caller then leaves every run in."""
    import sys

    if "/app" not in sys.path:
        sys.path.insert(0, "/app")
    try:
        from app.services import official_content
    except Exception as exc:
        print(f"WARNING: catalogs not importable ({exc})", flush=True)
        return None
    if not official_content.archived_versions():
        return None
    ids = {
        kind: sorted(official_content.official_ids(kind))
        for kind in ("characters", "cards", "relics")
    }
    return ids if all(ids.values()) else None


def _write_modded(con, nxt: pathlib.Path, official: dict | None) -> int | None:
    """modded.parquet: runs where any seat plays a character, or ended with
    a card or relic, that is in no official catalog. An id pattern cannot
    tell (ANGER_C and ALL_IN_RUNE are modded), so this is a set difference
    against the catalogs. Empty when the catalogs cannot be trusted."""
    out = f"'{nxt}/modded.parquet' (FORMAT parquet, COMPRESSION zstd)"
    if official is None:
        print(
            "WARNING: official catalogs unavailable; modded runs stay in",
            flush=True,
        )
        con.execute(
            f"COPY (SELECT NULL::VARCHAR AS run_hash, NULL::VARCHAR AS kind"
            f" WHERE false) TO {out}"
        )
        return None
    con.execute("CREATE OR REPLACE TEMP TABLE official_ids (kind VARCHAR, id VARCHAR)")
    for kind, ids in official.items():
        con.execute(
            "INSERT INTO official_ids SELECT ?, unnest(?::VARCHAR[])", [kind, ids]
        )
    party = f"read_parquet('{nxt}/party.parquet')"
    con.execute(
        f"""
        COPY (
          SELECT u.run_hash, min(u.kind) AS kind FROM (
            SELECT run_hash, 'characters' AS kind, unnest(characters) AS id
            FROM {party}
            UNION ALL
            SELECT run_hash, 'cards', unnest(cards) FROM {party}
            UNION ALL
            SELECT run_hash, 'relics', unnest(relics) FROM {party}
          ) u
          ANTI JOIN official_ids o ON u.kind = o.kind AND u.id = o.id
          WHERE u.id IS NOT NULL AND u.id <> ''
          GROUP BY 1
        ) TO {out}
        """
    )
    con.execute("DROP TABLE official_ids")
    return con.execute(
        f"SELECT count(*) FROM read_parquet('{nxt}/modded.parquet')"
    ).fetchone()[0]


def build(con, lake: pathlib.Path = LAKE, official: dict | None = None) -> dict:
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

    runs = [str(parts / s / "runs.parquet") for s in live]
    duplicated, gone = _stale_rows(con, lake, runs)
    if duplicated or gone:
        print(
            f"left out {duplicated} older page copies of rewritten runs and"
            f" {gone} runs whose document is gone",
            flush=True,
        )
    for table in TABLES:
        con.execute(
            f"COPY ({_assemble_sql(con, parts, live, table)})"
            f" TO '{nxt}/{table}.parquet' (FORMAT parquet, COMPRESSION zstd)"
        )
    con.execute("DROP TABLE stale")
    con.execute("DROP TABLE page_runs")
    con.execute(
        (LAB / "build.sql")
        .read_text()
        .replace("__LAKE__", str(lake))
        .replace("__NEXT__", str(nxt))
    )
    modded = _write_modded(con, nxt, official or _official_ids())
    for f in sorted(nxt.iterdir()):
        os.replace(f, lake / f.name)
    nxt.rmdir()
    return {
        "pages": len(pages),
        "parsed": parsed,
        "shared_runs": duplicated,
        "gone_runs": gone,
        "modded_runs": modded,
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
