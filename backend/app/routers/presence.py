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


# Current-screen spectator detail: the live event (name/prompt/options) and the shop
# (items/costs). Both are transient and cleared when the player leaves the screen.
_EVENT_OPTIONS_CAP = 12
_SHOP_ITEMS_CAP = 12
_TITLE_CAP = 200
_PROMPT_CAP = 2000
_OPT_TEXT_CAP = 400


def _clean_event_ctx(raw) -> dict | None:
    """The live event the player is reading: id + resolved title/prompt + the options on
    offer. The mod ships already-localized text, so the frontend renders it as-is."""
    if not isinstance(raw, dict):
        return None
    eid = raw.get("id")
    if not isinstance(eid, str) or not _safe_id(eid[:_MAX_STR]):
        return None
    out: dict = {"id": eid[:_MAX_STR]}
    if isinstance(raw.get("title"), str) and raw["title"]:
        out["title"] = raw["title"][:_TITLE_CAP]
    if isinstance(raw.get("prompt"), str) and raw["prompt"]:
        out["prompt"] = raw["prompt"][:_PROMPT_CAP]
    options: list[dict] = []
    raw_opts = raw.get("options")
    if isinstance(raw_opts, list):
        for o in raw_opts[:_EVENT_OPTIONS_CAP]:
            if not isinstance(o, dict):
                continue
            opt: dict = {}
            if isinstance(o.get("key"), str):
                opt["key"] = o["key"][:_MAX_STR]
            if isinstance(o.get("text"), str):
                opt["text"] = o["text"][:_OPT_TEXT_CAP]
            for flag in ("locked", "proceed", "chosen"):
                if isinstance(o.get(flag), bool):
                    opt[flag] = o[flag]
            if opt:
                options.append(opt)
    out["options"] = options
    return out


def _shop_item(o) -> dict | None:
    if not isinstance(o, dict):
        return None
    # A shop slot is only renderable with a resolvable item id, so require a
    # safe one; this also drops any id carrying a path-traversal sequence
    # (rather than leaving a costed orphan with no name or image).
    oid = o.get("id")
    if not isinstance(oid, str) or not _safe_id(oid[:_MAX_STR]):
        return None
    item: dict = {"id": oid[:_MAX_STR]}
    if isinstance(o.get("cost"), (int, float)) and not isinstance(o.get("cost"), bool):
        item["cost"] = int(o["cost"])
    for flag in ("stocked", "on_sale"):
        if isinstance(o.get(flag), bool):
            item[flag] = o[flag]
    if isinstance(o.get("slot"), str) and o["slot"]:
        item["slot"] = o["slot"][:16]
    return item or None


def _clean_shop(raw) -> dict | None:
    """The current merchant inventory: items (frontend resolves id -> name/image) + costs."""
    if not isinstance(raw, dict):
        return None
    out: dict = {}
    for cat in ("cards", "relics", "potions"):
        lst = raw.get(cat)
        if isinstance(lst, list):
            out[cat] = [
                it for it in (_shop_item(o) for o in lst[:_SHOP_ITEMS_CAP]) if it
            ]
    rm = raw.get("removal")
    if isinstance(rm, dict):
        r: dict = {}
        if isinstance(rm.get("cost"), (int, float)) and not isinstance(
            rm.get("cost"), bool
        ):
            r["cost"] = int(rm["cost"])
        if isinstance(rm.get("stocked"), bool):
            r["stocked"] = rm["stocked"]
        if r:
            out["removal"] = r
    return out or None


# Live combat enemies for the spectator combat panel: per enemy hp/block plus the
# upcoming intent(s). A move can carry several intents (e.g. attack + buff), so
# `intents` is a list of {type, dmg?, hits?}; `type` is the codex intent category
# (attack, defend, buff, debuff, heal, escape, summon, carddebuff, deathblow,
# hidden, unknown), `dmg` the base per-hit damage and `hits` the strike count.
_ENEMIES_CAP = 8
_INTENTS_CAP = 6


def _clean_intent(o) -> dict | None:
    if not isinstance(o, dict):
        return None
    t = o.get("type")
    if not isinstance(t, str) or not t:
        return None
    out: dict = {"type": t[:24]}
    for k in ("dmg", "hits"):
        v = o.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            out[k] = int(v)
    return out


def _clean_enemies(raw) -> list[dict] | None:
    """The living enemies in the current fight, with hp/block and intents. Richer
    than the bare `fighting` id list (which stays for the roster chip)."""
    if not isinstance(raw, list):
        return None
    out: list[dict] = []
    for o in raw[:_ENEMIES_CAP]:
        if not isinstance(o, dict):
            continue
        en: dict = {}
        # id flows into the enemy portrait URL, so guard it; an enemy with no safe
        # id still renders from its name, so keep the entry either way.
        oid = o.get("id")
        if isinstance(oid, str) and _safe_id(oid[:_MAX_STR]):
            en["id"] = oid[:_MAX_STR]
        if isinstance(o.get("name"), str) and o["name"]:
            en["name"] = o["name"][:_MAX_STR]
        for k in ("hp", "max_hp", "block"):
            v = o.get(k)
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                en[k] = int(v)
        raw_intents = o.get("intents")
        if isinstance(raw_intents, list):
            en["intents"] = [
                it
                for it in (_clean_intent(i) for i in raw_intents[:_INTENTS_CAP])
                if it
            ]
        if en:
            out.append(en)
    return out or None


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

    # Current-screen detail: the live event, the shop, and combat enemies. Present
    # only on those screens.
    if (ev := _clean_event_ctx(data.get("event"))) is not None:
        fields["event"] = ev
    if (shp := _clean_shop(data.get("shop"))) is not None:
        fields["shop"] = shp
    if (en := _clean_enemies(data.get("enemies"))) is not None:
        fields["enemies"] = en

    # Transient fields: when the mod sends these as explicit null (combat ended / left the
    # screen), clear them rather than leaving stale values. pos is NOT in this set on
    # purpose: keeping the last node avoids a blinking map marker between nodes.
    unset = [
        k
        for k in ("turn", "fighting", "event", "shop", "enemies")
        if k in data and data[k] is None
    ]

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
