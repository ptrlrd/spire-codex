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
    "turn",
)
_STR_FIELDS = ("character", "seed", "screen", "sts2_version", "username")
_LIST_CAPS = {"deck": 200, "relics": 100, "potions": 10, "fighting": 8}


def _safe_id(s: str) -> bool:
    """Entity ids (cards, relics, potions, monsters, events) flow straight
    into image/CDN URLs and Link hrefs on the frontend, so reject anything
    that could smuggle a path-traversal sequence through the heartbeat. Real
    game ids are letters/digits/underscore with an optional `+` upgrade
    suffix; a `/`, `\\`, or `..` never appears in one."""
    return bool(s) and "/" not in s and "\\" not in s and ".." not in s


# Play-by-play ticker events riding the heartbeat: {"k": kind, "v": entity id,
# "turn": combat turn, "t": unix seconds}. Kinds today: card, potion, combat,
# victory, buy, death, act, event, remove. Appended server-side to a rolling
# window per player.
_EVENTS_PER_BEAT = 40

# Spectator map caps: nodes [col,row,type], edges [c,r,childC,childR],
# path/pos coords [col,row]. An act map is ~50 nodes; caps are headroom.
_MAP_NODES_CAP = 150
_MAP_EDGES_CAP = 400
_PATH_CAP = 64


def _int_pair(v) -> list[int] | None:
    if (
        isinstance(v, list)
        and len(v) == 2
        and all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in v)
    ):
        return [int(v[0]), int(v[1])]
    return None


def _clean_map(raw) -> dict | None:
    """The static act graph the mod sends once per act: nodes/edges for the
    spectator mini-map. Returns None when the payload has no usable map."""
    if not isinstance(raw, dict):
        return None
    nodes = []
    for n in (
        raw.get("nodes", [])[:_MAP_NODES_CAP]
        if isinstance(raw.get("nodes"), list)
        else []
    ):
        if (
            isinstance(n, list)
            and len(n) == 3
            and all(
                isinstance(x, (int, float)) and not isinstance(x, bool) for x in n[:2]
            )
            and isinstance(n[2], str)
        ):
            nodes.append([int(n[0]), int(n[1]), n[2][:16]])
    edges = []
    for e in (
        raw.get("edges", [])[:_MAP_EDGES_CAP]
        if isinstance(raw.get("edges"), list)
        else []
    ):
        if (
            isinstance(e, list)
            and len(e) == 4
            and all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in e)
        ):
            edges.append([int(x) for x in e])
    if not nodes:
        return None
    out: dict = {"nodes": nodes, "edges": edges}
    if isinstance(raw.get("act"), (int, float)) and not isinstance(
        raw.get("act"), bool
    ):
        out["act"] = int(raw["act"])
    return out


def _clean_events(raw) -> list[dict]:
    events: list[dict] = []
    if not isinstance(raw, list):
        return events
    for e in raw[:_EVENTS_PER_BEAT]:
        if not isinstance(e, dict):
            continue
        kind = e.get("k")
        if not isinstance(kind, str) or not kind:
            continue
        ev: dict = {"k": kind[:24]}
        if isinstance(e.get("v"), str) and e["v"]:
            v = e["v"][:_MAX_STR]
            # Same traversal guard as the id lists: an event's `v` is an entity
            # id the frontend turns into an image/link. Drop only the unsafe
            # value, keep the event (its kind/turn still render).
            if _safe_id(v):
                ev["v"] = v
        if isinstance(e.get("turn"), (int, float)) and not isinstance(
            e.get("turn"), bool
        ):
            ev["turn"] = int(e["turn"])
        if isinstance(e.get("t"), (int, float)) and not isinstance(e.get("t"), bool):
            ev["t"] = int(e["t"])
        events.append(ev)
    return events


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
                s
                for x in v[:cap]
                if isinstance(x, (str, int)) and _safe_id(s := str(x)[:_MAX_STR])
            ]

    # Spectator map: path + position ride every beat; the node/edge graph only
    # arrives when the act changes (the $set keeps the stored one between beats).
    if isinstance(data.get("path"), list):
        path = [p for p in (_int_pair(x) for x in data["path"][:_PATH_CAP]) if p]
        fields["path"] = path
    if (pos := _int_pair(data.get("pos"))) is not None:
        fields["pos"] = pos
    if (m := _clean_map(data.get("map"))) is not None:
        fields["map"] = m

    # Transient combat context: when the mod sends these as explicit null (combat
    # just ended), clear them rather than leaving the last fight's values stale.
    # pos is NOT in this set on purpose: keeping the last node avoids a blinking
    # map marker while the player travels between nodes.
    unset = [k for k in ("turn", "fighting") if k in data and data[k] is None]

    # Display name: the verified user record outranks the client-sent username.
    try:
        from ..services.users_db import get_user_by_steam_id

        user = get_user_by_steam_id(steam_id)
        if user and user.get("username"):
            fields["username"] = user["username"]
    except Exception:
        pass

    presence_db.heartbeat(steam_id, fields, _clean_events(data.get("events")), unset)
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
