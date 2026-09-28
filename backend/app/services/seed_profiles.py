"""Seed Finder queries over the nightly seed index (lab/seed_profiles.py).

seed_facts.parquet is the inverted index: one row per (seed_key, evidence,
kind, id, act, floor, seat) with an occurrence count, where evidence is one
solo run or one co-op lobby. A search turns each predicate into a scan of
the facts for that kind and id, scores every (seed, evidence) pair by how
many predicates that single run satisfied, keeps the best evidence per
seed, and only then joins the profile summary for the rows it returns, so a
"full match" is always one real run that showed everything asked for.
seed_profiles.parquet is the summary per seed_key. Serving reads are small
in-memory DuckDB connections against the parquet files in LAKE_DIR."""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger("spire-codex")

LAKE_DIR = Path(os.environ.get("LAKE_DIR", "/lake"))
FACTS = "seed_facts.parquet"
PROFILES = "seed_profiles.parquet"
META = "seed_profiles_meta.json"

KINDS = {
    "neow": "ancient_offer",
    "ancient_offer": "ancient_offer",
    "ancient": "ancient",
    "event": "event",
    "boss": "boss",
    "elite": "elite",
    "offered": "card_offer",
    "card_offer": "card_offer",
    "relic": "relic",
    "deck": "deck",
    "shop_card": "shop_card",
    "shop_relic": "shop_relic",
    "shop_potion": "shop_potion",
}
COUNT_KINDS = {
    "deck",
    "offered",
    "card_offer",
    "shop_card",
    "shop_relic",
    "shop_potion",
}
MAX_PREDICATES = 12
MAX_LIMIT = 50
MAX_COUNT = 10
MAX_FLOOR = 99

SUMMARY_COLUMNS = (
    "seed_key, seed, build_id, player_count, party, runs, wins, abandoned, "
    "ascension_min, ascension_max, last_played, best_run_hash, best_win, "
    "best_run_time, best_floors, best_username, replay_run_hash"
)


class PredicateError(ValueError):
    pass


@dataclass(frozen=True)
class Predicate:
    kind: str
    id: str
    act: int | None = None
    floor_max: int | None = None
    floor_min: int | None = None
    seat: int | None = None
    count: int = 1

    def __post_init__(self) -> None:
        if self.kind not in KINDS:
            raise PredicateError(f"unknown predicate kind {self.kind}")
        if not self.id or len(self.id) > 64:
            raise PredicateError("predicate id is missing or too long")
        if self.count < 1 or self.count > MAX_COUNT:
            raise PredicateError(f"count must be 1 to {MAX_COUNT}")
        if self.count > 1 and self.kind not in COUNT_KINDS:
            raise PredicateError(f"{self.kind} does not take a count")
        if self.act is not None and not 1 <= self.act <= 4:
            raise PredicateError("act must be 1 to 4")
        if self.seat is not None and not 1 <= self.seat <= 4:
            raise PredicateError("seat must be 1 to 4")
        for f in (self.floor_max, self.floor_min):
            if f is not None and not 1 <= f <= MAX_FLOOR:
                raise PredicateError(f"floor must be 1 to {MAX_FLOOR}")
        if (
            self.floor_max is not None
            and self.floor_min is not None
            and self.floor_min > self.floor_max
        ):
            raise PredicateError("floor window is empty")

    @property
    def fact_kind(self) -> str:
        return KINDS[self.kind]

    def label(self) -> str:
        parts = [f"{self.kind}:{self.id}"]
        if self.count > 1:
            parts.append(f"x{self.count}")
        if self.act is not None:
            parts.append(f"act{self.act}")
        if self.floor_max is not None:
            parts.append(f"<=f{self.floor_max}")
        if self.floor_min is not None:
            parts.append(f">=f{self.floor_min}")
        if self.seat is not None:
            parts.append(f"seat{self.seat}")
        return " ".join(parts)


@dataclass(frozen=True)
class Scope:
    build_id: str | None = None
    player_count: int | None = None
    characters: tuple[str, ...] = field(default_factory=tuple)
    win_only: bool = False


def normalize_seed(raw: str) -> str:
    """The game reads O as 0 and I as 1; keep one spelling everywhere."""
    cleaned = "".join(ch for ch in (raw or "").upper() if ch.isalnum())
    return cleaned.replace("O", "0").replace("I", "1")[:24]


def available() -> bool:
    return (LAKE_DIR / FACTS).exists() and (LAKE_DIR / PROFILES).exists()


def meta() -> dict:
    try:
        with open(LAKE_DIR / META, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def generation() -> str:
    return str(meta().get("built_at") or "")


def _connect():
    from .lake_stats import _connect

    return _connect()


def _path(name: str) -> str:
    return str(LAKE_DIR / name).replace("'", "''")


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _summary_row(row: dict) -> dict[str, Any]:
    wins = int(row.get("wins") or 0)
    runs = int(row.get("runs") or 0)
    best = row.get("best_run_hash")
    replay = row.get("replay_run_hash")
    return {
        "seed": row.get("seed"),
        "build_id": row.get("build_id") or None,
        "players": int(row.get("player_count") or 1),
        "party": list(row.get("party") or []),
        "runs": runs,
        "wins": wins,
        "abandoned": int(row.get("abandoned") or 0),
        "win_rate": round(100.0 * wins / runs, 1) if runs else None,
        "ascension_min": row.get("ascension_min"),
        "ascension_max": row.get("ascension_max"),
        "last_played": _iso(row.get("last_played")),
        "best_run": {
            "run_hash": best,
            "url": f"/runs/{best}" if best else None,
            "win": bool(row.get("best_win")),
            "run_time": row.get("best_run_time"),
            "floors": row.get("best_floors"),
            "username": row.get("best_username"),
        }
        if best
        else None,
        "replay": {"run_hash": replay, "url": f"/runs/{replay}/replay"}
        if replay
        else None,
    }


def _display(row: dict) -> dict[str, Any]:
    return {
        "neow_offers": list(row.get("neow_offers") or []),
        "bosses": [dict(b) for b in (row.get("bosses") or [])],
        "ancients": [dict(a) for a in (row.get("ancients") or [])],
        "events": [dict(e) for e in (row.get("events") or [])],
    }


def _scope_sql(scope: Scope, params: list) -> str:
    clauses = []
    if scope.build_id:
        clauses.append("p.build_id = ?")
        params.append(scope.build_id)
    if scope.player_count:
        clauses.append("p.player_count = ?")
        params.append(int(scope.player_count))
    for ch in scope.characters:
        clauses.append("list_contains(p.party, ?)")
        params.append(ch)
    return (" AND " + " AND ".join(clauses)) if clauses else ""


def _fetch(con, sql: str, params: list) -> list[dict]:
    cur = con.execute(sql, params)
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def search(
    predicates: list[Predicate], scope: Scope, limit: int = 20
) -> dict[str, Any]:
    """Seeds whose best single run satisfied the most predicates first (all
    of them on top), then most wins, then most runs. Each row says which
    predicates that run matched and where."""
    if not predicates:
        return {"results": [], "predicates": 0, "labels": []}
    if len(predicates) > MAX_PREDICATES:
        raise PredicateError(f"at most {MAX_PREDICATES} predicates")
    limit = max(1, min(int(limit), MAX_LIMIT))
    facts = _path(FACTS)
    profiles = _path(PROFILES)
    parts: list[str] = []
    params: list = []
    for i, pr in enumerate(predicates):
        clauses = ["kind = ?", "id = ?"]
        params.extend([pr.fact_kind, pr.id])
        if pr.act is not None:
            clauses.append("act = ?")
            params.append(int(pr.act))
        if pr.floor_max is not None:
            clauses.append("floor <= ?")
            params.append(int(pr.floor_max))
        if pr.floor_min is not None:
            clauses.append("floor >= ?")
            params.append(int(pr.floor_min))
        if pr.seat is not None:
            clauses.append("seat = ?")
            params.append(int(pr.seat))
        if scope.win_only:
            clauses.append("win")
        params.append(int(pr.count))
        parts.append(
            f"SELECT seed_key, evidence, {i} AS idx, "
            "list(struct_pack(act := act, floor := floor) ORDER BY act NULLS LAST, floor NULLS LAST) AS where_ "
            f"FROM read_parquet('{facts}') WHERE {' AND '.join(clauses)} "
            "GROUP BY seed_key, evidence HAVING sum(n) >= ?"
        )
    scope_sql = _scope_sql(scope, params)
    params.append(limit)
    sql = f"""
    WITH hits AS ({" UNION ALL ".join(parts)}),
    scored AS (
      SELECT seed_key, evidence, count(*) AS matched, list(idx ORDER BY idx) AS idxs,
        list(struct_pack(idx := idx, where_ := where_) ORDER BY idx) AS wheres
      FROM hits GROUP BY seed_key, evidence
    ),
    best_evidence AS (
      SELECT * FROM (
        SELECT *, row_number() OVER (PARTITION BY seed_key ORDER BY matched DESC, evidence) AS rn
        FROM scored
      ) WHERE rn = 1
    )
    SELECT {SUMMARY_COLUMNS}, s.evidence, s.matched, s.idxs, s.wheres
    FROM best_evidence s JOIN read_parquet('{profiles}') p USING (seed_key)
    WHERE true {scope_sql}
    ORDER BY s.matched DESC, p.wins DESC, p.runs DESC, p.last_played DESC NULLS LAST, p.seed_key
    LIMIT ?
    """
    con = _connect()
    try:
        rows = _fetch(con, sql, params)
        keys = [r["seed_key"] for r in rows]
        display: dict[str, dict] = {}
        if keys:
            placeholders = ",".join("?" for _ in keys)
            for d in _fetch(
                con,
                f"SELECT seed_key, neow_offers, bosses, ancients, events FROM read_parquet('{profiles}') "
                f"WHERE seed_key IN ({placeholders})",
                keys,
            ):
                display[d["seed_key"]] = d
    finally:
        con.close()
    labels = [pr.label() for pr in predicates]
    results = []
    for row in rows:
        idxs = [int(i) for i in (row.get("idxs") or [])]
        where = {}
        for w in row.get("wheres") or []:
            w = dict(w)
            where[labels[int(w["idx"])]] = [
                {"act": x.get("act"), "floor": x.get("floor")}
                for x in (w.get("where_") or [])[:12]
            ]
        matched = [labels[i] for i in idxs]
        item = _summary_row(row)
        item.update(_display(display.get(row["seed_key"], {})))
        item.update(
            {
                "matched": matched,
                "missing": [lab for lab in labels if lab not in matched],
                "full_match": len(matched) == len(labels),
                "where": where,
            }
        )
        results.append(item)
    return {"results": results, "predicates": len(labels), "labels": labels}


def profile(seed: str, build_id: str | None = None) -> dict[str, Any]:
    """Everything the index knows about one seed, across every party and
    lobby size it was played with. The inspect page renders this."""
    profiles = _path(PROFILES)
    params: list = [normalize_seed(seed)]
    build_sql = ""
    if build_id:
        build_sql = " AND p.build_id = ?"
        params.append(build_id)
    con = _connect()
    try:
        rows = _fetch(
            con,
            f"SELECT p.* FROM read_parquet('{profiles}') p WHERE p.seed = ?{build_sql} "
            "ORDER BY p.runs DESC, p.wins DESC, p.seed_key",
            params,
        )
    finally:
        con.close()
    variants = []
    for row in rows:
        item = _summary_row(row)
        item.update(_display(row))
        item["path"] = [dict(p) for p in (row.get("path") or [])]
        item["shops"] = _json_safe(row.get("shops") or [])
        item["map_act1"] = _json_safe(row.get("map_act1") or [])
        item["facts"] = [dict(f) for f in (row.get("facts") or [])]
        item["run_hashes"] = list(row.get("run_hashes") or [])
        variants.append(item)
    return {"seed": params[0], "variants": variants}


def random_seed(build_id: str | None = None, min_runs: int = 1) -> dict | None:
    """One seed chosen uniformly among the distinct seeds that qualify, then
    its most played variant."""
    profiles = _path(PROFILES)
    params: list = [int(min_runs)]
    build_sql = ""
    if build_id:
        build_sql = " AND build_id = ?"
        params.append(build_id)
    con = _connect()
    try:
        picked = _fetch(
            con,
            f"SELECT seed FROM (SELECT DISTINCT seed FROM read_parquet('{profiles}') "
            f"WHERE runs >= ?{build_sql}) USING SAMPLE reservoir(1 ROWS)",
            params,
        )
        if not picked:
            return None
        rows = _fetch(
            con,
            f"SELECT {SUMMARY_COLUMNS}, neow_offers, bosses, ancients, events FROM read_parquet('{profiles}') "
            f"WHERE seed = ?{build_sql} ORDER BY runs DESC, wins DESC, seed_key LIMIT 1",
            [picked[0]["seed"], *params[1:]],
        )
    finally:
        con.close()
    if not rows:
        return None
    item = _summary_row(rows[0])
    item.update(_display(rows[0]))
    return item
