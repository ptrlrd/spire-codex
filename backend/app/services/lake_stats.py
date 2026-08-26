"""Read-only DuckDB access to the analytics lake.

First production toehold of the lake migration: LAKE_STATS_SHADOW=on makes
the stats refresher compare lake-computed community-stats deaths against
the snapshot-served payload once per summary cycle and log the drift, so a
divergence (stale folds, broken ingest, filter skew) surfaces in the logs
instead of a user report. Requires the lake mounted at LAKE_DIR (default
/lake) and the nightly lake-ingest job keeping it fresh. No serving path
reads the lake yet.
"""

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

LAKE_DIR = Path(os.environ.get("LAKE_DIR", "/lake"))
SHADOW_ENABLED = (os.environ.get("LAKE_STATS_SHADOW", "") or "").lower() in (
    "1",
    "on",
    "true",
)
# "serve": /api/runs/community-stats builds its payload from the lake (the
# snapshot stays as automatic fallback for unsupported brackets and errors).
SERVE_ENABLED = (os.environ.get("LAKE_COMMUNITY_STATS", "") or "").lower() == "serve"

_OFFICIAL = "('IRONCLAD','SILENT','DEFECT','NECROBINDER','REGENT')"


_SERVE_FILES = (
    "runs.parquet",
    "excluded.parquet",
    "floors.parquet",
    "players.parquet",
)


def available(*extra: str) -> bool:
    for name in ("runs.parquet",) + extra:
        if not (LAKE_DIR / name).exists():
            return False
    try:
        import duckdb  # noqa: F401
    except ImportError:
        return False
    return True


def _connect():
    import duckdb

    con = duckdb.connect()
    con.execute("SET memory_limit='500MB'")
    con.execute("SET threads=2")
    return con


def deaths_counts() -> dict[str, dict[str, int]]:
    """Deaths per encounter/event id with the walk's eligibility filters."""
    con = _connect()
    try:
        out: dict[str, dict[str, int]] = {}
        for section, col in (("encounters", "encounter"), ("events", "event")):
            rows = con.execute(
                f"""
                SELECT killed_by_{col} AS id, count(*) AS n
                FROM read_parquet('{LAKE_DIR}/runs.parquet') r
                ANTI JOIN read_parquet('{LAKE_DIR}/excluded.parquet') x
                  ON r.run_hash = x.run_hash
                WHERE NOT r.win AND r.ascension BETWEEN 0 AND 10
                  AND r.character IN {_OFFICIAL}
                  AND killed_by_{col} IS NOT NULL
                  AND killed_by_{col} NOT LIKE 'NONE%'
                GROUP BY 1
                """
            ).fetchall()
            out[section] = dict(rows)
        return out
    finally:
        con.close()


def shadow_check() -> None:
    """One log line comparing lake deaths to the served snapshot payload."""
    try:
        if not available():
            logger.info("lake shadow: lake not available, skipped")
            return
        from . import run_entity_stats

        live = run_entity_stats.get_community_stats(None)
        lake = deaths_counts()
        worst, worst_id, n = 0.0, "", 0
        for section in ("encounters", "events"):
            for row in (live.get("deaths") or {}).get(section) or []:
                lv = row.get("count") or 0
                lk = lake[section].get(row.get("id"), 0)
                drift = abs(lk - lv) * 100.0 / max(lv, 1)
                n += 1
                if drift > worst:
                    worst, worst_id = drift, f"{section}:{row.get('id')}"
        logger.info(
            "lake shadow: worst drift %.2f%% (%s) across %d ids", worst, worst_id, n
        )
        if worst >= 5.0:
            logger.warning(
                "lake shadow: drift %.2f%% on %s - lake and snapshot are diverging",
                worst,
                worst_id,
            )
    except Exception:
        logger.warning("lake shadow check failed", exc_info=True)


# ── Serve mode: the full community-stats payload from the lake ────────────────

_PAYLOAD_TTL_SECONDS = 60.0
_payload_cache: dict[str, tuple[float, dict]] = {}

_ELIGIBLE_SQL = """
CREATE OR REPLACE TEMP VIEW eligible AS
SELECT r.*
FROM read_parquet('{lake}/runs.parquet') r
ANTI JOIN read_parquet('{lake}/excluded.parquet') x ON r.run_hash = x.run_hash
WHERE r.ascension BETWEEN 0 AND 10
  AND r.character IN ('IRONCLAD','SILENT','DEFECT','NECROBINDER','REGENT')
"""

_PFLOORS_SQL = """
CREATE OR REPLACE TEMP VIEW pfloors AS
SELECT f.run_hash, f.act, f.floor_idx, ps.u AS p,
  e.win, lower(e.character) AS run_char,
  len(list_filter(f.room_models, m -> m LIKE '%THIEVING_HOPPER%')) > 0 AS hopper_floor
FROM read_parquet('{lake}/floors.parquet') f
JOIN eligible e ON f.run_hash = e.run_hash,
LATERAL (SELECT unnest(f.players) AS u) ps
"""

_PID_CHAR_SQL = """
CREATE OR REPLACE TEMP VIEW pid_char AS
SELECT run_hash, player_id, lower(character) AS character
FROM read_parquet('{lake}/players.parquet')
WHERE player_id IS NOT NULL AND character <> ''
"""


_PAYLOAD_PATH_NAME = "community_payload.json"


def community_payload(bracket: str | None = None) -> dict | None:
    """Community-stats payload PRECOMPUTED by the ingest, or None when this
    bracket isn't lake-served, no precomputed payload exists, or anything
    fails -- the caller falls back to the snapshot path. Serving never
    builds inline: the full-corpus build takes minutes and times out the
    request."""
    try:
        if bracket not in (None, "all"):
            return None
        if not SERVE_ENABLED:
            return None
        import json

        path = LAKE_DIR / _PAYLOAD_PATH_NAME
        if not path.exists():
            return None
        mtime = path.stat().st_mtime
        hit = _payload_cache.get("all")
        if hit and hit[0] == mtime:
            return hit[1]
        payload = json.loads(path.read_text())
        _payload_cache["all"] = (mtime, payload)
        return payload
    except Exception:
        logger.warning(
            "lake community payload failed; snapshot fallback", exc_info=True
        )
        return None


def build_and_store_payload() -> dict | None:
    """Build the full community payload from the lake and write it beside
    the parquet for the serving workers to point-read. Ingest-time only."""
    if not available(*_SERVE_FILES[1:]):
        logger.info("lake payload build skipped: lake incomplete")
        return None
    import json

    payload = _build_community_all()
    tmp = LAKE_DIR / (_PAYLOAD_PATH_NAME + ".tmp")
    tmp.write_text(json.dumps(payload, separators=(",", ":")))
    tmp.replace(LAKE_DIR / _PAYLOAD_PATH_NAME)
    logger.info(
        "lake community payload stored (%d bytes)",
        (LAKE_DIR / _PAYLOAD_PATH_NAME).stat().st_size,
    )
    return payload


def _build_community_all() -> dict:
    from . import community_stats as cs

    lake = str(LAKE_DIR)
    con = _connect()
    try:
        con.execute(_ELIGIBLE_SQL.format(lake=lake))
        con.execute(_PFLOORS_SQL.format(lake=lake))
        con.execute(_PID_CHAR_SQL.format(lake=lake))
        acc = cs._new_acc_one()

        for char, asc, runs, wins in con.execute(
            "SELECT lower(character), coalesce(ascension, 0)::INT, count(*),"
            " count(*) FILTER (win) FROM eligible GROUP BY 1, 2"
        ).fetchall():
            acc["total_runs"] += runs
            acc["total_wins"] += wins
            for store_key, rec in (
                ("by_ascension", acc["by_ascension"].setdefault(asc, [0, 0])),
                ("by_character", acc["by_character"].setdefault(char, [0, 0])),
                (
                    "char_asc",
                    acc["char_asc"].setdefault(char, {}).setdefault(asc, [0, 0]),
                ),
            ):
                rec[0] += runs
                rec[1] += wins

        for col, key in (("encounter", "deaths_encounter"), ("event", "deaths_event")):
            acc[key] = dict(
                con.execute(
                    f"SELECT killed_by_{col}, count(*) FROM eligible"
                    f" WHERE NOT win AND killed_by_{col} IS NOT NULL"
                    f" AND killed_by_{col} NOT LIKE 'NONE%' GROUP BY 1"
                ).fetchall()
            )

        for floors, runs, wins in con.execute(
            "WITH per_run AS (SELECT f.run_hash, count(*) AS n"
            f" FROM read_parquet('{lake}/floors.parquet') f"
            " JOIN eligible e ON f.run_hash = e.run_hash GROUP BY 1)"
            " SELECT n, count(*), count(*) FILTER (e.win) FROM per_run p"
            " JOIN eligible e ON p.run_hash = e.run_hash GROUP BY 1"
        ).fetchall():
            acc["floors"][int(floors)] = [runs, wins]

        for act, ptype, visits, dmg, deaths in con.execute(
            f"WITH typed AS (SELECT f.* FROM read_parquet('{lake}/floors.parquet') f"
            " JOIN eligible e ON f.run_hash = e.run_hash"
            " WHERE f.map_point_type IS NOT NULL AND f.map_point_type <> '')"
            ", visits AS (SELECT act, map_point_type, count(*) AS v,"
            " sum(least(100.0, greatest(0, coalesce(ps.u.damage_taken, 0)) * 100.0"
            " / ps.u.max_hp)) AS dmg FROM typed,"
            " LATERAL (SELECT unnest(players) AS u) ps"
            " WHERE coalesce(ps.u.max_hp, 0) > 0 GROUP BY 1, 2)"
            ", lastf AS (SELECT t.run_hash, arg_max(t.act, t.act * 10000 + t.floor_idx)"
            " AS act, arg_max(t.map_point_type, t.act * 10000 + t.floor_idx) AS mpt"
            " FROM typed t JOIN eligible e ON t.run_hash = e.run_hash"
            " WHERE coalesce(e.killed_by_encounter, '') <> ''"
            "  OR coalesce(e.killed_by_event, '') <> '' GROUP BY 1)"
            ", deaths AS (SELECT act, mpt, count(*) AS d FROM lastf GROUP BY 1, 2)"
            " SELECT v.act, v.map_point_type, v.v, v.dmg, coalesce(d.d, 0)"
            " FROM visits v LEFT JOIN deaths d"
            " ON v.act = d.act AND v.map_point_type = d.mpt"
        ).fetchall():
            acc["map_danger"][(int(act), ptype)] = [visits, float(dmg or 0.0), deaths]

        for eid, oid, n in con.execute(
            "SELECT split_part((ec.u).title.\"key\", '.', 1),"
            " split_part(split_part((ec.u).title.\"key\", '.options.', 2), '.', 1),"
            " count(*) FROM pfloors, LATERAL (SELECT unnest((p).event_choices) AS u) ec"
            " WHERE (ec.u).title.\"table\" = 'events'"
            " AND (ec.u).title.\"key\" LIKE '%.options.%' GROUP BY 1, 2"
        ).fetchall():
            if eid and oid:
                acc["events"].setdefault(eid, {})[oid] = n

        for choice, ps_char, n, wins, low in con.execute(
            "WITH hp AS (SELECT run_hash, act, floor_idx, p, win, run_char,"
            " last_value(CASE WHEN (p).current_hp IS NOT NULL"
            " AND coalesce((p).max_hp, 0) > 0 THEN"
            " struct_pack(hp := (p).current_hp, mx := (p).max_hp) END IGNORE NULLS)"
            " OVER (PARTITION BY run_hash, (p).player_id ORDER BY act, floor_idx"
            " ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS hp_prev"
            " FROM pfloors)"
            ", choices AS (SELECT rc.u AS choice, h.win,"
            " coalesce(h.hp_prev, struct_pack(hp := (h.p).current_hp,"
            " mx := coalesce((h.p).max_hp, 0))) AS ref,"
            " coalesce(pc.character, h.run_char) AS ps_char FROM hp h"
            " LEFT JOIN pid_char pc ON h.run_hash = pc.run_hash"
            " AND (h.p).player_id = pc.player_id,"
            " LATERAL (SELECT unnest((h.p).rest_site_choices) AS u) rc"
            " WHERE rc.u IS NOT NULL AND rc.u <> '')"
            " SELECT choice, ps_char, count(*), count(*) FILTER (win),"
            " count(*) FILTER (ref.mx > 0 AND ref.hp IS NOT NULL"
            " AND ref.hp * 2 < ref.mx) FROM choices GROUP BY 1, 2"
        ).fetchall():
            rec = acc["rest"].setdefault(choice, [0, 0, 0])
            rec[0] += n
            rec[1] += wins
            rec[2] += low
            crest = acc["char_rest"].setdefault(ps_char, {})
            crest[choice] = crest.get(choice, 0) + n

        for rid, chosen, offered in con.execute(
            "WITH offers AS (SELECT coalesce((ac.u).TextKey,"
            " CASE WHEN (ac.u).title.\"key\" LIKE '%.%' THEN"
            ' substr((ac.u).title."key", strpos((ac.u).title."key", \'.\') + 1)'
            ' ELSE (ac.u).title."key" END) AS rid, (ac.u).was_chosen AS wc'
            " FROM pfloors, LATERAL (SELECT unnest((p).ancient_choice) AS u) ac)"
            " SELECT rid, count(*) FILTER (coalesce(wc, false)), count(*) FROM offers"
            " WHERE rid IS NOT NULL AND rid <> '' AND upper(rid) NOT LIKE 'NONE%'"
            " GROUP BY 1"
        ).fetchall():
            acc["ancient"][rid] = [chosen, offered]

        for cid, hopper, ps_char, n in con.execute(
            "WITH rem AS (SELECT hopper_floor,"
            " coalesce(pc.character, f.run_char) AS ps_char,"
            " coalesce(json_extract_string(cr.u, '$.card.id'),"
            " json_extract_string(cr.u, '$.id'),"
            " CASE WHEN json_type(cr.u) = 'VARCHAR' THEN cr.u::VARCHAR END) AS raw"
            " FROM pfloors f LEFT JOIN pid_char pc ON f.run_hash = pc.run_hash"
            " AND (f.p).player_id = pc.player_id,"
            " LATERAL (SELECT unnest((f.p).cards_removed) AS u) cr)"
            " SELECT CASE WHEN upper(split_part(raw, '.', -1)) LIKE 'STRIKE_%'"
            " THEN 'STRIKE' WHEN upper(split_part(raw, '.', -1)) LIKE 'DEFEND_%'"
            " THEN 'DEFEND' ELSE upper(split_part(raw, '.', -1)) END,"
            " hopper_floor, ps_char, count(*) FROM rem"
            " WHERE raw IS NOT NULL AND raw <> ''"
            " AND upper(split_part(raw, '.', -1)) NOT LIKE 'NONE%' GROUP BY 1, 2, 3"
        ).fetchall():
            if hopper:
                acc["stolen"][cid] = acc["stolen"].get(cid, 0) + n
            else:
                acc["removed"][cid] = acc["removed"].get(cid, 0) + n
                acc["char_removes"][ps_char] = acc["char_removes"].get(ps_char, 0) + n

        screens, skips = con.execute(
            "SELECT count(*), count(*) FILTER (NOT list_bool_or("
            "[coalesce(c.was_picked, false) FOR c IN (p).card_choices]))"
            " FROM pfloors WHERE len((p).card_choices) > 0"
        ).fetchone()
        acc["reward_screens"] = screens
        acc["reward_skips"] = skips

        rec = con.execute(
            "WITH rr AS (SELECT * FROM eligible WHERE game_mode = 'standard'"
            " AND NOT has_modifiers)"
            " SELECT (SELECT min(run_time) FROM rr WHERE win AND run_time > 0),"
            " (SELECT arg_min(run_hash, run_time) FROM rr WHERE win AND run_time > 0),"
            " (SELECT max(run_time) FROM rr WHERE run_time > 0),"
            " (SELECT arg_max(run_hash, run_time) FROM rr WHERE run_time > 0),"
            f" (SELECT max(p.deck_size) FROM read_parquet('{lake}/players.parquet') p"
            "  JOIN rr ON p.run_hash = rr.run_hash),"
            " (SELECT arg_max(p.run_hash, p.deck_size)"
            f"  FROM read_parquet('{lake}/players.parquet') p"
            "  JOIN rr ON p.run_hash = rr.run_hash)"
        ).fetchone()
        if rec[0] is not None:
            acc["fastest_win"] = (int(rec[0]), rec[1])
        if rec[2] is not None:
            acc["longest_run"] = (int(rec[2]), rec[3])
        if rec[4]:
            acc["biggest_deck"] = (int(rec[4]), rec[5])

        payload = cs._finalize_one(acc)
        payload["data_through"] = str(
            con.execute(
                f"SELECT max(submitted_at) FROM read_parquet('{lake}/runs.parquet')"
            ).fetchone()[0]
        )
        return payload
    finally:
        con.close()


# ── Codex Elo from the lake ──────────────────────────────────────────────────
# Both Elos are Bradley-Terry fits over aggregated pair counts, so they are
# order-independent: extract the same pairs the walk extracts and feed the
# same solver, and the ratings match by construction.


def _ids_temp_table(con, name: str, ids) -> None:
    con.execute(f"CREATE OR REPLACE TEMP TABLE {name} (cid VARCHAR)")
    rows = [(i,) for i in ids]
    if rows:
        con.executemany(f"INSERT INTO {name} VALUES (?)", rows)


def reward_pair_counts(con=None) -> dict[tuple[str, str], int]:
    """(picked, skipped) -> count over card-reward screens, mirroring the
    walk: eligible runs only, CARD-namespaced ids, curses/status excluded."""
    from . import run_entity_stats as res

    own = con is None
    if own:
        con = _connect()
    try:
        con.execute(_ELIGIBLE_SQL.format(lake=LAKE_DIR))
        _ids_temp_table(con, "excluded_cards", res._excluded_card_ids())
        rows = con.execute(
            f"""
            WITH choices AS (
              SELECT f.run_hash, f.act, f.floor_idx, ps.i AS pidx,
                upper(split_part(cc.u.card.id, '.', -1)) AS cid,
                coalesce(cc.u.was_picked, false) AS picked
              FROM read_parquet('{LAKE_DIR}/floors.parquet') f
              JOIN eligible e ON f.run_hash = e.run_hash,
              LATERAL (SELECT unnest(f.players) AS u,
                       generate_subscripts(f.players, 1) AS i) ps,
              LATERAL (SELECT unnest(ps.u.card_choices) AS u) cc
              WHERE cc.u.card.id IS NOT NULL
                AND upper(split_part(cc.u.card.id, '.', 1)) = 'CARD'
                AND upper(split_part(cc.u.card.id, '.', -1))
                    NOT IN (SELECT cid FROM excluded_cards)
            )
            SELECT w.cid, l.cid, count(*)
            FROM choices w
            JOIN choices l ON w.run_hash = l.run_hash AND w.act = l.act
              AND w.floor_idx = l.floor_idx AND w.pidx = l.pidx
            WHERE w.picked AND NOT l.picked AND w.cid <> l.cid
            GROUP BY 1, 2
            """
        ).fetchall()
        return {(w, lo): n for w, lo, n in rows}
    finally:
        if own:
            con.close()


def upgrade_pair_counts(con=None) -> dict[tuple[str, str], int]:
    """(upgraded, eligible-but-skipped) -> count over rest-site Smith
    decisions, replaying _walk_rest_upgrade_choices set-by-set: the eligible
    pool is the player's upgradeable final-deck cards present by that floor,
    minus cards already smithed at an earlier decision this run."""
    from . import run_entity_stats as res

    upgradeable = res._upgradeable_card_ids()
    own = con is None
    if own:
        con = _connect()
    try:
        con.execute(_ELIGIBLE_SQL.format(lake=LAKE_DIR))
        _ids_temp_table(con, "upg_ids", upgradeable)
        upg_filter = "IN (SELECT cid FROM upg_ids)" if upgradeable else "IS NOT NULL"
        rows = con.execute(
            f"""
            WITH floors_g AS (
              SELECT f.run_hash, f.players,
                row_number() OVER (PARTITION BY f.run_hash
                  ORDER BY f.act, f.floor_idx) AS gfloor
              FROM read_parquet('{LAKE_DIR}/floors.parquet') f
              JOIN eligible e ON f.run_hash = e.run_hash
            ),
            pmap AS (
              SELECT run_hash, player_id, player_idx
              FROM read_parquet('{LAKE_DIR}/players.parquet')
              WHERE player_id IS NOT NULL
            ),
            nplayers AS (
              -- Solo is the BLOB's player count, not the runs doc's scalar:
              -- they disagree on some co-op runs, and the walk trusts the blob.
              SELECT run_hash, count(*) AS np
              FROM read_parquet('{LAKE_DIR}/players.parquet') GROUP BY 1
            ),
            smith_raw AS (
              SELECT f.run_hash, f.gfloor, ps.u.player_id AS pid,
                [upper(split_part(u, '.', -1)) FOR u IN ps.u.upgraded_cards
                 IF upper(split_part(u, '.', 1)) = 'CARD'] AS winners_raw
              FROM floors_g f,
              LATERAL (SELECT unnest(f.players) AS u) ps
              WHERE list_contains(ps.u.rest_site_choices, 'SMITH')
                AND len(ps.u.upgraded_cards) > 0
            ),
            smith AS (
              SELECT sr.run_hash,
                CASE WHEN n.np = 1 THEN 1 ELSE pm.player_idx END AS pidx,
                sr.gfloor, sr.winners_raw
              FROM smith_raw sr
              JOIN nplayers n ON sr.run_hash = n.run_hash
              LEFT JOIN pmap pm ON sr.run_hash = pm.run_hash
                AND sr.pid = pm.player_id
              WHERE n.np = 1 OR pm.player_idx IS NOT NULL
            ),
            winners AS (
              SELECT run_hash, pidx, gfloor, wu.u AS card
              FROM smith, LATERAL (SELECT unnest(winners_raw) AS u) wu
              WHERE pidx IS NOT NULL AND wu.u {upg_filter}
            ),
            events AS (
              SELECT DISTINCT run_hash, pidx, gfloor FROM winners
            ),
            first_up AS (
              SELECT run_hash, pidx, card, min(gfloor) AS fu
              FROM winners GROUP BY 1, 2, 3
            ),
            deck_min AS (
              SELECT d.run_hash, d.player_idx AS pidx, d.card,
                min(coalesce(d.floor_added, 0)) AS fa
              FROM read_parquet('{LAKE_DIR}/deck.parquet') d
              JOIN eligible e ON d.run_hash = e.run_hash
              WHERE d.card {upg_filter}
              GROUP BY 1, 2, 3
            ),
            losers AS (
              SELECT ev.run_hash, ev.pidx, ev.gfloor, dm.card
              FROM events ev
              JOIN deck_min dm ON ev.run_hash = dm.run_hash AND ev.pidx = dm.pidx
              LEFT JOIN first_up f2 ON f2.run_hash = ev.run_hash
                AND f2.pidx = ev.pidx AND f2.card = dm.card
              LEFT JOIN winners w2 ON w2.run_hash = ev.run_hash
                AND w2.pidx = ev.pidx AND w2.gfloor = ev.gfloor
                AND w2.card = dm.card
              WHERE dm.fa <= ev.gfloor
                AND (f2.fu IS NULL OR f2.fu >= ev.gfloor)
                AND w2.card IS NULL
            )
            SELECT w.card, l.card, count(*)
            FROM winners w
            JOIN losers l ON w.run_hash = l.run_hash AND w.pidx = l.pidx
              AND w.gfloor = l.gfloor
            WHERE w.card <> l.card
            GROUP BY 1, 2
            """
        ).fetchall()
        return {(w, lo): n for w, lo, n in rows}
    finally:
        if own:
            con.close()


def compute_lake_elo() -> dict:
    """Card-reward Elo and upgrade Elo fitted from the lake with the same
    Bradley-Terry solver the walk uses."""
    from . import run_entity_stats as res

    con = _connect()
    try:
        reward = reward_pair_counts(con)
        upgrade = upgrade_pair_counts(con)
    finally:
        con.close()
    card_elo, _ = res._compute_codex_elo(reward)
    upgrade_elo, _ = res._compute_codex_elo(upgrade)
    return {
        "card_elo": card_elo,
        "upgrade_elo": upgrade_elo,
        "reward_pairs": len(reward),
        "upgrade_pairs": len(upgrade),
    }


# ── Entity store: the snapshot cache's per-entity aggregates, from the lake ──

_ENTITY_STORE_NAME = "entity_store.json"


def build_entity_store() -> dict | None:
    """Compute the all-bracket per-entity aggregates (picks, wins,
    by-character, reward metrics, Elos, base/upgraded, relic act buckets)
    and store them beside the parquet. Ingest-time only; the serving swap
    reads this instead of the walked snapshot."""
    if not available(*_SERVE_FILES[1:]):
        logger.info("entity store skipped: lake incomplete")
        return None

    from . import run_entity_stats as res

    con = _connect()
    try:
        con.execute(_ELIGIBLE_SQL.format(lake=LAKE_DIR))
        entities: dict[str, dict[str, dict]] = {
            "cards": {},
            "relics": {},
            "potions": {},
        }

        def entry(etype: str, eid: str) -> dict:
            return entities[etype].setdefault(
                eid,
                {
                    "picks": 0,
                    "wins": 0,
                    "by_character": {},
                    "last_submitted_at": None,
                    "last_run_hash": None,
                },
            )

        # Per-instance membership + per-character splits + last-seen, one
        # query per membership table.
        for etype, table, col in (
            ("cards", "deck", "card"),
            ("relics", "relics", "relic"),
            ("potions", "potions", "potion"),
        ):
            for eid, char, picks, wins, last_ts, last_hash in con.execute(
                f"""
                SELECT m.{col}, e.character, count(*), count(*) FILTER (e.win),
                  max(e.submitted_at), arg_max(m.run_hash, e.submitted_at)
                FROM read_parquet('{LAKE_DIR}/{table}.parquet') m
                JOIN eligible e ON m.run_hash = e.run_hash
                WHERE m.{col} IS NOT NULL AND m.{col} <> ''
                GROUP BY 1, 2
                """
            ).fetchall():
                a = entry(etype, eid)
                a["picks"] += picks
                a["wins"] += wins
                ch = char or ""
                sub = a["by_character"].setdefault(ch, {"picks": 0, "wins": 0})
                sub["picks"] += picks
                sub["wins"] += wins
                ts = str(last_ts) if last_ts is not None else None
                if ts and (a["last_submitted_at"] or "") < ts:
                    a["last_submitted_at"] = ts
                    a["last_run_hash"] = last_hash

        # Card-reward offer/pick counts with 3 act buckets (A1/A2/A3+).
        _ids_temp_table(con, "excluded_cards", res._excluded_card_ids())
        for eid, bucket, offered, picked in con.execute(
            f"""
            SELECT upper(split_part(cc.u.card.id, '.', -1)),
              least(f.act, 2), count(*),
              count(*) FILTER (coalesce(cc.u.was_picked, false))
            FROM read_parquet('{LAKE_DIR}/floors.parquet') f
            JOIN eligible e ON f.run_hash = e.run_hash,
            LATERAL (SELECT unnest(f.players) AS u) ps,
            LATERAL (SELECT unnest(ps.u.card_choices) AS u) cc
            WHERE cc.u.card.id IS NOT NULL
              AND upper(split_part(cc.u.card.id, '.', 1)) = 'CARD'
              AND upper(split_part(cc.u.card.id, '.', -1))
                  NOT IN (SELECT cid FROM excluded_cards)
            GROUP BY 1, 2
            """
        ).fetchall():
            a = entry("cards", eid)
            if "offered" not in a:
                a.update(
                    {
                        "offered": 0,
                        "picked": 0,
                        "off_act": [0, 0, 0],
                        "pick_act": [0, 0, 0],
                    }
                )
            a["offered"] += offered
            a["picked"] += picked
            a["off_act"][bucket] += offered
            a["pick_act"][bucket] += picked

        # Base vs upgraded deck membership: run-set semantics.
        for eid, upgraded, picks, wins in con.execute(
            f"""
            WITH sets AS (
              SELECT DISTINCT d.run_hash, d.card,
                coalesce(d.upgrade_level, 0) > 0 AS upgraded
              FROM read_parquet('{LAKE_DIR}/deck.parquet') d
              JOIN eligible e ON d.run_hash = e.run_hash
            )
            SELECT s.card, s.upgraded, count(*), count(*) FILTER (e.win)
            FROM sets s JOIN eligible e ON s.run_hash = e.run_hash
            GROUP BY 1, 2
            """
        ).fetchall():
            a = entry("cards", eid)
            a["upg" if upgraded else "base"] = {"picks": picks, "wins": wins}

        # Relic acquisition acts: per-run dedupe, act bounds from the floors
        # table, modded-relic runs skipped entirely (their pickup floors lie).
        official_relics = res._official_relic_ids()
        _ids_temp_table(con, "official_relics", official_relics)
        modded_guard = (
            "AND r.run_hash NOT IN (SELECT DISTINCT run_hash"
            f" FROM read_parquet('{LAKE_DIR}/relics.parquet')"
            " WHERE relic NOT IN (SELECT cid FROM official_relics))"
            if official_relics
            else ""
        )
        for eid, bucket, picks, wins in con.execute(
            f"""
            WITH bounds AS (
              SELECT f.run_hash, f.act, max(cum) AS bound FROM (
                SELECT run_hash, act,
                  count(*) OVER (PARTITION BY run_hash
                    ORDER BY act, floor_idx) AS cum
                FROM read_parquet('{LAKE_DIR}/floors.parquet')
              ) f GROUP BY 1, 2
            ),
            picks AS (
              SELECT DISTINCT r.run_hash, r.relic,
                coalesce(least((SELECT min(b.act) FROM bounds b
                  WHERE b.run_hash = r.run_hash AND r.floor_added <= b.bound),
                  2), 2) AS bucket
              FROM read_parquet('{LAKE_DIR}/relics.parquet') r
              JOIN eligible e ON r.run_hash = e.run_hash
              WHERE r.floor_added IS NOT NULL AND r.floor_added >= 1
                {modded_guard}
            )
            SELECT p.relic, p.bucket, count(*), count(*) FILTER (e.win)
            FROM picks p JOIN eligible e ON p.run_hash = e.run_hash
            GROUP BY 1, 2
            """
        ).fetchall():
            a = entry("relics", eid)
            if "act_picks" not in a:
                a["act_picks"] = [0, 0, 0]
                a["act_wins"] = [0, 0, 0]
            a["act_picks"][int(bucket)] += picks
            a["act_wins"][int(bucket)] += wins

        totals = dict(
            zip(
                ("total_runs", "total_wins"),
                con.execute(
                    "SELECT count(*), count(*) FILTER (win) FROM eligible"
                ).fetchone(),
            )
        )
        data_through = str(
            con.execute(
                f"SELECT max(submitted_at) FROM read_parquet('{LAKE_DIR}/runs.parquet')"
            ).fetchone()[0]
        )
        reward = reward_pair_counts(con)
        upgrade = upgrade_pair_counts(con)
    finally:
        con.close()

    card_elo, _ = res._compute_codex_elo(reward)
    upgrade_elo, _ = res._compute_codex_elo(upgrade)
    for eid, elo in card_elo.items():
        if eid in entities["cards"]:
            entities["cards"][eid]["elo"] = elo
    for eid, elo in upgrade_elo.items():
        upg = entities["cards"].get(eid, {}).get("upg")
        if upg is not None:
            upg["elo"] = elo

    baselines = {}
    for etype, entries_ in entities.items():
        picks = sum(a["picks"] for a in entries_.values())
        wins = sum(a["wins"] for a in entries_.values())
        baselines[etype] = (wins / picks) if picks else 0.0

    store = {
        "entities": entities,
        "totals": totals,
        "baselines": baselines,
        "data_through": data_through,
    }
    import json as _json

    tmp = LAKE_DIR / (_ENTITY_STORE_NAME + ".tmp")
    tmp.write_text(_json.dumps(store, separators=(",", ":")))
    tmp.replace(LAKE_DIR / _ENTITY_STORE_NAME)
    logger.info(
        "lake entity store: %d cards / %d relics / %d potions (%d bytes)",
        len(entities["cards"]),
        len(entities["relics"]),
        len(entities["potions"]),
        (LAKE_DIR / _ENTITY_STORE_NAME).stat().st_size,
    )
    return store
