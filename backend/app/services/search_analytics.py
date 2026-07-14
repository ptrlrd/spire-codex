"""Search-query logging + analytics over the global search bar.

The frontend beacons a *committed* search — the query the user picked a result
on, or settled on before leaving — to /api/search/log, which lands here. Logging
the settled query rather than every debounced keystroke keeps prefixes ("fir" on
the way to "fireleaf") out of the data, so the counts reflect real intent. Each
row records the query, lang, result count, a zero flag, whether it led to a
click, and a day-scoped IP hash (the raw IP is never stored). A TTL index trims
the log after the retention window. Zero-result queries — the "what can't they
find" signal Prometheus's per-entity counters miss — come through the same
beacon when a search returns nothing and the user gives up.
"""

import hashlib
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger("spire-codex")

SEARCH_LOG_COLLECTION = "search_log"
# How long a logged query is kept before Mongo's TTL monitor drops it.
_RETENTION_DAYS = 90
_MAX_DAYS = 90

_indexed = False


def _col():
    from .runs_db_mongo import _get_collection

    col = _get_collection().database[SEARCH_LOG_COLLECTION]
    global _indexed
    if not _indexed:
        try:
            # One TTL index on `at` serves both the range/sort queries and the
            # automatic retention trim.
            col.create_index(
                "at", expireAfterSeconds=_RETENTION_DAYS * 86400, name="ttl_at"
            )
            _indexed = True
        except Exception:
            logger.warning("search-analytics: index setup failed", exc_info=True)
    return col


def _ip_hash(ip: str) -> str:
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return hashlib.sha256(f"{day}|{ip}".encode()).hexdigest()[:16]


def _iso(dt: Any) -> str | None:
    return dt.isoformat() if isinstance(dt, datetime) else None


def _cutoff(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=max(1, days))


def log_search(
    q: str, lang: str, results: int, ip: str = "", clicked: bool = False
) -> None:
    """Record one committed search. Guarded and swallowed so a logging hiccup
    can never fail the request that sent it."""
    if not os.environ.get("MONGO_URL", "").strip():
        return
    try:
        norm = (q or "").strip().lower()
        if not norm:
            return
        _col().insert_one(
            {
                "q": (q or "").strip()[:80],
                "q_norm": norm[:80],
                "lang": lang or "eng",
                "results": int(results),
                "zero": int(results) == 0,
                "clicked": bool(clicked),
                "ip_hash": _ip_hash(ip) if ip else None,
                "at": datetime.now(timezone.utc),
            }
        )
    except Exception:
        logger.warning("search-analytics: log write failed", exc_info=True)


def _top(match: dict, limit: int) -> list[dict]:
    pipeline = [
        {"$match": match},
        {
            "$group": {
                "_id": "$q_norm",
                "count": {"$sum": 1},
                "clients": {"$addToSet": "$ip_hash"},
                "zero": {"$sum": {"$cond": ["$zero", 1, 0]}},
                "clicks": {"$sum": {"$cond": ["$clicked", 1, 0]}},
                "sample": {"$last": "$q"},
                "last_at": {"$max": "$at"},
            }
        },
        {"$sort": {"count": -1, "_id": 1}},
        {"$limit": limit},
    ]
    out = []
    for r in _col().aggregate(pipeline, allowDiskUse=True):
        count = r.get("count") or 0
        clients = [c for c in (r.get("clients") or []) if c]
        out.append(
            {
                "query": r.get("sample") or r["_id"],
                "count": count,
                "clients": len(clients),
                "clicks": r.get("clicks") or 0,
                "zero_rate": round((r.get("zero") or 0) / count, 3) if count else 0,
                "last_at": _iso(r.get("last_at")),
            }
        )
    return out


def top_searches(days: int = 7, limit: int = 50) -> list[dict]:
    return _top({"at": {"$gte": _cutoff(days)}}, limit)


def zero_result_searches(days: int = 7, limit: int = 50) -> list[dict]:
    return _top({"at": {"$gte": _cutoff(days)}, "zero": True}, limit)


def search_volume(days: int = 30) -> list[dict]:
    pipeline = [
        {"$match": {"at": {"$gte": _cutoff(days)}}},
        {
            "$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$at"}},
                "count": {"$sum": 1},
                "zero": {"$sum": {"$cond": ["$zero", 1, 0]}},
            }
        },
        {"$sort": {"_id": 1}},
    ]
    return [
        {"day": r["_id"], "count": r["count"], "zero": r.get("zero", 0)}
        for r in _col().aggregate(pipeline, allowDiskUse=True)
    ]


def recent_searches(limit: int = 100) -> list[dict]:
    cur = (
        _col()
        .find({}, {"q": 1, "lang": 1, "results": 1, "at": 1, "_id": 0})
        .sort("at", -1)
        .limit(limit)
    )
    return [
        {
            "query": d.get("q"),
            "lang": d.get("lang"),
            "results": d.get("results"),
            "at": _iso(d.get("at")),
        }
        for d in cur
    ]


def summary(days: int = 7) -> dict:
    pipeline = [
        {"$match": {"at": {"$gte": _cutoff(days)}}},
        {
            "$group": {
                "_id": None,
                "total": {"$sum": 1},
                "zero": {"$sum": {"$cond": ["$zero", 1, 0]}},
                "clicks": {"$sum": {"$cond": ["$clicked", 1, 0]}},
                "queries": {"$addToSet": "$q_norm"},
                "clients": {"$addToSet": "$ip_hash"},
            }
        },
    ]
    docs = list(_col().aggregate(pipeline, allowDiskUse=True))
    if not docs:
        return {
            "total": 0,
            "distinct": 0,
            "zero": 0,
            "zero_rate": 0,
            "ctr": 0,
            "clients": 0,
            "days": days,
        }
    d = docs[0]
    total = d.get("total") or 0
    return {
        "total": total,
        "distinct": len([q for q in (d.get("queries") or []) if q]),
        "zero": d.get("zero") or 0,
        "zero_rate": round((d.get("zero") or 0) / total, 3) if total else 0,
        "ctr": round((d.get("clicks") or 0) / total, 3) if total else 0,
        "clients": len([c for c in (d.get("clients") or []) if c]),
        "days": days,
    }


def overview(days: int = 7, limit: int = 50) -> dict:
    days = max(1, min(days, _MAX_DAYS))
    limit = max(1, min(limit, 200))
    return {
        "summary": summary(days),
        "top": top_searches(days, limit),
        "zero": zero_result_searches(days, limit),
        "volume": search_volume(max(days, 30)),
        "recent": recent_searches(100),
    }
