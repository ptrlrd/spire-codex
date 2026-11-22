"""Competitive pool stage: the runs the replay judge marked, folded per
bracket into /lake/competitive_store.json for /api/competitive.

Reads /lake/competitive_current.jsonl.gz, the sidecar extract.py refreshes
in full every cycle (a verdict changes when a replay is deleted, restored
or judged again). Only marked runs are touched, so this stays small.

    docker compose -f docker-compose.prod.yml run -d --rm --entrypoint python lake-ingest /lab/run_stage.py competitive_store
"""

import gzip
import json
import os
import pathlib
import sys
import time

sys.path.insert(0, "/app")

LAKE = pathlib.Path(os.environ.get("LAKE_DIR", "/lake"))
SIDECAR = "competitive_current.jsonl.gz"


def read_sidecar(path: pathlib.Path) -> tuple[list[dict], list[dict]]:
    marks, forfeits = [], []
    try:
        with gzip.open(path, "rt", encoding="utf-8") as f:
            for line in f:
                row = json.loads(line)
                (marks if row.get("run_hash") else forfeits).append(row)
    except OSError:
        pass
    return marks, forfeits


def _nondraftable() -> tuple[set[str], set[str]]:
    from app.services.run_vectors import _nondraftable as terms

    cards, relics = set(), set()
    for term in terms():
        (relics if term.startswith("R:") else cards).add(term.removeprefix("R:"))
    return cards, relics


def _rows(con, lake: str, marks: list[dict]) -> tuple[list[dict], list[tuple]]:
    from app.services.lake_stats import _unlisted_runs_sql
    from app.services.official_content import official_characters_sql
    from app.services.timeutil import pacific_date

    con.execute(
        "CREATE TEMP TABLE marks (run_hash VARCHAR, state VARCHAR, bracket VARCHAR)"
    )
    con.executemany(
        "INSERT INTO marks VALUES (?, ?, ?)",
        [(m["run_hash"], m.get("state"), m.get("bracket")) for m in marks],
    )
    p = lambda name: f"read_parquet('{lake}/{name}.parquet')"  # noqa: E731
    scalars = ""
    name = "r.username"
    if (pathlib.Path(lake) / "run_scalars.parquet").exists():
        scalars = f"LEFT JOIN {p('run_scalars')} s ON s.run_hash = r.run_hash"
        name = "coalesce(nullif(trim(s.username), ''), r.username)"
    con.execute(
        f"""CREATE TEMP TABLE pool AS
        SELECT r.run_hash, nullif(trim(r.user_id), '') AS user_id,
          nullif(trim({name}), '') AS username, r.character,
          coalesce(r.win, false) AS win, r.run_time,
          coalesce(r.played_at, r.submitted_at) AS played,
          m.state, m.bracket
        FROM {p("runs")} r
        JOIN marks m ON m.run_hash = r.run_hash
        {scalars}
        ANTI JOIN {_unlisted_runs_sql(lake)} x ON r.run_hash = x.run_hash
        WHERE r.character IN {official_characters_sql()}"""
    )
    cols = [
        "run_hash",
        "user_id",
        "username",
        "character",
        "win",
        "run_time",
        "played",
        "state",
        "bracket",
    ]
    runs = []
    for row in con.execute(f"SELECT {', '.join(cols)} FROM pool").fetchall():
        r = dict(zip(cols, row))
        day = pacific_date(r.pop("played"))
        r["day"] = day.isoformat() if day else None
        runs.append(r)
    cleared = "SEMI JOIN (SELECT run_hash FROM pool WHERE state = 'cleared') c"
    used = f"""SELECT DISTINCT run_hash, upper(potion) FROM {p("potions")}
        WHERE potion IS NOT NULL AND potion <> '' AND coalesce(was_used, false)"""
    if (pathlib.Path(lake) / "potion_events.parquet").exists():
        used = f"""SELECT DISTINCT run_hash, upper(potion) FROM {p("potion_events")}
        WHERE kind = 'used' AND potion IS NOT NULL AND potion <> ''"""
    members = con.execute(
        f"""SELECT DISTINCT d.run_hash, 'cards', upper(d.card) FROM {p("deck")} d
          {cleared} ON c.run_hash = d.run_hash
          WHERE d.card IS NOT NULL AND d.card <> ''
        UNION ALL
        SELECT DISTINCT d.run_hash, 'relics', upper(d.relic) FROM {p("relics")} d
          {cleared} ON c.run_hash = d.run_hash
          WHERE d.relic IS NOT NULL AND d.relic <> ''
        UNION ALL
        SELECT u.* FROM (SELECT run_hash, 'potions', id FROM ({used}) t(run_hash, id)) u
          {cleared} ON c.run_hash = u.run_hash"""
    ).fetchall()
    skip_cards, skip_relics = _nondraftable()
    members = [
        m
        for m in members
        if not (m[1] == "cards" and m[2] in skip_cards)
        and not (m[1] == "relics" and m[2] in skip_relics)
    ]
    return runs, members


def _name_forfeits(con, lake: str, forfeits: list[dict]) -> list[dict]:
    ids = sorted({f["user_id"] for f in forfeits if f.get("user_id")})
    if not ids:
        return forfeits
    con.execute("CREATE TEMP TABLE forfeit_users (user_id VARCHAR)")
    con.executemany("INSERT INTO forfeit_users VALUES (?)", [(i,) for i in ids])
    names = dict(
        con.execute(
            f"""SELECT r.user_id, arg_max(r.username, r.submitted_at)
            FROM read_parquet('{lake}/runs.parquet') r
            SEMI JOIN forfeit_users f ON f.user_id = r.user_id
            WHERE nullif(trim(r.username), '') IS NOT NULL GROUP BY 1"""
        ).fetchall()
    )
    return [{**f, "username": names.get(f.get("user_id"))} for f in forfeits]


def build(con=None) -> dict:
    import duckdb

    from app.services import competitive_store as store

    t0 = time.time()
    lake = str(LAKE)
    marks, forfeits = read_sidecar(LAKE / SIDECAR)
    own = con is None
    con = con or duckdb.connect()
    try:
        runs, members = _rows(con, lake, marks) if marks else ([], [])
        forfeits = _name_forfeits(con, lake, forfeits)
    finally:
        if own:
            con.close()
    out = store.fold(runs, members, forfeits)
    path = LAKE / store.STORE_NAME
    tmp = LAKE / f"{store.STORE_NAME}.{os.getpid()}.tmp"
    tmp.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    if path.exists():
        path.replace(LAKE / store.PREV_NAME)
    tmp.replace(path)
    return {
        "marked": len(marks),
        "runs": len(runs),
        "forfeits": len(forfeits),
        "bytes": path.stat().st_size,
        "seconds": round(time.time() - t0, 1),
    }


if __name__ == "__main__":
    print(f"competitive store: {build()}", flush=True)
