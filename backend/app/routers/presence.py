"""Live presence endpoints for the in-game mod ("who is in a run right now").

POST /api/presence            — heartbeat from the mod, Bearer JWT required (the verified
                                steam_id keys the entry, so nobody can publish as someone
                                else). Body {"ended": true} clears the entry.
GET  /api/presence/active     — public roster of live runs (no deck detail), deepest first.
GET  /api/presence/{steam_id} — one player's full live doc (deck/relics/potions) for a
                                live run view. 404 when not live.
"""

import os

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/api/presence", tags=["Presence"])

_MAX_STR = 64
_INT_FIELDS = (
    "act",
    "act_floor",
    "total_floor",
    "hp",
    "max_hp",
    "gold",
    "ascension",
    "player_count",
)
_STR_FIELDS = ("character", "seed", "screen", "sts2_version", "username")
_LIST_CAPS = {"deck": 200, "relics": 100, "potions": 10}


def _require_mongo():
    if not os.environ.get("MONGO_URL", "").strip():
        raise HTTPException(status_code=503, detail="presence unavailable")


@router.post("")
async def post_presence(request: Request):
    _require_mongo()

    auth_header = request.headers.get("authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="presence requires Steam sign-in")
    from ..services.auth_jwt import decode_token

    claims = decode_token(auth_header[7:].strip())
    steam_id = str((claims or {}).get("steam_id") or "")
    if not steam_id.isdigit():
        raise HTTPException(status_code=401, detail="invalid token")

    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid json")
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="invalid payload")

    from ..services import presence_db

    if data.get("ended"):
        presence_db.end(steam_id)
        return {"ok": True, "ended": True}

    # Whitelist-copy the heartbeat; everything else in the body is dropped.
    fields: dict = {}
    for k in _INT_FIELDS:
        v = data.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            fields[k] = int(v)
    for k in _STR_FIELDS:
        v = data.get(k)
        if isinstance(v, str) and v:
            fields[k] = v[:_MAX_STR]
    for k, cap in _LIST_CAPS.items():
        v = data.get(k)
        if isinstance(v, list):
            fields[k] = [
                str(x)[:_MAX_STR] for x in v[:cap] if isinstance(x, (str, int))
            ]

    # Display name: the verified user record outranks the client-sent username.
    try:
        from ..services.users_db import get_user_by_steam_id

        user = get_user_by_steam_id(steam_id)
        if user and user.get("username"):
            fields["username"] = user["username"]
    except Exception:
        pass

    presence_db.heartbeat(steam_id, fields)
    return {"ok": True}


@router.get("/active")
def get_active(limit: int = 50):
    _require_mongo()
    from ..services import presence_db

    players = presence_db.active(max(1, min(limit, 100)))
    return {"count": len(players), "players": players}


@router.get("/{steam_id}")
def get_player(steam_id: str):
    _require_mongo()
    digits = "".join(ch for ch in steam_id if ch.isdigit())
    if not digits:
        raise HTTPException(status_code=400, detail="bad steam_id")
    from ..services import presence_db

    doc = presence_db.get(digits)
    if not doc:
        raise HTTPException(status_code=404, detail="not live")
    return doc
