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
    # Run timer in seconds (freezes at win); present the whole run, not unset.
    "run_time",
    # Live combat vitals + pile sizes for the spectator combat view. `energy` and
    # the pile counts are combat-only (cleared by the transient-unset list below);
    # `block`/`max_energy` are sent the whole run, so they are NOT unset.
    "block",
    "energy",
    "max_energy",
    "draw_count",
    "discard_count",
    "exhaust_count",
    # Channeled-orb slot capacity (combat-only, orb characters); the orbs
    # themselves ride a separate cleaned list. In the transient-unset set.
    "orb_slots",
    # Live combat damage (DPS) for the spectator view; absent / null outside a
    # fight, cleared by the transient-unset list below when the mod sends null.
    "damage_dealt",
    "damage_dealt_this_turn",
    "damage_taken",
    "biggest_hit",
)
_STR_FIELDS = (
    "character",
    "seed",
    "screen",
    "sts2_version",
    "username",
    "act_name",
    # whose turn it is in combat: "player" / "enemy". Combat-only, in the
    # transient-unset set below.
    "turn_side",
)
# `hand` is the live combat hand (card ids); combat-only, so it's in the
# transient-unset list below. `modifiers` are the run's daily/custom mutators —
# valid the whole run, so NOT unset.
_LIST_CAPS = {
    "deck": 200,
    "relics": 100,
    "potions": 10,
    "fighting": 8,
    "hand": 20,
    "modifiers": 20,
    "draw_pile": 100,
    "discard_pile": 100,
    "exhaust_pile": 100,
}


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


def _clean_reveals(raw) -> list | None:
    """Per-node progressive reveals for the spectator map: one
    [col, row, room_type, encounter_id] per VISITED node, the actual resolved
    room type (so a `?` node shows what it became) and the encounter/event id
    (null for shop/rest/treasure). Same coord space as the map nodes; grows as
    the player walks. Capped (an act is ~15 nodes)."""
    if not isinstance(raw, list):
        return None
    out = []
    for e in raw[:64]:
        if isinstance(e, list) and len(e) == 4 and _int_pair(e[:2]):
            rt = e[2] if isinstance(e[2], str) else ""
            enc = e[3] if isinstance(e[3], str) else None
            out.append([int(e[0]), int(e[1]), rt[:_MAX_STR], enc])
    return out


# Route (the act's structure) + loot (the combat/reward screen). Route persists
# per act like the map; loot is transient, cleared when the player leaves the
# reward screen.
_LOOT_CAP = 20
_PACKS_CAP = 8  # scroll-box offers 2 bundles; cap generously
_ROUTE_CAP = 30


def _route_node(o) -> dict | None:
    """One route entry (boss / ancient / an elite/monster/event). Keeps the id
    plus optional name/room_type and grid position, when the mod sends them."""
    if not isinstance(o, dict):
        return None
    out: dict = {}
    for key in ("id", "name", "room_type"):
        v = o.get(key)
        if isinstance(v, str) and v:
            out[key] = v[:_MAX_STR]
    for key in ("col", "row", "floor"):
        v = o.get(key)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            out[key] = int(v)
    return out or None


def _clean_route(raw) -> dict | None:
    """The act's route: the boss + ancient (single nodes) and the elite / monster
    / event nodes. Persists between beats (the $set keeps it until the act changes)."""
    if not isinstance(raw, dict):
        return None
    out: dict = {}
    for single in ("boss", "ancient"):
        node = _route_node(raw.get(single))
        if node:
            out[single] = node
    for key in ("elites", "monsters", "events"):
        lst = raw.get(key)
        if isinstance(lst, list):
            nodes = [n for n in (_route_node(o) for o in lst[:_ROUTE_CAP]) if n]
            if nodes:
                out[key] = nodes
    return out or None


def _clean_loot(raw) -> dict | None:
    """The combat/reward-screen loot: gold plus the card / relic / potion ids on
    offer, and whether card removal is available."""
    if not isinstance(raw, dict):
        return None
    out: dict = {}
    if isinstance(raw.get("gold"), (int, float)) and not isinstance(
        raw.get("gold"), bool
    ):
        out["gold"] = int(raw["gold"])
    for cat in ("cards", "relics", "potions"):
        lst = raw.get(cat)
        if isinstance(lst, list):
            out[cat] = [
                s
                for x in lst[:_LOOT_CAP]
                if isinstance(x, (str, int)) and _safe_id(s := str(x)[:_MAX_STR])
            ]
    # Scroll-box bundles (ScrollBoxes relic): a list of packs, each a list of
    # bare card ids. Present only on the choose-a-bundle screen; the mod keeps
    # these out of `cards`, so the frontend hides the flat card row when set.
    packs = raw.get("packs")
    if isinstance(packs, list):
        cleaned = []
        for pack in packs[:_PACKS_CAP]:
            if not isinstance(pack, list):
                continue
            ids = [
                s
                for x in pack[:_LOOT_CAP]
                if isinstance(x, (str, int)) and _safe_id(s := str(x)[:_MAX_STR])
            ]
            if ids:
                cleaned.append(ids)
        if cleaned:
            out["packs"] = cleaned
    cr = raw.get("card_removal")
    if isinstance(cr, bool):
        out["card_removal"] = cr
    elif isinstance(cr, (int, float)):
        out["card_removal"] = int(cr)
    return out or None


_FLOOR_HISTORY_CAP = 64  # a full run is < 60 floors
_FLOOR_REWARDS_CAP = 24  # matches the mod-side per-floor cap
_KIND_OK = {"card", "relic", "potion"}


def _floor_rewards(raw) -> list[dict]:
    """The taken / skipped items on a cleared floor: {kind, id} pairs. The ids
    flow into image/CDN URLs on the frontend, so drop anything that fails the
    path-safety check, same as the loot cleaner."""
    out = []
    if isinstance(raw, list):
        for o in raw[:_FLOOR_REWARDS_CAP]:
            if not isinstance(o, dict):
                continue
            kind, rid = o.get("kind"), o.get("id")
            if kind in _KIND_OK and isinstance(rid, str) and _safe_id(rid[:_MAX_STR]):
                out.append({"kind": kind, "id": rid[:_MAX_STR]})
    return out


def _clean_floor_history(raw) -> list[dict] | None:
    """Per-cleared-floor summary for the map's previous-node hover: the same data
    the game shows on a visited node (room/enemy, turns, damage, HP + gold, and
    the rewards taken vs skipped). Run-level and sent every beat, so it is never
    unset (unlike the combat-only fields)."""
    if not isinstance(raw, list):
        return None
    out: list[dict] = []
    for o in raw[:_FLOOR_HISTORY_CAP]:
        if not isinstance(o, dict):
            continue
        f: dict = {
            "floor": _as_int(o.get("floor")),
            "act": _as_int(o.get("act")),
            "type": str(o.get("type", "unknown"))[:24],
            "hp": _as_int(o.get("hp")),
            "max_hp": _as_int(o.get("max_hp")),
            "gold": _as_int(o.get("gold")),
        }
        eid = o.get("encounter_id")
        if isinstance(eid, str) and _safe_id(eid[:_MAX_STR]):
            f["encounter_id"] = eid[:_MAX_STR]
        for k in ("turns", "damage_taken", "healed", "gold_spent", "gold_gained"):
            v = o.get(k)
            if isinstance(v, int) and not isinstance(v, bool):
                f[k] = int(v)
        f["rewards"] = _floor_rewards(o.get("rewards"))
        f["skipped"] = _floor_rewards(o.get("skipped"))
        out.append(f)
    return out


_POWERS_CAP = 40
_COOP_CAP = 4


def _as_int(v) -> int:
    """Coerce a heartbeat number to int; missing / non-numeric -> 0."""
    return int(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else 0


def _clean_powers(raw) -> list[dict] | None:
    """The local player's combat buffs/debuffs as [{id, amount}]. An empty list
    is meaningful (in combat, no powers); only None means absent this beat, so
    it's in the transient-unset set."""
    if not isinstance(raw, list):
        return None
    out: list[dict] = []
    for p in raw[:_POWERS_CAP]:
        if not isinstance(p, dict):
            continue
        pid = p.get("id")
        if isinstance(pid, str) and pid:
            out.append({"id": pid[:_MAX_STR], "amount": _as_int(p.get("amount"))})
    return out


_ORBS_CAP = 12


def _clean_orbs(raw) -> list[dict] | None:
    """The player's channeled orbs in slot order: each {id, passive, evoke} --
    `passive` the per-turn value, `evoke` the on-evoke value. Combat-only (orb
    characters); [] is meaningful, so it's in the transient-unset set."""
    if not isinstance(raw, list):
        return None
    out: list[dict] = []
    for o in raw[:_ORBS_CAP]:
        if not isinstance(o, dict):
            continue
        oid = o.get("id")
        if not isinstance(oid, str) or not _safe_id(oid[:_MAX_STR]):
            continue
        orb: dict = {"id": oid[:_MAX_STR]}
        for k in ("passive", "evoke"):
            v = o.get(k)
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                orb[k] = int(v)
        out.append(orb)
    return out


def _clean_players(raw) -> list[dict] | None:
    """Co-op per-seat vitals; the mod sends this only with 2+ players. `is_me`
    marks the local seat so the frontend can highlight it. `energy`/`ended_turn`
    are combat turn state (0/false outside combat): combined with the global
    `turn_side`, they show who is still taking their turn vs already locked in."""
    if not isinstance(raw, list):
        return None
    out: list[dict] = []
    for p in raw[:_COOP_CAP]:
        if not isinstance(p, dict):
            continue
        ch = p.get("character")
        out.append(
            {
                "character": ch[:_MAX_STR] if isinstance(ch, str) and ch else None,
                "hp": _as_int(p.get("hp")),
                "max_hp": _as_int(p.get("max_hp")),
                "block": _as_int(p.get("block")),
                "gold": _as_int(p.get("gold")),
                "energy": _as_int(p.get("energy")),
                "alive": bool(p.get("alive")),
                "ended_turn": bool(p.get("ended_turn")),
                "deck_size": _as_int(p.get("deck_size")),
                "relic_count": _as_int(p.get("relic_count")),
                "potion_count": _as_int(p.get("potion_count")),
                "is_me": bool(p.get("is_me")),
            }
        )
    return out


_PETS_CAP = 8


def _clean_pets(raw) -> list[dict] | None:
    """Friendly summons in combat (the Necrobinder's Osty and any future pet):
    id/name + vitals plus `owner`, an index into `players` so a co-op pet can
    hang off the right seat (0 in single-player). Combat-only, so it is cleared
    with the other combat fields when a fight ends."""
    if not isinstance(raw, list):
        return None
    out: list[dict] = []
    for o in raw[:_PETS_CAP]:
        if not isinstance(o, dict):
            continue
        pet: dict = {
            "hp": _as_int(o.get("hp")),
            "max_hp": _as_int(o.get("max_hp")),
            "block": _as_int(o.get("block")),
            "owner": _as_int(o.get("owner")),
            "alive": bool(o.get("alive")),
        }
        pid = o.get("id")
        if isinstance(pid, str) and _safe_id(pid[:_MAX_STR]):
            pet["id"] = pid[:_MAX_STR]
        if isinstance(o.get("name"), str) and o["name"]:
            pet["name"] = o["name"][:_MAX_STR]
        out.append(pet)
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
            # the resolved consequence text ("Lose 3 HP") plus any card the option
            # previews (e.g. the card a "lose a card" option will take) or relic it
            # grants -- the game pre-rolls these, so they're knowable before choosing.
            if isinstance(o.get("desc"), str) and o["desc"]:
                opt["desc"] = o["desc"][:_OPT_TEXT_CAP]
            for ref in ("card", "relic"):
                v = o.get(ref)
                if isinstance(v, str) and _safe_id(v[:_MAX_STR]):
                    opt[ref] = v[:_MAX_STR]
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


_REST_OPTIONS_CAP = 8


def _clean_rest(raw) -> dict | None:
    """The campfire's options (Rest/Smith/Dig/...): each {id, title, enabled}. `id`
    is the stable option id, `title` the localized label, `enabled` whether it is
    selectable. Present only at a rest site; cleared by the transient-unset list
    when the player leaves the campfire."""
    if not isinstance(raw, dict):
        return None
    opts = raw.get("options")
    if not isinstance(opts, list):
        return None
    out_opts: list[dict] = []
    for o in opts[:_REST_OPTIONS_CAP]:
        if not isinstance(o, dict):
            continue
        oid = o.get("id")
        if not isinstance(oid, str) or not oid:
            continue
        item: dict = {"id": oid}
        if isinstance(o.get("title"), str):
            item["title"] = o["title"]
        if isinstance(o.get("enabled"), bool):
            item["enabled"] = o["enabled"]
        out_opts.append(item)
    return {"options": out_opts} if out_opts else None


def _clean_death(raw) -> dict | None:
    """The run-ending death: `line` is the killer's already-localized death quote
    (free text, e.g. "Not quite the top"), `by` the killer's id. Present once the
    player dies."""
    if not isinstance(raw, dict):
        return None
    out: dict = {}
    if isinstance(raw.get("line"), str) and raw["line"]:
        out["line"] = raw["line"][:_MAX_STR]
    by = raw.get("by")
    if isinstance(by, str) and _safe_id(by[:_MAX_STR]):
        out["by"] = by[:_MAX_STR]
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
    # dmg/hits describe an attack; amount is the magnitude of a non-attack intent
    # (e.g. the block a defend will gain, or a buff's stacks).
    for k in ("dmg", "hits", "amount"):
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
        # enemy buffs/debuffs (vulnerable, weak, strength, ...) -> token icons
        if epw := _clean_powers(o.get("powers")):
            en["powers"] = epw
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
    if (rv := _clean_reveals(data.get("reveals"))) is not None:
        fields["reveals"] = rv

    # Current-screen detail: the live event, the shop, and combat enemies. Present
    # only on those screens.
    if (ev := _clean_event_ctx(data.get("event"))) is not None:
        fields["event"] = ev
    if (shp := _clean_shop(data.get("shop"))) is not None:
        fields["shop"] = shp
    if (rs := _clean_rest(data.get("rest"))) is not None:
        fields["rest"] = rs
    if (dth := _clean_death(data.get("death"))) is not None:
        fields["death"] = dth
    if (en := _clean_enemies(data.get("enemies"))) is not None:
        fields["enemies"] = en
    # The act's route persists between beats (like the map); loot is per-screen.
    if (rt := _clean_route(data.get("route"))) is not None:
        fields["route"] = rt
    if (lt := _clean_loot(data.get("loot"))) is not None:
        fields["loot"] = lt
    # Per-cleared-floor history for the map's previous-node hover. Run-level: it
    # rides every beat and persists for the whole run, so it is NOT in `unset`.
    if (fh := _clean_floor_history(data.get("floor_history"))) is not None:
        fields["floor_history"] = fh
    # Local player's combat powers ([] is meaningful) + co-op per-seat vitals.
    if (pw := _clean_powers(data.get("player_powers"))) is not None:
        fields["player_powers"] = pw
    if (orbs := _clean_orbs(data.get("orbs"))) is not None:
        fields["orbs"] = orbs
    if (pls := _clean_players(data.get("players"))) is not None:
        fields["players"] = pls
    if (pets := _clean_pets(data.get("pets"))) is not None:
        fields["pets"] = pets

    # Transient fields: when the mod sends these as explicit null (combat ended / left the
    # screen), clear them rather than leaving stale values. pos is NOT in this set on
    # purpose: keeping the last node avoids a blinking map marker between nodes. route is
    # NOT here either: it's act-scoped and persists until the next act overwrites it.
    # block / max_energy / run_time / modifiers are sent the whole run, so NOT unset.
    unset = [
        k
        for k in (
            "turn",
            "turn_side",
            "fighting",
            "event",
            "shop",
            "rest",
            "enemies",
            "hand",
            "draw_pile",
            "discard_pile",
            "exhaust_pile",
            "loot",
            "energy",
            "draw_count",
            "discard_count",
            "exhaust_count",
            "player_powers",
            "orbs",
            "orb_slots",
            "pets",
            "damage_dealt",
            "damage_dealt_this_turn",
            "damage_taken",
            "biggest_hit",
        )
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


def _enrich_twitch(players: list[dict]) -> None:
    """Attach each present player's Twitch channel + partner flag (joined from
    the user record by steam_id), mark who is streaming right now via Helix, and
    float live partners to the top. Best-effort: any failure leaves the roster
    untouched, so Twitch never breaks the live page."""
    if not players:
        return
    try:
        from ..services import twitch_live
        from ..services.users_db import twitch_info_by_steam_ids

        steam_ids = [p["steam_id"] for p in players if p.get("steam_id")]
        info = twitch_info_by_steam_ids(steam_ids)
        if not info:
            return
        logins = {v["twitch_login"] for v in info.values() if v.get("twitch_login")}
        live = twitch_live.live_logins(logins)
        for p in players:
            meta = info.get(p.get("steam_id"))
            if not meta:
                continue
            login = meta.get("twitch_login")
            if login:
                p["twitch_login"] = login
            if meta.get("is_partner"):
                p["is_partner"] = True
            stream = live.get(login) if login else None
            if stream:
                p["twitch_live"] = True
                if stream.get("viewer_count") is not None:
                    p["twitch_viewers"] = stream["viewer_count"]
        # Stable sort: a partner who is live-streaming sorts first; everyone
        # else keeps the deepest-floor order presence_db already returned.
        players.sort(
            key=lambda p: 0 if (p.get("is_partner") and p.get("twitch_live")) else 1
        )
    except Exception:
        pass


@router.get("/active")
def get_active(limit: int = 50):
    _require_mongo()
    from ..services import presence_db

    players = presence_db.active(max(1, min(limit, 100)))
    _enrich_twitch(players)
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
    _enrich_twitch([doc])
    return doc
