"""Per-player stats tables for the profile: every account's own seats in
the cards, relics, potions, events, shops and campfires grids, with the
same floor-adjusted lift inputs the community grid uses.

One row per (user_id, character, ascension, version, players, kind, id,
sub) with additive counters, sorted by user_id so a profile read only
touches that account's row groups. Serving folds the rows that match the
profile filters, so lift stays exact under any filter combination:
lift = wins/xn - xs/xn over the seats that had an expectation.

A run belongs to the account that uploaded it. The seat is the only seat
of a solo run, or in co-op the seat whose player id appears in more of
that account's runs than any other (ties count no co-op seat).

    docker compose -f docker-compose.prod.yml run --rm --entrypoint python lake-ingest /lab/player_stats.py
"""

import os
import pathlib
import sys
import time

sys.path.insert(0, "/app")

LAKE = pathlib.Path(os.environ.get("LAKE_DIR", "/lake"))
OUT_NAME = "player_stats.parquet"
OFFICIAL = "('IRONCLAD','SILENT','DEFECT','NECROBINDER','REGENT')"
MIN_OWN_CURVE = 5


def _sql(lake: str) -> list[str]:
    from app.services.lake_stats import _excluded_runs_sql

    p = lambda name: f"read_parquet('{lake}/{name}.parquet')"  # noqa: E731
    exp = f"""
      CASE WHEN uc.n - 1 >= {MIN_OWN_CURVE} THEN (uc.w - s.win::INT) * 1.0 / (uc.n - 1)
           WHEN ca.n - 1 >= 1 THEN (ca.w - s.win::INT) * 1.0 / (ca.n - 1) END"""
    exp_join = """
      LEFT JOIN user_curve uc ON uc.user_id = s.user_id AND uc.a10 = s.a10
        AND uc.floor = least(greatest(coalesce(h.f, 1), 0), s.reached)
      LEFT JOIN comm_curve ca ON ca.a10 = s.a10
        AND ca.floor = least(greatest(coalesce(h.f, 1), 0), s.reached)"""
    dims = "s.user_id, s.character, s.ascension, s.version, s.players"
    held = f"""
      SELECT {dims}, '{{kind}}' AS kind, id, sub,
        count(*) AS n, count(*) FILTER (win) AS w,
        count(e) AS xn, count(*) FILTER (win AND e IS NOT NULL) AS xw,
        coalesce(sum(e), 0) AS xs, 0 AS offered, 0 AS taken
      FROM (
        SELECT s.*, h.id, h.sub, {exp} AS e
        FROM ({{source}}) h
        JOIN seats s ON h.run_hash = s.run_hash AND h.player_idx = s.player_idx
        {exp_join}
      ) s
      GROUP BY ALL"""
    return [
        f"""CREATE TEMP TABLE eligible AS
        SELECT r.run_hash, r.win, nullif(trim(r.user_id), '') AS user_id,
          coalesce(r.ascension, 0)::INT AS ascension,
          coalesce(r.ascension, 0) = 10 AS a10,
          coalesce(trim(r.build_id), '') AS version,
          least(coalesce(r.player_count, 1), 4)::INT AS players,
          r.character AS run_char
        FROM {p("runs")} r
        ANTI JOIN {_excluded_runs_sql(lake)} x ON r.run_hash = x.run_hash
        WHERE r.ascension BETWEEN 0 AND 10 AND r.character IN {OFFICIAL}""",
        f"""CREATE TEMP TABLE depth AS
        SELECT run_hash, count(*)::INT AS reached FROM {p("floors")} GROUP BY 1""",
        """CREATE TEMP TABLE comm_curve AS
        SELECT e.a10, g.f AS floor, count(*) AS n, count(*) FILTER (e.win) AS w
        FROM eligible e JOIN depth d USING (run_hash),
        LATERAL (SELECT unnest(generate_series(0, d.reached)) AS f) g
        GROUP BY 1, 2""",
        f"""CREATE TEMP TABLE own_players AS
        SELECT e.run_hash, e.user_id, p.player_idx, p.player_id, p.character,
          count(*) OVER (PARTITION BY e.run_hash) AS n_seats
        FROM eligible e JOIN {p("players")} p USING (run_hash)
        WHERE e.user_id IS NOT NULL""",
        """CREATE TEMP TABLE user_pid AS
        SELECT coalesce(g.user_id, k.user_id) AS user_id, coalesce(k.steam, g.pid) AS pid
        FROM (
          SELECT user_id, arg_max(player_id, c) AS pid
          FROM (
            SELECT user_id, player_id, count(DISTINCT run_hash) AS c
            FROM own_players WHERE player_id IS NOT NULL AND n_seats > 1
            GROUP BY 1, 2
          )
          GROUP BY 1
          HAVING max(c) > coalesce(list_sort(list(c), 'DESC')[2], 0)
        ) g
        FULL JOIN user_steam k ON g.user_id = k.user_id""",
        f"""CREATE TEMP TABLE seats AS
        SELECT o.run_hash, o.player_idx, o.user_id, e.win, e.a10, e.ascension,
          e.version, e.players, coalesce(nullif(o.character, ''), e.run_char) AS character,
          coalesce(d.reached, 0) AS reached
        FROM own_players o
        JOIN eligible e USING (run_hash)
        LEFT JOIN depth d USING (run_hash)
        LEFT JOIN user_pid u ON u.user_id = o.user_id
        WHERE (o.n_seats = 1 OR o.player_id = u.pid)
          AND coalesce(nullif(o.character, ''), e.run_char) IN {OFFICIAL}""",
        """CREATE TEMP TABLE user_curve AS
        SELECT s.user_id, s.a10, g.f AS floor, count(*) AS n, count(*) FILTER (s.win) AS w
        FROM seats s,
        LATERAL (SELECT unnest(generate_series(0, s.reached)) AS f) g
        GROUP BY 1, 2, 3""",
        f"""CREATE TEMP TABLE seat_floors AS
        WITH act_off AS (
          SELECT run_hash, act,
            coalesce(sum(n) OVER (PARTITION BY run_hash ORDER BY act
              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)::INT AS floor_offset
          FROM (SELECT f.run_hash, f.act, count(*) AS n FROM {p("floors")} f
                SEMI JOIN seats s ON f.run_hash = s.run_hash GROUP BY 1, 2)
        )
        SELECT fl.run_hash, fl.player_idx, fl.floor, fl.is_shop, fl.events, fl.rests, fl.cards
        FROM (
          SELECT f.run_hash, ps.i AS player_idx, ao.floor_offset + f.floor_idx AS floor,
            list_contains(f.room_types, 'shop') AS is_shop,
            ps.u.event_choices AS events, ps.u.rest_site_choices AS rests,
            ps.u.card_choices AS cards
          FROM (
            SELECT f.* FROM {p("floors")} f SEMI JOIN seats s ON f.run_hash = s.run_hash
          ) f
          JOIN act_off ao ON f.run_hash = ao.run_hash AND f.act = ao.act,
          LATERAL (SELECT unnest(f.players) AS u, generate_subscripts(f.players, 1) AS i) ps
        ) fl
        JOIN seats s ON fl.run_hash = s.run_hash AND fl.player_idx = s.player_idx""",
        "CREATE TEMP TABLE parts AS "
        + held.format(
            kind="cards",
            source=f"""SELECT d.run_hash, d.player_idx, upper(d.card) AS id, '' AS sub, min(d.floor_added) AS f
              FROM {p("deck")} d SEMI JOIN seats s ON d.run_hash = s.run_hash
              WHERE d.card IS NOT NULL AND d.card <> '' GROUP BY 1, 2, 3, 4""",
        ),
        "INSERT INTO parts "
        + held.format(
            kind="relics",
            source=f"""SELECT r.run_hash, r.player_idx, upper(r.relic) AS id, '' AS sub, min(r.floor_added) AS f
              FROM {p("relics")} r SEMI JOIN seats s ON r.run_hash = s.run_hash
              WHERE r.relic IS NOT NULL AND r.relic <> '' GROUP BY 1, 2, 3, 4""",
        ),
        "INSERT INTO parts "
        + held.format(
            kind="potions",
            source="""SELECT run_hash, player_idx, id, '' AS sub, min(f) AS f FROM ({potions}) GROUP BY 1, 2, 3, 4""",
        ),
        "INSERT INTO parts "
        + held.format(
            kind="events",
            source="""SELECT sf.run_hash, sf.player_idx, sf.floor AS f,
                split_part(ec.u.title."key", '.', 1) AS id,
                split_part(split_part(ec.u.title."key", '.options.', 2), '.', 1) AS sub
              FROM seat_floors sf, LATERAL (SELECT unnest(sf.events) AS u) ec
              WHERE ec.u.title."table" = 'events' AND ec.u.title."key" LIKE '%.options.%'""",
        ),
        "INSERT INTO parts "
        + held.format(
            kind="campfires",
            source="""SELECT sf.run_hash, sf.player_idx, sf.floor AS f,
                upper(rc.u) AS id, '' AS sub
              FROM seat_floors sf, LATERAL (SELECT unnest(sf.rests) AS u) rc
              WHERE rc.u IS NOT NULL AND rc.u <> ''""",
        ),
        f"""INSERT INTO parts
        SELECT {dims}, 'shops' AS kind, upper(h.id) AS id, lower(h.entity_type) AS sub,
          0, 0, 0, 0, 0, count(*) AS offered, count(*) FILTER (h.bought) AS taken
        FROM {p("shop_items")} h
        JOIN seats s ON h.run_hash = s.run_hash AND h.player_idx = s.player_idx
        WHERE h.id IS NOT NULL AND h.id <> ''
        GROUP BY ALL""",
        f"""INSERT INTO parts
        SELECT {dims}, 'cards' AS kind, upper(split_part(cc.u.card.id, '.', -1)) AS id, '' AS sub,
          0, 0, 0, 0, 0, count(*), count(*) FILTER (coalesce(cc.u.was_picked, false))
        FROM seat_floors sf
        JOIN seats s ON sf.run_hash = s.run_hash AND sf.player_idx = s.player_idx,
        LATERAL (SELECT unnest(sf.cards) AS u) cc
        WHERE NOT sf.is_shop AND cc.u.card.id IS NOT NULL
        GROUP BY ALL""",
        f"""INSERT INTO parts
        SELECT {dims}, 'relics' AS kind, upper(h.relic) AS id, '' AS sub,
          0, 0, 0, 0, 0, count(*), count(*) FILTER (h.picked)
        FROM {p("relic_choices")} h
        JOIN seats s ON h.run_hash = s.run_hash AND h.player_idx = s.player_idx
        WHERE NOT h.is_shop AND h.n_options >= 2 AND h.n_picked < h.n_options
        GROUP BY ALL""",
        f"""INSERT INTO parts
        SELECT {dims}, 'runs' AS kind, '' AS id, '' AS sub,
          count(*), count(*) FILTER (s.win), 0, 0, 0, 0, 0
        FROM seats s GROUP BY ALL""",
    ]


def _potion_source(lake: str) -> str:
    events = ""
    if (pathlib.Path(lake) / "potion_events.parquet").exists():
        events = f"""UNION ALL
          SELECT e.run_hash, e.player_idx, upper(e.potion) AS id, e.floor::BIGINT AS f
          FROM read_parquet('{lake}/potion_events.parquet') e
          SEMI JOIN seats s ON e.run_hash = s.run_hash
          WHERE e.potion IS NOT NULL AND e.potion <> ''"""
    return f"""SELECT p.run_hash, p.player_idx, upper(p.potion) AS id, NULL::BIGINT AS f
          FROM read_parquet('{lake}/potions.parquet') p
          SEMI JOIN seats s ON p.run_hash = s.run_hash
          WHERE p.potion IS NOT NULL AND p.potion <> ''
          {events}"""


def _account_steam_ids() -> list[tuple[str, int]]:
    """(account id, SteamID64) for every account with a linked Steam id,
    so a co-op seat is matched by the uploader's own id rather than the
    lake guess. Empty without Mongo."""
    if not os.environ.get("MONGO_URL", "").strip():
        return []
    try:
        from app.services.users_db import _get_collection

        out = []
        for doc in _get_collection().find(
            {"steam_id": {"$nin": [None, ""]}}, {"steam_id": 1}
        ):
            sid = str(doc.get("steam_id") or "")
            if sid.isdigit():
                out.append((str(doc["_id"]), int(sid)))
        return out
    except Exception as e:
        print(f"player stats: steam ids unavailable ({e})", flush=True)
        return []


def _connect():
    import duckdb

    con = duckdb.connect()
    con.execute(
        f"SET memory_limit='{os.environ.get('LAKE_BUILD_MEMORY', '') or '3500MB'}'"
    )
    tmp = LAKE / "tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    con.execute(f"SET temp_directory='{tmp}'")
    cap = os.environ.get("LAKE_MAX_TEMP", "").strip()
    if cap:
        con.execute(f"SET max_temp_directory_size='{cap}'")
    con.execute("SET preserve_insertion_order=false")
    con.execute(f"SET threads={int(os.environ.get('LAKE_BUILD_THREADS', '5'))}")
    return con


def build(con=None) -> dict:
    t0 = time.time()
    lake = str(LAKE)
    own = con is None
    con = con or _connect()
    try:
        con.execute(
            "CREATE OR REPLACE TEMP TABLE user_steam (user_id VARCHAR, steam BIGINT)"
        )
        steam = _account_steam_ids()
        if steam:
            con.executemany("INSERT INTO user_steam VALUES (?, ?)", steam)
        for stmt in _sql(lake):
            con.execute(stmt.replace("{potions}", _potion_source(lake)))
        out = LAKE / OUT_NAME
        tmp = LAKE / f"{OUT_NAME}.{os.getpid()}.tmp"
        con.execute(
            f"""COPY (
              SELECT user_id, character, ascension::TINYINT AS ascension, version,
                players::TINYINT AS players, kind, id, sub,
                sum(n)::INTEGER AS n, sum(w)::INTEGER AS w,
                sum(xn)::INTEGER AS xn, sum(xw)::INTEGER AS xw,
                round(sum(xs), 4)::DOUBLE AS xs,
                sum(offered)::INTEGER AS offered, sum(taken)::INTEGER AS taken
              FROM parts
              GROUP BY ALL
              ORDER BY user_id, kind, id
            ) TO '{tmp}' (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 16384)"""
        )
        tmp.replace(out)
        rows, users = con.execute(
            f"SELECT count(*), count(DISTINCT user_id) FROM read_parquet('{out}')"
        ).fetchone()
    finally:
        if own:
            con.close()
    return {
        "rows": rows,
        "users": users,
        "bytes": out.stat().st_size,
        "seconds": round(time.time() - t0, 1),
    }


if __name__ == "__main__":
    print(f"player stats: {build()}", flush=True)
