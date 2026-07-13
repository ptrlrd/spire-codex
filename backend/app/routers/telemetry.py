"""Daily-active-user telemetry.

The in-game mod posts once per launch to POST /api/telemetry/ping, authenticated with the
Steam-issued JWT it already holds (a public client can carry no static secret, so the
Steam ticket is the security gate). The backend stores only a salted hash of the steam id,
one doc per (day, hash) - so DAU(day) = distinct hashes that day, one count per account per
day, pseudonymous in storage, and not inflatable without real game-owning Steam accounts.
Docs carry a TTL (~120 days); longer history would want a separate daily rollup. Mongo-only:
without MONGO_URL the endpoints return 503.

Set TELEMETRY_SALT (a server-side secret, in neither repo) so the stored hashes are not
reversible by brute-forcing the 17-digit steam id space.
"""

from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/api/telemetry", tags=["Telemetry"])

# DAU day boundaries follow Pacific time (the operator's local day), so "active
# today" rolls over at PT midnight rather than UTC. The stored day is a plain
# YYYY-MM-DD string; admin._dau_info reads it back with the same zone.
DAU_TZ = ZoneInfo("America/Los_Angeles")

DAU_TTL_DAYS = 120
_MAX_STR = 64

_coll = None


def _dau_coll():
    global _coll
    if _coll is None:
        from ..services.runs_db_mongo import get_database

        coll = get_database().telemetry_dau
        coll.create_index("seen_at", expireAfterSeconds=DAU_TTL_DAYS * 86400)
        coll.create_index("day")
        _coll = coll
    return _coll


def _require_mongo():
    if not os.environ.get("MONGO_URL", "").strip():
        raise HTTPException(status_code=503, detail="telemetry unavailable")


def _clean(v):
    return v[:_MAX_STR] if isinstance(v, str) and v else None


def _hash_steam_id(steam_id: str) -> str:
    salt = os.environ.get("TELEMETRY_SALT", "")
    return hashlib.sha256(f"{salt}:{steam_id}".encode()).hexdigest()


@router.post("/ping")
async def ping(request: Request):
    _require_mongo()

    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="telemetry requires sign-in")
    from ..services.auth_jwt import decode_token

    claims = decode_token(auth[7:].strip())
    steam_id = str((claims or {}).get("steam_id") or "")
    if not steam_id.isdigit():
        raise HTTPException(status_code=401, detail="invalid token")

    try:
        data = await request.json()
    except Exception:
        data = {}
    if not isinstance(data, dict):
        data = {}

    now = datetime.now(timezone.utc)
    day = now.astimezone(DAU_TZ).strftime("%Y-%m-%d")
    uid = _hash_steam_id(steam_id)
    _dau_coll().update_one(
        {"_id": f"{day}:{uid}"},
        {
            "$set": {
                "day": day,
                "uid": uid,
                "mod_version": _clean(data.get("mod_version")),
                "sts2_version": _clean(data.get("sts2_version")),
                "seen_at": now,
            }
        },
        upsert=True,
    )
    return {"ok": True}


@router.get("/dau")
def dau(days: int = 30):
    _require_mongo()
    days = max(1, min(days, DAU_TTL_DAYS))
    rows = _dau_coll().aggregate(
        [
            {"$group": {"_id": "$day", "count": {"$sum": 1}}},
            {"$sort": {"_id": -1}},
            {"$limit": days},
        ]
    )
    return {"dau": [{"day": r["_id"], "count": r["count"]} for r in rows]}
