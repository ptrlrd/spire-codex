"""Explode stored replays into Parquet for DuckDB, at-least-once with
idempotent publication.

Claims replay docs from Mongo under a lease until a byte budget is hit,
streams each gzip line by line into typed row buffers, and writes one
Parquet file per table into a staging directory. Commit is a single
atomic rename of that directory into committed/, after the manifest is
written; readers only ever glob committed/. The Mongo ack happens after
the commit, and a doc reclaimed after a crash whose old batch already
committed is only acked. Three failed attempts quarantine a replay so it
can't block the queue. Every row carries batch_id and exploder_version;
a reprocess runs under a new version and the reader views filter on it.

    docker compose -f docker-compose.prod.yml run -d --rm --entrypoint python lake-ingest /lab/replays_explode.py
"""

import fcntl
import json
import os
import pathlib
import sys
import time
import uuid
import zlib
from collections import defaultdict
from datetime import datetime, timedelta, timezone

sys.path.insert(0, "/lab")
sys.path.insert(0, "/app")

import pyarrow as pa
import pyarrow.parquet as pq

try:
    import orjson

    def _loads(b: bytes):
        return orjson.loads(b)

except ImportError:

    def _loads(b: bytes):
        return json.loads(b)


EXPLODER_VERSION = 1
GZ_BUDGET = int(os.environ.get("REPLAY_BATCH_GZ_BYTES", "") or 32 * 1024 * 1024)
RAW_BUDGET = int(os.environ.get("REPLAY_BATCH_RAW_BYTES", "") or 256 * 1024 * 1024)
FLUSH_BYTES = int(os.environ.get("REPLAY_FLUSH_BYTES", "") or 16 * 1024 * 1024)
RENEW_SECONDS = 30
MAX_ATTEMPTS = 3
LEASE_SECONDS = 900
MAX_OPTIONS = 64
MAX_LIST = 256
MAX_MAP_NODES = 1024
LAKE = pathlib.Path(os.environ.get("LAKE_DIR", "/lake"))

_PART = [
    ("build_id", pa.string()),
    ("character", pa.string()),
    ("ascension", pa.int32()),
    ("played_month", pa.string()),
    ("batch_id", pa.string()),
    ("exploder_version", pa.int32()),
]
_BASE = [
    ("run_hash", pa.string()),
    ("s", pa.int64()),
    ("ms", pa.int64()),
    ("floor", pa.int32()),
    ("act", pa.int32()),
]


def _schema(fields):
    return pa.schema(_BASE + fields + _PART)


HAND = pa.list_(pa.struct([("c", pa.int32()), ("id", pa.string()), ("up", pa.int32())]))
POWERS = pa.list_(pa.struct([("id", pa.string()), ("n", pa.int32())]))
ENEMIES = pa.list_(
    pa.struct(
        [
            ("i", pa.int32()),
            ("id", pa.string()),
            ("hp", pa.int32()),
            ("max_hp", pa.int32()),
            ("block", pa.int32()),
            ("intent", pa.string()),
        ]
    )
)
NODES = pa.list_(
    pa.struct(
        [
            ("coord", pa.string()),
            ("kind", pa.string()),
            ("children", pa.list_(pa.string())),
        ]
    )
)

SCHEMAS = {
    "replay_index": pa.schema(
        [
            ("run_hash", pa.string()),
            ("sha256", pa.string()),
            ("user_id", pa.string()),
            ("steam_id", pa.string()),
            ("seed", pa.string()),
            ("start_time", pa.int64()),
            ("game_mode", pa.string()),
            ("player_count", pa.int32()),
            ("player_idx", pa.int32()),
            ("mod_version", pa.string()),
            ("replay_version", pa.int32()),
            ("win", pa.bool_()),
            ("lines", pa.int32()),
            ("raw_bytes", pa.int64()),
            ("gz_bytes", pa.int64()),
            ("capture_status", pa.string()),
            ("reported_status", pa.string()),
            ("terminal_reason", pa.string()),
            ("seq_gaps", pa.int32()),
            ("floors", pa.int32()),
            ("run_time", pa.int32()),
            ("has_end", pa.bool_()),
        ]
        + _PART
    ),
    "decisions": _schema(
        [
            ("decision_id", pa.int64()),
            ("decision_type", pa.string()),
            ("source", pa.string()),
            ("select_kind", pa.string()),
            ("event_id", pa.string()),
            ("min_select", pa.int32()),
            ("max_select", pa.int32()),
            ("offer_generation", pa.int32()),
            ("n_presented", pa.int32()),
            ("n_selectable", pa.int32()),
            ("decline_available", pa.bool_()),
            ("can_reroll", pa.bool_()),
            ("gold_on_hand", pa.int32()),
            ("rerolls", pa.int32()),
            ("outcome", pa.string()),
            ("outcome_option_index", pa.int32()),
            ("paid", pa.bool_()),
            ("forced", pa.bool_()),
            ("cost_current", pa.int32()),
            ("cost_resource", pa.string()),
            ("resolved", pa.bool_()),
        ]
    ),
    "frame_options": _schema(
        [
            ("decision_id", pa.int64()),
            ("offer_generation", pa.int32()),
            ("option_index", pa.int32()),
            ("option_kind", pa.string()),
            ("option_id", pa.string()),
            ("label", pa.string()),
            ("grants_relic", pa.string()),
            ("instance_id", pa.int64()),
            ("up", pa.int32()),
            ("presented", pa.bool_()),
            ("selectable", pa.bool_()),
            ("selectable_reason", pa.string()),
            ("chosen", pa.bool_()),
            ("applied", pa.bool_()),
            ("cost_current", pa.int32()),
            ("cost_resource", pa.string()),
        ]
    ),
    "turns": _schema(
        [
            ("n", pa.int32()),
            ("side", pa.string()),
            ("hp", pa.int32()),
            ("block", pa.int32()),
            ("energy", pa.int32()),
            ("max_energy", pa.int32()),
            ("hand", HAND),
            ("draw", pa.int32()),
            ("discard", pa.int32()),
            ("exhaust", pa.int32()),
            ("powers", POWERS),
            ("enemies", ENEMIES),
        ]
    ),
    "plays": _schema(
        [
            ("turn", pa.int32()),
            ("c", pa.int64()),
            ("id", pa.string()),
            ("up", pa.int32()),
            ("target", pa.string()),
            ("target_c", pa.int32()),
            ("cost_paid", pa.int32()),
            ("stars_paid", pa.int32()),
            ("energy_after", pa.int32()),
            ("auto", pa.bool_()),
            ("play_index", pa.int32()),
            ("play_count", pa.int32()),
        ]
    ),
    "hits": _schema(
        [
            ("src", pa.string()),
            ("dst", pa.string()),
            ("dmg", pa.int32()),
            ("blocked", pa.int32()),
            ("killed", pa.bool_()),
            ("card", pa.string()),
        ]
    ),
    "events": _schema(
        [
            ("kind", pa.string()),
            ("c", pa.int64()),
            ("id", pa.string()),
            ("n", pa.int32()),
            ("d", pa.int32()),
            ("value", pa.int32()),
            ("tgt", pa.string()),
            ("card", pa.string()),
            ("option", pa.string()),
            ("decision_id", pa.int64()),
            ("extra", pa.string()),
        ]
    ),
    "rooms": _schema([("kind", pa.string()), ("id", pa.string())]),
    "combats": _schema(
        [
            ("s_end", pa.int64()),
            ("encounter", pa.string()),
            ("enemies", ENEMIES),
            ("turns", pa.int32()),
            ("result", pa.string()),
            ("hp_end", pa.int32()),
            ("damage_taken", pa.int32()),
        ]
    ),
    "maps": _schema([("nodes", NODES)]),
    "card_instances": pa.schema(
        [
            ("run_hash", pa.string()),
            ("instance_id", pa.int64()),
            ("card_id", pa.string()),
            ("acquired_s", pa.int64()),
            ("acquired_floor", pa.int32()),
            ("acquired_via", pa.string()),
            ("acquired_decision_id", pa.int64()),
            ("upgraded_s", pa.int64()),
            ("upgraded_floor", pa.int32()),
            ("removed_s", pa.int64()),
            ("removed_floor", pa.int32()),
            ("removed_via", pa.string()),
            ("transformed_to_instance", pa.int64()),
            ("in_final_deck", pa.bool_()),
        ]
        + _PART
    ),
}

_EVENT_KINDS = {
    "draw",
    "discard",
    "exhaust",
    "shuffle",
    "power",
    "block",
    "hp",
    "hp_loss",
    "gold",
    "generate",
    "orb_channel",
    "orb_evoke",
    "potion_used",
    "potion_got",
    "potion_dropped",
    "rest",
    "relic",
    "end_turn",
    "acquire",
    "remove",
    "upgrade",
    "transform",
    "buy",
    "resolve",
    "outcome",
}
_RESOLUTIONS = {"acquire", "remove", "upgrade", "transform", "relic", "buy", "resolve"}
_DECK_RESOLUTIONS = {"acquire", "remove", "upgrade", "transform", "relic", "resolve"}
_KNOWN_KEYS = {
    "t",
    "s",
    "ms",
    "floor",
    "act",
    "c",
    "id",
    "n",
    "d",
    "tgt",
    "card",
    "option",
    "decision_id",
}


class ReplayError(Exception):
    pass


def _int(v):
    if v is None or isinstance(v, bool):
        return int(v) if isinstance(v, bool) else None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _decision(v):
    did = _int(v)
    return did if did else None


def _month(meta: dict) -> str:
    played = meta.get("played_at")
    if isinstance(played, datetime):
        from zoneinfo import ZoneInfo

        return played.astimezone(ZoneInfo("America/Los_Angeles")).strftime("%Y-%m")
    st = _int(meta.get("start_time"))
    if st:
        from zoneinfo import ZoneInfo

        return datetime.fromtimestamp(st, ZoneInfo("America/Los_Angeles")).strftime(
            "%Y-%m"
        )
    return "unknown"


def iter_lines(gz: bytes):
    """Lines of the first gzip member, streamed; offset scanning so a
    buffer with many short lines is not re-copied per line."""
    d = zlib.decompressobj(16 + zlib.MAX_WBITS)
    buf = bytearray()
    view = memoryview(gz)
    step = 256 * 1024
    for pos in range(0, len(view), step):
        buf += d.decompress(bytes(view[pos : pos + step]))
        start = 0
        while True:
            nl = buf.find(b"\n", start)
            if nl < 0:
                break
            line = bytes(buf[start:nl])
            start = nl + 1
            if line.strip():
                yield line
        if start:
            del buf[:start]
        if d.eof:
            break
    buf += d.flush()
    for line in bytes(buf).split(b"\n"):
        if line.strip():
            yield line


def _capped(seq, cap: int, what: str):
    if seq is None:
        return None
    if len(seq) > cap:
        raise ReplayError(f"{what} has {len(seq)} entries, cap is {cap}")
    return seq


def parse_replay(gz: bytes, meta: dict, batch_id: str) -> dict[str, list[dict]]:
    """One replay's gzip into rows per table. Pure: no I/O, no Mongo."""
    run_hash = meta["_id"]
    part = {
        "build_id": meta.get("build_id"),
        "character": meta.get("character"),
        "ascension": _int(meta.get("ascension")),
        "played_month": _month(meta),
        "batch_id": batch_id,
        "exploder_version": EXPLODER_VERSION,
    }
    rows: dict[str, list[dict]] = defaultdict(list)
    header = None
    decisions: dict[int, dict] = {}
    options: dict[tuple, list[dict]] = {}
    generations: dict[int, list[int]] = defaultdict(list)
    resolutions: dict[int, list[dict]] = defaultdict(list)
    instances: dict[int, dict] = {}
    open_combat = None
    last_s = -1
    gaps = 0
    end = None
    lines = 0

    def base(d):
        return {
            "run_hash": run_hash,
            "s": _int(d.get("s")),
            "ms": _int(d.get("ms")),
            "floor": _int(d.get("floor")),
            "act": _int(d.get("act")),
            **part,
        }

    def touch(cid, card_id, d, via, decision_id=None):
        """Card lineage keyed by the DECK instance id: starters from the
        header's starting_deck, acquire/transform mint the rest, and
        upgrade/remove/transform reference them. In-combat lines (draw,
        play, discard, exhaust, generate) carry combat-scoped handles that
        never coincide with deck ids, so they never touch lineage. A deck
        op on an id nobody minted is recorded as "generated" (unknown
        origin) rather than invented as a starter."""
        if cid is None:
            return None
        inst = instances.get(cid)
        if inst is None:
            inst = {
                "run_hash": run_hash,
                "instance_id": cid,
                "card_id": card_id,
                "acquired_s": 0 if via == "start" else _int(d.get("s")),
                "acquired_floor": 0 if via == "start" else _int(d.get("floor")),
                "acquired_via": via,
                "acquired_decision_id": decision_id,
                "upgraded_s": None,
                "upgraded_floor": None,
                "removed_s": None,
                "removed_floor": None,
                "removed_via": None,
                "transformed_to_instance": None,
                "in_final_deck": None,
                **part,
            }
            instances[cid] = inst
        elif inst["card_id"] is None and card_id:
            inst["card_id"] = card_id
        return inst

    for raw in iter_lines(gz):
        try:
            d = _loads(raw)
        except Exception as e:
            raise ReplayError(f"line {lines + 1} is not JSON: {e}")
        if not isinstance(d, dict) or "t" not in d:
            raise ReplayError(f"line {lines + 1} has no type")
        lines += 1
        t = d["t"]
        s = _int(d.get("s"))
        if s is not None:
            if last_s >= 0 and s != last_s + 1:
                gaps += 1
            last_s = s
        if t == "header":
            header = d
            for card in d.get("starting_deck") or []:
                if isinstance(card, dict) and _int(card.get("c")) is not None:
                    touch(_int(card.get("c")), card.get("id"), d, "start")
            continue
        if t == "decision":
            did = _decision(d.get("decision_id"))
            gen = _int(d.get("offer_generation")) or 0
            generations[did].append(gen)
            decisions[did] = {
                **base(d),
                "decision_id": did,
                "decision_type": d.get("decision_type"),
                "source": d.get("source"),
                "select_kind": d.get("select_kind"),
                "event_id": d.get("event_id"),
                "min_select": _int(d.get("min_select")),
                "max_select": _int(d.get("max_select")),
                "offer_generation": _int(d.get("offer_generation")),
                "n_presented": _int(d.get("n_presented")),
                "n_selectable": _int(d.get("n_selectable")),
                "decline_available": d.get("decline_available"),
                "can_reroll": d.get("can_reroll"),
                "gold_on_hand": _int(d.get("gold_on_hand")),
                "rerolls": len(generations[did]) - 1,
                "outcome": None,
                "outcome_option_id": None,
                "outcome_option_index": None,
                "paid": False,
                "forced": (
                    (not d["decline_available"])
                    if isinstance(d.get("decline_available"), bool)
                    else None
                ),
                "cost_current": _int(d.get("cost_current")),
                "cost_resource": d.get("cost_resource"),
                "resolved": False,
            }
            options[(did, gen)] = [
                {
                    **base(d),
                    "decision_id": did,
                    "offer_generation": gen,
                    "option_index": _int(o.get("option_index")),
                    "option_kind": o.get("option_kind"),
                    "option_id": o.get("option_id"),
                    "label": o.get("label"),
                    "grants_relic": o.get("grants_relic"),
                    "instance_id": _int(o.get("instance_id")),
                    "up": _int(o.get("up")),
                    "presented": bool(o.get("presented", True)),
                    "selectable": bool(o.get("selectable", True)),
                    "selectable_reason": o.get("selectable_reason"),
                    "chosen": False,
                    "applied": False,
                    "cost_current": _int(o.get("cost_current")),
                    "cost_resource": o.get("cost_resource"),
                }
                for o in _capped(d.get("options") or [], MAX_OPTIONS, "options")
                if isinstance(o, dict)
            ]
            continue
        if t == "outcome":
            did = _decision(d.get("decision_id"))
            dec = decisions.get(did)
            if dec is not None:
                dec["outcome"] = d.get("outcome")
                if d.get("option_index") is not None:
                    dec["outcome_option_index"] = _int(d.get("option_index"))
                elif d.get("option_id") is not None:
                    dec["outcome_option_id"] = d.get("option_id")
            rows["events"].append(_event(base(d), d))
            continue
        if t in _RESOLUTIONS:
            did = _decision(d.get("decision_id"))
            if did is not None and (
                t in _DECK_RESOLUTIONS
                or d.get("option_index") is not None
                or d.get("id") is not None
            ):
                resolutions[did].append(d)
            if t == "buy" and did in decisions:
                dec = decisions[did]
                dec["paid"] = True
                dec["cost_current"] = _int(d.get("cost_current"))
                dec["cost_resource"] = d.get("cost_resource")
                if dec["gold_on_hand"] is None:
                    dec["gold_on_hand"] = _int(d.get("gold_on_hand"))
            if t == "acquire":
                via = d.get("source") or ("acquire" if did is not None else "granted")
                touch(_int(d.get("c")), d.get("id"), d, str(via), did)
            elif t == "upgrade":
                inst = touch(_int(d.get("c")), d.get("id"), d, "generated")
                if inst is not None:
                    inst["upgraded_s"] = s
                    inst["upgraded_floor"] = _int(d.get("floor"))
            elif t == "remove":
                inst = touch(_int(d.get("c")), d.get("id"), d, "generated")
                if inst is not None:
                    inst["removed_s"] = s
                    inst["removed_floor"] = _int(d.get("floor"))
                    inst["removed_via"] = "remove"
            elif t == "transform":
                src = touch(_int(d.get("from_c")), d.get("from_id"), d, "generated")
                touch(_int(d.get("to_c")), d.get("to_id"), d, "transform", did)
                if src is not None:
                    src["removed_s"] = s
                    src["removed_floor"] = _int(d.get("floor"))
                    src["removed_via"] = "transform"
                    src["transformed_to_instance"] = _int(d.get("to_c"))
            rows["events"].append(_event(base(d), d))
            continue
        if t == "turn":
            rows["turns"].append(
                {
                    **base(d),
                    "n": _int(d.get("n")),
                    "side": d.get("side"),
                    "hp": _int(d.get("hp")),
                    "block": _int(d.get("block")),
                    "energy": _int(d.get("energy")),
                    "max_energy": _int(d.get("max_energy")),
                    "hand": [
                        {
                            "c": _int(h.get("c")),
                            "id": h.get("id"),
                            "up": _int(h.get("up")),
                        }
                        for h in _capped(d.get("hand") or [], MAX_LIST, "hand")
                        if isinstance(h, dict)
                    ]
                    if d.get("hand") is not None
                    else None,
                    "draw": _int(d.get("draw")),
                    "discard": _int(d.get("discard")),
                    "exhaust": _int(d.get("exhaust")),
                    "powers": [
                        {"id": p.get("id"), "n": _int(p.get("n"))}
                        for p in _capped(d.get("powers") or [], MAX_LIST, "powers")
                        if isinstance(p, dict)
                    ]
                    if d.get("powers") is not None
                    else None,
                    "enemies": _enemies(d.get("enemies")),
                }
            )
            continue
        if t == "play":
            cid = _int(d.get("c"))
            rows["plays"].append(
                {
                    **base(d),
                    "turn": _int(d.get("turn")),
                    "c": cid,
                    "id": d.get("id"),
                    "up": _int(d.get("up")),
                    "target": None if d.get("target") is None else str(d.get("target")),
                    "target_c": _int(d.get("target_c")),
                    "cost_paid": _int(d.get("cost_paid")),
                    "stars_paid": _int(d.get("stars_paid")),
                    "energy_after": _int(d.get("energy_after")),
                    "auto": bool(d.get("auto")) if d.get("auto") is not None else None,
                    "play_index": _int(d.get("play_index")),
                    "play_count": _int(d.get("play_count")),
                }
            )
            continue
        if t == "hit":
            rows["hits"].append(
                {
                    **base(d),
                    "src": None if d.get("src") is None else str(d.get("src")),
                    "dst": None if d.get("dst") is None else str(d.get("dst")),
                    "dmg": _int(d.get("dmg")),
                    "blocked": _int(d.get("blocked")),
                    "killed": (
                        bool(d.get("killed")) if d.get("killed") is not None else None
                    ),
                    "card": d.get("card"),
                }
            )
            continue
        if t == "room":
            rows["rooms"].append({**base(d), "kind": d.get("kind"), "id": d.get("id")})
            continue
        if t == "hp" and open_combat is not None:
            delta = _int(d.get("d"))
            if delta is not None and delta < 0:
                open_combat["damage_taken"] = (open_combat["damage_taken"] or 0) - delta
            if _int(d.get("hp")) is not None:
                open_combat["hp_end"] = _int(d.get("hp"))
        if t == "combat_start":
            open_combat = {
                **base(d),
                "s_end": None,
                "encounter": d.get("encounter"),
                "enemies": _enemies(d.get("enemies")),
                "turns": None,
                "result": None,
                "hp_end": None,
                "damage_taken": None,
            }
            continue
        if t == "combat_end":
            if open_combat is None:
                open_combat = {
                    **base(d),
                    "s_end": None,
                    "encounter": None,
                    "enemies": None,
                    "turns": None,
                    "result": None,
                    "hp_end": None,
                    "damage_taken": None,
                }
            open_combat["s_end"] = s
            open_combat["turns"] = _int(d.get("turns"))
            open_combat["result"] = d.get("result") or "victory"
            if _int(d.get("hp")) is not None:
                open_combat["hp_end"] = _int(d.get("hp"))
            if _int(d.get("damage_taken")) is not None:
                open_combat["damage_taken"] = _int(d.get("damage_taken"))
            rows["combats"].append(open_combat)
            open_combat = None
            continue
        if t == "map":
            rows["maps"].append(
                {
                    **base(d),
                    "nodes": [
                        {
                            "coord": n.get("coord"),
                            "kind": n.get("kind"),
                            "children": [
                                str(x)
                                for x in _capped(
                                    n.get("children") or [], MAX_LIST, "children"
                                )
                            ],
                        }
                        for n in _capped(d.get("nodes") or [], MAX_MAP_NODES, "nodes")
                        if isinstance(n, dict)
                    ],
                }
            )
            continue
        if t == "end":
            end = d
            continue
        if t == "act":
            rows["events"].append(_event(base(d), d))
            continue
        if t in _EVENT_KINDS:
            rows["events"].append(_event(base(d), d))
            continue
        rows["events"].append(_event(base(d), d))

    if header is None:
        raise ReplayError("no header line")
    if open_combat is not None:
        open_combat["s_end"] = last_s if last_s >= 0 else None
        open_combat["result"] = (end or {}).get("terminal_reason") or "unfinished"
        if end is not None and _int(end.get("hp")) is not None:
            open_combat["hp_end"] = _int(end.get("hp"))
        rows["combats"].append(open_combat)

    for did, dec in decisions.items():
        gens = generations.get(did, [0])
        opts = options.get((did, gens[-1]), [])
        earlier = [o for g in gens[:-1] for o in options.get((did, g), [])]
        res = resolutions.get(did, [])
        dec["resolved"] = bool(res)
        by_index = {o["option_index"]: o for o in opts}
        hit_idx = None
        for r in res:
            target = None
            idx = _int(r.get("option_index"))
            if idx is not None:
                target = by_index.get(idx)
            if target is None:
                for key in ("c", "from_c"):
                    cid = _int(r.get(key))
                    if cid is not None:
                        target = next(
                            (o for o in opts if o["instance_id"] == cid), None
                        )
                        if target is not None:
                            break
            if target is None:
                rid = r.get("id") or r.get("to_id")
                same = [
                    o
                    for o in opts
                    if rid and (o["option_id"] == rid or o["grants_relic"] == rid)
                ]
                if same:
                    target = same[0]
            if target is not None:
                target["chosen"] = True
                target["applied"] = True
                hit_idx = target["option_index"]
        picked = None
        if dec["outcome_option_index"] is not None:
            picked = by_index.get(dec["outcome_option_index"])
        elif dec["outcome_option_id"] is not None:
            picked = next(
                (o for o in opts if o["option_id"] == dec["outcome_option_id"]), None
            )
        if picked is not None:
            picked["chosen"] = True
            if res:
                picked["applied"] = True
            if hit_idx is None:
                hit_idx = picked["option_index"]
        if dec["outcome"] is None:
            dec["outcome"] = "chosen" if hit_idx is not None else "unresolved"
        if hit_idx is not None and dec["outcome_option_index"] is None:
            dec["outcome_option_index"] = hit_idx
        dec.pop("outcome_option_id", None)
        rows["decisions"].append(dec)
        rows["frame_options"].extend(earlier)
        rows["frame_options"].extend(opts)

    final_ids = None
    if end is not None:
        listed = end.get("final_deck") or []
        if listed and all(isinstance(x, dict) and "c" in x for x in listed):
            final_ids = {_int(x.get("c")) for x in listed}
    for inst in instances.values():
        if final_ids is not None:
            inst["in_final_deck"] = inst["instance_id"] in final_ids
        elif inst["removed_s"] is not None:
            inst["in_final_deck"] = False
        elif inst["acquired_via"] == "generated":
            inst["in_final_deck"] = None
        else:
            inst["in_final_deck"] = True if end is not None else None
        rows["card_instances"].append(inst)

    rows["replay_index"].append(
        {
            "run_hash": run_hash,
            "sha256": meta.get("sha256"),
            "user_id": None if meta.get("user_id") is None else str(meta["user_id"]),
            "steam_id": meta.get("steam_id"),
            "seed": header.get("seed"),
            "start_time": _int(header.get("start_time")),
            "game_mode": header.get("game_mode"),
            "player_count": _int(header.get("player_count")),
            "player_idx": _int(meta.get("player_idx")),
            "mod_version": header.get("mod_version"),
            "replay_version": _int(header.get("replay_version")),
            "win": meta.get("win") if isinstance(meta.get("win"), bool) else None,
            "lines": lines,
            "raw_bytes": _int(meta.get("raw_bytes")),
            "gz_bytes": _int(meta.get("gz_bytes")) or len(gz),
            "capture_status": (
                "gapped"
                if gaps
                else (end or {}).get("capture_status")
                or ("complete" if end else "truncated")
            ),
            "reported_status": (end or {}).get("capture_status"),
            "terminal_reason": (end or {}).get("terminal_reason"),
            "seq_gaps": gaps,
            "floors": _int((end or {}).get("floors")),
            "run_time": _int((end or {}).get("run_time")),
            "has_end": end is not None,
            **part,
        }
    )
    return rows


def _enemies(v):
    if v is None:
        return None
    out = []
    for e in _capped(v, MAX_LIST, "enemies"):
        if not isinstance(e, dict):
            continue
        intent = e.get("intent")
        out.append(
            {
                "i": _int(e.get("i")),
                "id": e.get("id"),
                "hp": _int(e.get("hp")),
                "max_hp": _int(e.get("max_hp")),
                "block": _int(e.get("block")),
                "intent": None
                if intent is None
                else json.dumps(intent, separators=(",", ":")),
            }
        )
    return out


def _event(row: dict, d: dict) -> dict:
    extra = {k: v for k, v in d.items() if k not in _KNOWN_KEYS}
    value = (
        d.get("hp")
        if d["t"] in ("hp", "hp_loss")
        else d.get("gold")
        if d["t"] == "gold"
        else None
    )
    if value is None and d["t"] == "buy":
        value = d.get("cost_current")
    return {
        **row,
        "kind": d["t"],
        "c": _int(d.get("c")),
        "id": d.get("id") or d.get("from_id") or d.get("name"),
        "n": _int(d.get("n")),
        "d": _int(d.get("d")),
        "value": _int(value),
        "tgt": d.get("tgt"),
        "card": d.get("card"),
        "option": d.get("option") or d.get("outcome") or d.get("kind"),
        "decision_id": _decision(d.get("decision_id")),
        "extra": json.dumps(extra, separators=(",", ":")) if extra else None,
    }


class MongoStore:
    """Claim/ack surface. Every transition is fenced on owner + batch_id
    (+ sha256 for the blob and the ack), so a worker that lost its lease
    can neither publish nor acknowledge someone else's work."""

    def __init__(self, coll):
        self.coll = coll
        self.owner = f"{os.uname().nodename}:{os.getpid()}:{uuid.uuid4().hex[:6]}"

    def _update(self, now: datetime) -> dict:
        return {
            "$set": {
                "ingest_state": "claimed",
                "owner": self.owner,
                "lease_expires_at": now + timedelta(seconds=LEASE_SECONDS),
            },
            "$inc": {"attempts": 1},
        }

    def claim(self, now: datetime):
        """Claim one doc's metadata (never the blob) under a lease. New and
        retry docs first, oldest submission first; then expired leases."""
        doc = self.coll.find_one_and_update(
            {"ingest_state": {"$in": [None, "retry"]}, "deleted_at": None},
            self._update(now),
            projection={"blob": 0},
            sort=[("submitted_at", 1)],
            return_document=True,
        )
        if doc is None:
            doc = self.coll.find_one_and_update(
                {
                    "ingest_state": "claimed",
                    "lease_expires_at": {"$lt": now},
                    "deleted_at": None,
                },
                self._update(now),
                projection={"blob": 0},
                sort=[("lease_expires_at", 1)],
                return_document=True,
            )
        return doc

    def _mine(self, hashes, batch_id: str) -> dict:
        return {
            "_id": {"$in": list(hashes)},
            "batch_id": batch_id,
            "owner": self.owner,
            "ingest_state": "claimed",
        }

    def blob(self, run_hash: str, sha256: str | None = None) -> bytes:
        flt: dict = {"_id": run_hash}
        if sha256:
            flt["sha256"] = sha256
        doc = self.coll.find_one(flt, {"blob": 1})
        return bytes(doc["blob"]) if doc else b""

    def assign_batch(self, hashes, batch_id: str):
        self.coll.update_many(
            {
                "_id": {"$in": list(hashes)},
                "owner": self.owner,
                "ingest_state": "claimed",
            },
            {"$set": {"batch_id": batch_id}},
        )

    def renew(self, hashes, batch_id: str, now: datetime) -> None:
        self.coll.update_many(
            self._mine(hashes, batch_id),
            {"$set": {"lease_expires_at": now + timedelta(seconds=LEASE_SECONDS)}},
        )

    def still_mine(self, hashes, batch_id: str, now: datetime) -> bool:
        hashes = list(hashes)
        n = self.coll.count_documents(
            {**self._mine(hashes, batch_id), "lease_expires_at": {"$gt": now}}
        )
        return n == len(hashes)

    def ack(self, done, batch_id: str, now: datetime):
        from pymongo import UpdateOne

        writes = [
            UpdateOne(
                {
                    "_id": item["run_hash"],
                    "sha256": item.get("sha256"),
                    "batch_id": batch_id,
                    "owner": self.owner,
                    "ingest_state": "claimed",
                },
                {
                    "$set": {
                        "ingest_state": "done",
                        "ingested_at": now,
                        "exploder_version": EXPLODER_VERSION,
                        "lease_expires_at": None,
                        "error": None,
                        f"published.{EXPLODER_VERSION}": batch_id,
                    }
                },
            )
            for item in done
        ]
        if writes:
            self.coll.bulk_write(writes, ordered=False)

    def release(self, run_hash: str, error: str, quarantine: bool):
        self.coll.update_one(
            {"_id": run_hash, "owner": self.owner, "ingest_state": "claimed"},
            {
                "$set": {
                    "ingest_state": "quarantined" if quarantine else "retry",
                    "error": error[:500],
                    "lease_expires_at": None,
                }
            },
        )

    def release_all(self, hashes, batch_id: str, error: str):
        self.coll.update_many(
            self._mine(hashes, batch_id),
            {
                "$set": {
                    "ingest_state": "retry",
                    "error": error[:500],
                    "lease_expires_at": None,
                }
            },
        )


def to_tables(rows: dict[str, list[dict]]) -> dict[str, pa.Table]:
    """One replay's rows into typed Arrow tables. Runs inside the per-replay
    failure boundary so a malformed line quarantines that replay alone."""
    return {
        name: pa.Table.from_pylist(rs, schema=SCHEMAS[name])
        for name, rs in rows.items()
        if rs
    }


class Writer:
    """Appends per-replay Arrow tables and writes Parquet in bounded flushes.
    Any failure here is a batch failure, never a replay failure."""

    def __init__(self, staging: pathlib.Path):
        self.staging = staging
        self.buffers: dict[str, list[pa.Table]] = defaultdict(list)
        self.writers: dict[str, pq.ParquetWriter] = {}
        self.counts: dict[str, int] = defaultdict(int)
        self.pending_bytes = 0

    def add(self, tables: dict[str, pa.Table]):
        for name, table in tables.items():
            self.buffers[name].append(table)
            self.pending_bytes += table.nbytes
        if self.pending_bytes >= FLUSH_BYTES:
            self.flush()

    def flush(self):
        for name, tabs in self.buffers.items():
            if not tabs:
                continue
            table = pa.concat_tables(tabs)
            tabs.clear()
            w = self.writers.get(name)
            if w is None:
                w = pq.ParquetWriter(
                    self.staging / f"{name}.parquet", SCHEMAS[name], compression="zstd"
                )
                self.writers[name] = w
            w.write_table(table, row_group_size=100_000)
            self.counts[name] += table.num_rows
            del table
        self.pending_bytes = 0

    def close(self) -> dict:
        self.flush()
        out = {}
        for name, w in self.writers.items():
            w.close()
            path = self.staging / f"{name}.parquet"
            with open(path, "rb") as f:
                os.fsync(f.fileno())
            out[name] = {"rows": self.counts[name], "bytes": path.stat().st_size}
        return out

    def abort(self):
        for w in self.writers.values():
            try:
                w.close()
            except Exception:
                pass


def _rmtree(path: pathlib.Path):
    if not path.exists():
        return
    for f in path.iterdir():
        f.unlink()
    path.rmdir()


def published_here(out_dir: pathlib.Path, doc: dict) -> str | None:
    """The committed batch that already published this doc's bytes under
    the CURRENT exploder version, checked against that batch's manifest
    (the per-version record set at ack, or the batch assigned before a
    crash that happened between commit and ack). A reclaim then only
    needs the ack."""
    candidates = {
        (doc.get("published") or {}).get(str(EXPLODER_VERSION)),
        doc.get("batch_id"),
    }
    for batch_id in candidates:
        if not batch_id:
            continue
        manifest = out_dir / "committed" / batch_id / "manifest.json"
        if not manifest.exists():
            continue
        try:
            data = json.loads(manifest.read_text())
            if int(data.get("exploder_version") or 0) != EXPLODER_VERSION:
                continue
            listed = any(
                r["run_hash"] == doc["_id"] and r.get("sha256") == doc.get("sha256")
                for r in data["replays"]
            )
        except Exception:
            continue
        if listed:
            return batch_id
    return None


def sweep_staging(out_dir: pathlib.Path, now: datetime):
    staging = out_dir / "staging"
    if not staging.exists():
        return
    cutoff = now.timestamp() - LEASE_SECONDS
    for d in staging.iterdir():
        try:
            if d.is_dir() and d.stat().st_mtime < cutoff:
                _rmtree(d)
        except OSError:
            pass


def explode_batch(store, out_dir: pathlib.Path, now: datetime | None = None) -> dict:
    """Claim up to the byte budget, write one committed batch, ack it."""
    now = now or datetime.now(timezone.utc)
    batch_id = f"{now.strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"
    ensure_schema_templates(out_dir)
    claimed: list[dict] = []
    gz_total = raw_total = 0
    acked_early: list[str] = []
    quarantined: list[str] = []
    while gz_total < GZ_BUDGET and raw_total < RAW_BUDGET:
        doc = store.claim(now)
        if doc is None:
            break
        prior = published_here(out_dir, doc)
        if prior:
            store.assign_batch([doc["_id"]], prior)
            store.ack(
                [{"run_hash": doc["_id"], "sha256": doc.get("sha256")}], prior, now
            )
            acked_early.append(doc["_id"])
            continue
        if int(doc.get("attempts") or 0) > MAX_ATTEMPTS:
            store.release(doc["_id"], "max attempts exceeded", quarantine=True)
            quarantined.append(doc["_id"])
            continue
        claimed.append(doc)
        gz_total += int(doc.get("gz_bytes") or 0)
        raw_total += int(doc.get("raw_bytes") or 0)
    summary = {
        "batch_id": batch_id,
        "claimed": len(claimed),
        "acked_early": len(acked_early),
        "quarantined": len(quarantined),
        "done": 0,
        "failed": 0,
        "tables": {},
    }
    if not claimed:
        return summary

    hashes = [d["_id"] for d in claimed]
    store.assign_batch(hashes, batch_id)
    staging = out_dir / "staging" / batch_id
    committed = out_dir / "committed" / batch_id
    staging.mkdir(parents=True, exist_ok=True)
    writer = Writer(staging)
    done: list[dict] = []
    remaining = list(hashes)
    last_renew = time.monotonic()
    try:
        for doc in claimed:
            if time.monotonic() - last_renew > RENEW_SECONDS:
                store.renew(remaining, batch_id, datetime.now(timezone.utc))
                last_renew = time.monotonic()
            try:
                gz = store.blob(doc["_id"], doc.get("sha256"))
                if not gz:
                    raise ReplayError("blob missing or replaced since the claim")
                rows = parse_replay(gz, doc, batch_id)
                tables = to_tables(rows)
            except Exception as e:
                attempts = int(doc.get("attempts") or 0)
                store.release(
                    doc["_id"], f"{type(e).__name__}: {e}", attempts >= MAX_ATTEMPTS
                )
                remaining.remove(doc["_id"])
                summary["failed"] += 1
                if attempts >= MAX_ATTEMPTS:
                    summary["quarantined"] += 1
                continue
            writer.add(tables)
            done.append(
                {
                    "run_hash": doc["_id"],
                    "sha256": doc.get("sha256"),
                    "lines": rows["replay_index"][0]["lines"],
                }
            )
        tables_meta = writer.close()
    except Exception as e:
        writer.abort()
        _rmtree(staging)
        store.release_all(
            remaining, batch_id, f"batch aborted: {type(e).__name__}: {e}"
        )
        raise

    done_hashes = [d["run_hash"] for d in done]
    if not done:
        _rmtree(staging)
        return summary
    wall = datetime.now(timezone.utc)
    store.renew(done_hashes, batch_id, wall)
    if not store.still_mine(done_hashes, batch_id, wall):
        _rmtree(staging)
        store.release_all(done_hashes, batch_id, "batch abandoned: lease lost")
        summary["abandoned"] = len(done)
        return summary
    try:
        manifest = {
            "batch_id": batch_id,
            "exploder_version": EXPLODER_VERSION,
            "created_at": now.isoformat(),
            "replays": done,
            "tables": tables_meta,
        }
        with open(staging / "manifest.json", "w", encoding="utf-8") as f:
            json.dump(manifest, f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(staging, committed)
    except Exception as e:
        _rmtree(staging)
        store.release_all(
            done_hashes, batch_id, f"batch aborted: {type(e).__name__}: {e}"
        )
        raise
    store.ack(done, batch_id, wall)
    summary["done"] = len(done)
    summary["tables"] = tables_meta
    return summary


def ensure_schema_templates(out_dir: pathlib.Path) -> None:
    """An empty Parquet per table under committed/_schema so the reader
    views resolve (with the right columns) before any batch has landed."""
    tpl = out_dir / "committed" / "_schema"
    tpl.mkdir(parents=True, exist_ok=True)
    for name, schema in SCHEMAS.items():
        path = tpl / f"{name}.parquet"
        if not path.exists():
            pq.write_table(schema.empty_table(), path, compression="zstd")


def attach_views(con, out_dir: pathlib.Path, version: int = EXPLODER_VERSION):
    """DuckDB views over committed batches only, pinned to one exploder version."""
    ensure_schema_templates(out_dir)
    root = str(out_dir / "committed")
    for name in SCHEMAS:
        pattern = f"{root}/*/{name}.parquet"
        con.execute(
            f"CREATE OR REPLACE VIEW replay_{name} AS "
            f"SELECT * FROM read_parquet('{pattern}', union_by_name=true) "
            f"WHERE exploder_version = {int(version)}"
        )


def main() -> int:
    out_dir = LAKE / "replays"
    out_dir.mkdir(parents=True, exist_ok=True)
    lock_path = LAKE / "ingest.lock"
    lock = open(lock_path, "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("ingest lock held; try later", flush=True)
        return 2
    from app.services import replays_db

    store = MongoStore(replays_db._coll())
    now = datetime.now(timezone.utc)
    sweep_staging(out_dir, now)
    t0 = time.time()
    totals = defaultdict(int)
    while True:
        summary = explode_batch(store, out_dir)
        for k in ("claimed", "acked_early", "quarantined", "done", "failed"):
            totals[k] += summary[k]
        print(json.dumps(summary, separators=(",", ":")), flush=True)
        if summary["claimed"] == 0 and summary["acked_early"] == 0:
            break
    print(f"replays exploded: {dict(totals)} in {time.time() - t0:.0f}s", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
