"""Seed Finder queries over the nightly seed index (lab/seed_profiles.py).

seed_facts.parquet is the inverted index: one row per (seed_key, kind, id,
act, floor, seat). seed_profiles.parquet is the summary per seed_key. A
search turns each predicate into a scan of the facts for that kind and id,
counts how many predicates each seed satisfied, and joins the profiles for
the rows it returns. Serving reads are small in-memory DuckDB connections
against the parquet files in LAKE_DIR, never the lake scratch database."""

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
MAX_PREDICATES = 12
MAX_LIMIT = 50


@dataclass(frozen=True)
class Predicate:
    kind: str
    id: str
    act: int | None = None
    floor_max: int | None = None
    floor_min: int | None = None
    seat: int | None = None
    count: int = 1

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


def available() -> bool:
    return (LAKE_DIR / FACTS).exists() and (LAKE_DIR / PROFILES).exists()


def meta() -> dict:
    try:
        with open(LAKE_DIR / META, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _connect():
    from .lake_stats import _connect

    return _connect()


def _profile_row(row: dict) -> dict[str, Any]:
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
        "neow_offers": list(row.get("neow_offers") or []),
        "bosses": [dict(b) for b in (row.get("bosses") or [])],
        "ancients": [dict(a) for a in (row.get("ancients") or [])],
        "events": [dict(e) for e in (row.get("events") or [])],
        "path": [dict(p) for p in (row.get("path") or [])],
        "best_run": {
            "run_hash": best,
            "url": f"/runs/{best}" if best else None,
            "win": bool(row.get("best_win")),
            "run_time": row.get("best_run_time"),
            "floors": row.get("best_floors"),
            "character": row.get("best_character"),
            "username": row.get("best_username"),
        }
        if best
        else None,
        "replay": {"run_hash": replay, "url": f"/runs/{replay}/replay"}
        if replay
        else None,
        "has_shops": bool(row.get("shops")),
        "has_map": bool(row.get("map_act1")),
    }


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


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
    if scope.win_only:
        clauses.append("p.wins > 0")
    return (" AND " + " AND ".join(clauses)) if clauses else ""


def search(
    predicates: list[Predicate], scope: Scope, limit: int = 20
) -> dict[str, Any]:
    """Seeds satisfying the most predicates first (all-required matches on
    top), then most wins, then most runs. Each row says which predicates it
    matched and where."""
    if not predicates:
        return {"results": [], "predicates": 0}
    predicates = predicates[:MAX_PREDICATES]
    limit = max(1, min(int(limit), MAX_LIMIT))
    facts = str(LAKE_DIR / FACTS)
    profiles = str(LAKE_DIR / PROFILES)
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
        having = "count(*) >= ?" if pr.count > 1 else "true"
        if pr.count > 1:
            params.append(int(pr.count))
        parts.append(
            f"SELECT seed_key, {i} AS idx, list(struct_pack(act := act, floor := floor)) AS where_ "
            f"FROM read_parquet('{facts}') WHERE {' AND '.join(clauses)} GROUP BY seed_key HAVING {having}"
        )
    scope_sql = _scope_sql(scope, params)
    params.append(limit)
    sql = f"""
    WITH hits AS ({" UNION ALL ".join(parts)}),
    scored AS (
      SELECT seed_key, count(*) AS matched, list(idx ORDER BY idx) AS idxs,
        list(struct_pack(idx := idx, where_ := where_)) AS wheres
      FROM hits GROUP BY seed_key
    )
    SELECT p.*, s.matched, s.idxs, s.wheres
    FROM scored s JOIN read_parquet('{profiles}') p USING (seed_key)
    WHERE true {scope_sql}
    ORDER BY s.matched DESC, p.wins DESC, p.runs DESC, p.last_played DESC
    LIMIT ?
    """
    con = _connect()
    try:
        cur = con.execute(sql, params)
        cols = [c[0] for c in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
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
        item = _profile_row(row)
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
    profiles = str(LAKE_DIR / PROFILES)
    facts = str(LAKE_DIR / FACTS)
    params: list = [seed]
    build_sql = ""
    if build_id:
        build_sql = " AND p.build_id = ?"
        params.append(build_id)
    con = _connect()
    try:
        cur = con.execute(
            f"SELECT p.* FROM read_parquet('{profiles}') p WHERE p.seed = ?{build_sql} "
            "ORDER BY p.runs DESC, p.wins DESC",
            params,
        )
        cols = [c[0] for c in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        keys = [r["seed_key"] for r in rows]
        detail: dict[str, list[dict]] = {}
        if keys:
            placeholders = ",".join("?" for _ in keys)
            fcur = con.execute(
                f"SELECT seed_key, kind, id, act, floor, seat FROM read_parquet('{facts}') "
                f"WHERE seed_key IN ({placeholders}) AND kind IN ('card_offer','relic','shop_card','shop_relic','shop_potion','elite') "
                "ORDER BY act NULLS LAST, floor NULLS LAST, seat, id",
                keys,
            )
            for seed_key, kind, fid, act, floor, seat in fcur.fetchall():
                detail.setdefault(seed_key, []).append(
                    {"kind": kind, "id": fid, "act": act, "floor": floor, "seat": seat}
                )
    finally:
        con.close()
    variants = []
    for row in rows:
        item = _profile_row(row)
        item["shops"] = _json_safe(row.get("shops") or [])
        item["map_act1"] = _json_safe(row.get("map_act1") or [])
        item["facts"] = detail.get(row["seed_key"], [])
        item["run_hashes"] = list(row.get("run_hashes") or [])[:50]
        variants.append(item)
    return {"seed": seed, "variants": variants}


def random_seed(build_id: str | None = None, min_runs: int = 1) -> dict | None:
    profiles = str(LAKE_DIR / PROFILES)
    params: list = [int(min_runs)]
    build_sql = ""
    if build_id:
        build_sql = " AND build_id = ?"
        params.append(build_id)
    con = _connect()
    try:
        cur = con.execute(
            f"SELECT * FROM read_parquet('{profiles}') WHERE runs >= ?{build_sql} ORDER BY random() LIMIT 1",
            params,
        )
        cols = [c[0] for c in cur.description]
        row = cur.fetchone()
    finally:
        con.close()
    return _profile_row(dict(zip(cols, row))) if row else None


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value
