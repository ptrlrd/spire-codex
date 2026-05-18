"""MongoDB implementation of the runs database.

Exports the same public interface as services.runs_db so the swap is
a feature flag, not a forklift. runs_db.py dispatches here when
MONGO_URL is set in the environment.

Document shape (one doc per player-run):

    {
        "_id": <run_hash>,
        "username": ..., "character": ..., "win": ..., "ascension": ...,
        "killed_by": ..., "player_count": ..., "build_id": ...,
        "seed": ..., "run_time": ..., "floors_reached": ...,
        "submitted_at": ISODate(...),
        "deck": [{ "id": ..., "upgraded": ..., "enchantment": ..., "floor_added": ... }],
        "relics": [{ "id": ..., "floor_added": ... }],
        "potions": [{ "id": ..., "was_picked": ..., "was_used": ... }],
        "card_choices": [{ "card_id": ..., "was_picked": ..., "floor": ... }],
        "raw": <the full submitted JSON, for share pages>,
    }

Indexes (created on import — idempotent):
    {character: 1}
    {username: 1, submitted_at: -1}
    {submitted_at: -1}
    {character: 1, win: 1, ascension: 1}
    {build_id: 1}
    {"deck.id": 1}            (multikey)
    {relics.id: 1}            (multikey)
    {killed_by: 1}
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import DuplicateKeyError

# Name of the materialized-stats collection. Read by API handlers,
# written by one worker (whoever holds the refresh lease).
SUMMARY_COLLECTION_NAME = "stats_summary"
LEASE_COLLECTION_NAME = "stats_refresher_lease"
LEASE_DURATION_SECONDS = 90

# ── module state ──────────────────────────────────────────────────────────
_data_dir = Path(os.environ.get("DATA_DIR", "/data"))

_client: MongoClient | None = None
_coll = None  # lazy — set by _get_collection


def _get_collection():
    """Lazily build the MongoClient + return the runs collection.

    Per-process (per-worker) — pymongo manages its own connection pool
    internally so we don't need to share across workers.
    """
    global _client, _coll
    if _coll is not None:
        return _coll

    url = os.environ.get("MONGO_URL", "").strip()
    if not url:
        raise RuntimeError("MONGO_URL not set — runs_db_mongo imported in error")

    _client = MongoClient(
        url,
        w="majority",
        wtimeoutms=5000,
        retryWrites=True,
        connectTimeoutMS=5000,
        serverSelectionTimeoutMS=5000,
    )
    # Database name comes from the connection string's default db.
    _coll = _client.get_default_database().runs
    _ensure_indexes(_coll)
    return _coll


def _ensure_indexes(coll) -> None:
    """Create indexes if absent. Idempotent — pymongo's create_index is a
    no-op when an equivalent index already exists."""
    coll.create_index([("character", ASCENDING)])
    coll.create_index([("username", ASCENDING), ("submitted_at", DESCENDING)])
    coll.create_index([("submitted_at", DESCENDING)])
    coll.create_index(
        [("character", ASCENDING), ("win", ASCENDING), ("ascension", ASCENDING)]
    )
    coll.create_index([("build_id", ASCENDING)])
    coll.create_index([("deck.id", ASCENDING)])
    coll.create_index([("relics.id", ASCENDING)])
    coll.create_index([("killed_by", ASCENDING)])


# ── helpers (mirrors of the sqlite module) ──────────────────────────────
def clean_id(raw_id: str) -> str:
    """Strip CARD./RELIC./MONSTER./etc. prefixes (matches runs_db.clean_id)."""
    for prefix in (
        "CARD.",
        "RELIC.",
        "ENCHANTMENT.",
        "MONSTER.",
        "ENCOUNTER.",
        "CHARACTER.",
        "ACT.",
        "POTION.",
    ):
        if raw_id.startswith(prefix):
            return raw_id[len(prefix) :]
    return raw_id


def init_db():
    """No-op for Mongo (indexes created lazily on first access). Kept for
    import-parity with runs_db.init_db()."""
    _get_collection()


# ── public surface ──────────────────────────────────────────────────────
def submit_run(data: dict, username: str | None = None) -> dict:
    """Parse a run and store one document per player. Returns status dict
    matching the SQLite implementation."""
    missing: list[str] = []
    if not data.get("players"):
        missing.append("players")
    if not data.get("map_point_history"):
        missing.append("map_point_history")
    if not isinstance(data.get("acts"), list):
        missing.append("acts")
    if missing:
        return {
            "error": f"Invalid run data — missing or empty fields: {', '.join(missing)}"
        }

    was_abandoned = bool(data.get("was_abandoned", False))
    total_floors = sum(len(act) for act in data.get("map_point_history", []))
    killed_by_raw = data.get("killed_by_encounter", "")
    killed_by = (
        clean_id(killed_by_raw)
        if killed_by_raw and killed_by_raw != "NONE.NONE"
        else None
    )
    player_count = len(data.get("players", []))

    results = []
    for player_idx, player in enumerate(data["players"]):
        result = _submit_player_run(
            data,
            player,
            player_idx,
            was_abandoned,
            total_floors,
            killed_by,
            player_count,
            username,
        )
        results.append(result)

    # Save the full submitted JSON for the share-run page (matches the
    # SQLite implementation — frontend `/runs/<hash>` reads these files).
    runs_dir = _data_dir / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    for result in results:
        if result.get("success") or result.get("duplicate"):
            run_hash = result.get("run_hash", "")
            if run_hash:
                run_file = runs_dir / f"{run_hash}.json"
                if not run_file.exists():
                    try:
                        with open(run_file, "w", encoding="utf-8") as f:
                            json.dump(data, f, ensure_ascii=False)
                    except Exception as e:
                        print(f"Warning: failed to save run {run_hash}: {e}")

    return results[0]


def _submit_player_run(
    data: dict,
    player: dict,
    player_idx: int,
    was_abandoned: bool,
    total_floors: int,
    killed_by: str | None,
    player_count: int,
    username: str | None,
) -> dict:
    """One Mongo insert per player. The full nested structure goes into
    a single document — no joins required at query time."""
    seed = data.get("seed", "")
    char_raw = player["character"]
    start = data.get("start_time", "")
    run_time = data.get("run_time", 0)
    deck_size = len(player.get("deck", []))
    key = f"{seed}:{char_raw}:{start}:{run_time}:{deck_size}:{player_idx}"
    run_hash = hashlib.sha256(key.encode()).hexdigest()[:16]

    character = clean_id(char_raw)

    # Build embedded arrays.
    deck = [
        {
            "id": clean_id(card["id"]),
            "upgraded": card.get("current_upgrade_level", 0),
            "enchantment": (
                clean_id(card["enchantment"]["id"]) if card.get("enchantment") else None
            ),
            "floor_added": card.get("floor_added_to_deck"),
        }
        for card in player.get("deck", [])
    ]
    relics = [
        {
            "id": clean_id(relic["id"]),
            "floor_added": relic.get("floor_added_to_deck"),
        }
        for relic in player.get("relics", [])
    ]

    # Walk map_point_history once to collect card-choice + potion events
    # for THIS player.
    card_choices: list[dict] = []
    potion_used_set: set[str] = set()
    potion_seen: dict[str, bool] = {}
    player_id = player.get("id", player_idx + 1)
    for act_floors in data.get("map_point_history", []):
        for floor_idx, floor in enumerate(act_floors):
            floor_num = floor_idx + 1
            for ps in floor.get("player_stats", []):
                if ps.get("player_id") and ps["player_id"] != player_id:
                    continue
                for choice in ps.get("card_choices", []):
                    card_choices.append(
                        {
                            "card_id": clean_id(choice["card"]["id"]),
                            "was_picked": bool(choice.get("was_picked", False)),
                            "floor": floor_num,
                        }
                    )
                for pc in ps.get("potion_choices", []):
                    pid = clean_id(pc.get("choice", ""))
                    if pid:
                        picked = bool(pc.get("was_picked", False))
                        potion_seen[pid] = potion_seen.get(pid, False) or picked
                for pu in ps.get("potion_used", []):
                    pid = clean_id(pu)
                    if pid:
                        potion_used_set.add(pid)

    potions = [
        {
            "id": pid,
            "was_picked": bool(was_picked),
            "was_used": pid in potion_used_set,
        }
        for pid, was_picked in potion_seen.items()
    ]

    doc = {
        "_id": run_hash,
        "seed": seed,
        "character": character,
        "win": bool(data.get("win", False)),
        "was_abandoned": was_abandoned,
        "ascension": data.get("ascension", 0),
        "game_mode": data.get("game_mode", "standard"),
        "player_count": player_count,
        "run_time": data.get("run_time", 0),
        "floors_reached": total_floors,
        "acts_completed": len(data.get("acts", [])),
        "killed_by": killed_by,
        "deck_size": len(deck),
        "relic_count": len(relics),
        "username": username,
        "build_id": data.get("build_id"),
        "submitted_at": datetime.now(timezone.utc),
        "deck": deck,
        "relics": relics,
        "potions": potions,
        "card_choices": card_choices,
    }

    coll = _get_collection()
    try:
        coll.insert_one(doc)
    except DuplicateKeyError:
        return {
            "error": "This run has already been submitted",
            "duplicate": True,
            "run_hash": run_hash,
        }

    return {"success": True, "run_id": run_hash, "run_hash": run_hash}


def claim_runs(username: str, hashes: list[str]) -> dict:
    """Attach `username` to any runs whose _id matches and whose current
    username is null/empty. Matches the SQLite implementation: never
    overwrites an existing claim."""
    if not hashes:
        return {"claimed": 0, "already_claimed": 0, "unknown": 0}

    coll = _get_collection()
    existing = list(coll.find({"_id": {"$in": hashes}}, {"_id": 1, "username": 1}))
    by_hash = {d["_id"]: d.get("username") for d in existing}

    unclaimed = [h for h, u in by_hash.items() if not u]
    already_claimed = len(by_hash) - len(unclaimed)
    unknown = len(hashes) - len(by_hash)

    if unclaimed:
        coll.update_many(
            {"_id": {"$in": unclaimed}, "$or": [{"username": None}, {"username": ""}]},
            {"$set": {"username": username}},
        )

    return {
        "claimed": len(unclaimed),
        "already_claimed": already_claimed,
        "unknown": unknown,
    }


# ── stats ────────────────────────────────────────────────────────────────
def _build_match(
    character: str | None,
    win: str | None,
    ascension: str | None,
    game_mode: str | None,
    players: str | None,
    username: str | None,
    include_character: bool = True,
) -> dict:
    """Build the Mongo $match clause from the filter args. Centralized so
    each pipeline below stays consistent."""
    m: dict[str, Any] = {}
    if include_character and character:
        m["character"] = character.upper()
    if win == "true":
        m["win"] = True
    elif win == "false":
        m["win"] = False
        m["was_abandoned"] = False
    elif win == "abandoned":
        m["was_abandoned"] = True
    if ascension is not None and ascension != "":
        m["ascension"] = int(ascension)
    if game_mode:
        m["game_mode"] = game_mode
    if players == "single":
        m["player_count"] = 1
    elif players == "multi":
        m["player_count"] = {"$gt": 1}
    if username:
        m["username"] = username
    return m


def _item_stats_pipeline(field: str) -> list[dict]:
    """Per-item stats pipeline: card copies (overall, in wins, in
    losses), distinct runs, distinct winning runs — all in one pass,
    no $addToSet.

    Pattern: dedupe (run, item) via $group, project the item id out
    of the composite key, then $group by item with summed counts.

    The intermediate $project is necessary — referencing $_id.item
    directly in a subsequent $group._id was producing un-deduped
    results (Mongo seemed to be treating the composite object key as
    opaque). $project re-shapes the doc with `item` as a flat field
    so the second $group keys cleanly.
    """
    return [
        {"$unwind": f"${field}"},
        # First pass: each (run, item-id) becomes one doc carrying the
        # run's win state + how many copies of the item that run has.
        {
            "$group": {
                "_id": {"run": "$_id", "item": f"${field}.id"},
                "win": {"$first": "$win"},
                "copies": {"$sum": 1},
            }
        },
        # Flatten the composite _id so the next $group keys cleanly.
        {
            "$project": {
                "_id": 0,
                "item": "$_id.item",
                "win": 1,
                "copies": 1,
            }
        },
        # Second pass: per item, sum across runs.
        {
            "$group": {
                "_id": "$item",
                "count": {"$sum": "$copies"},  # total copies across all runs
                "in_wins": {
                    "$sum": {"$cond": ["$win", "$copies", 0]}
                },  # copies in winning decks
                "in_losses": {
                    "$sum": {"$cond": [{"$not": "$win"}, "$copies", 0]}
                },  # copies in losing decks
                "total_runs_with": {"$sum": 1},  # distinct runs (one row per run)
                "win_runs": {"$sum": {"$cond": ["$win", 1, 0]}},
            }
        },
    ]


def _scalar_item_stats_pipeline(field: str) -> list[dict]:
    """Like _item_stats_pipeline, but for arrays of scalar strings
    (relics, potions might be stored either way — keeping flexibility).
    Currently unused; documents store relics + potions as objects with
    `.id`, so _item_stats_pipeline covers it."""
    return [
        {"$unwind": f"${field}"},
        {
            "$group": {
                "_id": {"run": "$_id", "item": f"${field}"},
                "win": {"$first": "$win"},
                "copies": {"$sum": 1},
            }
        },
        {
            "$group": {
                "_id": "$_id.item",
                "count": {"$sum": "$copies"},
                "total_runs_with": {"$sum": 1},
                "win_runs": {"$sum": {"$cond": ["$win", 1, 0]}},
            }
        },
    ]


def get_stats(
    character: str | None = None,
    win: str | None = None,
    ascension: str | None = None,
    game_mode: str | None = None,
    players: str | None = None,
    username: str | None = None,
) -> dict:
    """Aggregated community stats. Mirrors the SQLite implementation's
    response shape — frontend doesn't care which backend produced it.

    All branches run in ONE $facet pipeline so Mongo can read the
    matched docs once and fan out internally. Each branch uses the
    2-stage $group dedup pattern (no $addToSet) so it stays
    memory-bounded.
    """
    coll = _get_collection()
    match = _build_match(character, win, ascension, game_mode, players, username)
    match_no_char = _build_match(
        character, win, ascension, game_mode, players, username, include_character=False
    )

    total = coll.count_documents(match)
    if total == 0:
        return {
            "total_runs": 0,
            "filters": {
                "character": character,
                "win": win,
                "ascension": ascension,
                "game_mode": game_mode,
                "players": players,
                "username": username,
            },
        }

    # Separate aggregations. $facet would be tidier but its hard 100MB
    # cap on combined intermediate state blew up on our scale
    # (allowDiskUse doesn't help $facet). Each independent aggregate
    # gets its own 100MB budget + can spill to disk via allowDiskUse.
    def agg(pipeline: list[dict]) -> list[dict]:
        return list(coll.aggregate(pipeline, allowDiskUse=True))

    totals_rows = agg(
        [
            {"$match": match},
            {
                "$group": {
                    "_id": None,
                    "wins": {"$sum": {"$cond": ["$win", 1, 0]}},
                    "abandoned": {"$sum": {"$cond": ["$was_abandoned", 1, 0]}},
                }
            },
        ]
    )
    totals_row = totals_rows[0] if totals_rows else {}
    wins = totals_row.get("wins", 0)
    abandoned = totals_row.get("abandoned", 0)

    asc_stats = agg(
        [
            {"$match": match},
            {
                "$group": {
                    "_id": "$ascension",
                    "total": {"$sum": 1},
                    "wins": {"$sum": {"$cond": ["$win", 1, 0]}},
                }
            },
            {"$sort": {"_id": 1}},
        ]
    )

    deaths = agg(
        [
            {"$match": {**match, "win": False, "killed_by": {"$ne": None}}},
            {"$group": {"_id": "$killed_by", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ]
    )

    pick_rates = agg(
        [
            {"$match": match},
            {"$unwind": "$card_choices"},
            {
                "$group": {
                    "_id": "$card_choices.card_id",
                    "offered": {"$sum": 1},
                    "picked": {"$sum": {"$cond": ["$card_choices.was_picked", 1, 0]}},
                }
            },
        ]
    )

    # $limit 1000 caps the doc size — the materialized stats_summary
    # collection has a 16MB BSON ceiling, and even a clean run with
    # ~600 distinct cards wants headroom. The frontend never paginates
    # past the top ~50 anyway.
    cards = agg(
        [
            {"$match": match},
            *_item_stats_pipeline("deck"),
            {"$sort": {"count": -1}},
            {"$limit": 1000},
        ]
    )
    relics = agg(
        [
            {"$match": match},
            *_item_stats_pipeline("relics"),
            {"$sort": {"count": -1}},
            {"$limit": 1000},
        ]
    )
    potions_owned_list = agg(
        [
            {"$match": match},
            *_item_stats_pipeline("potions"),
            {"$sort": {"count": -1}},
            {"$limit": 1000},
        ]
    )
    potion_owned = {r["_id"]: r for r in potions_owned_list}

    potion_pu = agg(
        [
            {"$match": match},
            {"$unwind": "$potions"},
            {
                "$group": {
                    "_id": "$potions.id",
                    "picked": {"$sum": {"$cond": ["$potions.was_picked", 1, 0]}},
                    "offered": {"$sum": 1},
                    "used": {"$sum": {"$cond": ["$potions.was_used", 1, 0]}},
                }
            },
        ]
    )

    # Per-character breakdown runs against match_no_char (drops the
    # character filter so the breakdown has one row per character).
    char_stats = list(
        coll.aggregate(
            [
                {"$match": match_no_char},
                {
                    "$group": {
                        "_id": "$character",
                        "total": {"$sum": 1},
                        "wins": {"$sum": {"$cond": ["$win", 1, 0]}},
                    }
                },
                {"$sort": {"total": -1}},
            ]
        )
    )

    return {
        "total_runs": total,
        "total_wins": wins,
        "total_abandoned": abandoned,
        "win_rate": round(wins / total * 100, 1) if total > 0 else 0,
        "filters": {
            "character": character,
            "win": win,
            "ascension": ascension,
            "game_mode": game_mode,
            "players": players,
            "username": username,
        },
        "characters": [
            {
                "character": r["_id"],
                "total": r["total"],
                "wins": r["wins"],
                "win_rate": round(r["wins"] / r["total"] * 100, 1)
                if r["total"] > 0
                else 0,
            }
            for r in char_stats
        ],
        "ascensions": [
            {
                "level": r["_id"],
                "total": r["total"],
                "wins": r["wins"],
                "win_rate": round(r["wins"] / r["total"] * 100, 1)
                if r["total"] > 0
                else 0,
            }
            for r in asc_stats
        ],
        "top_cards": [
            {
                "card_id": r["_id"],
                "count": r["count"],
                "in_wins": r.get("in_wins", 0),
                "in_losses": r.get("in_losses", 0),
                "win_runs": r.get("win_runs", 0),
                "total_runs_with": r.get("total_runs_with", 0),
            }
            for r in cards
        ],
        "pick_rates": [
            {
                "card_id": r["_id"],
                "offered": r["offered"],
                "picked": r["picked"],
                "pick_rate": round(r["picked"] / r["offered"] * 100, 1)
                if r["offered"] > 0
                else 0,
            }
            for r in pick_rates
        ],
        "top_relics": [
            {
                "relic_id": r["_id"],
                "count": r["count"],
                "total_runs_with": r.get("total_runs_with", 0),
                "win_runs": r.get("win_runs", 0),
            }
            for r in relics
        ],
        "deaths": [{"killed_by": r["_id"], "count": r["count"]} for r in deaths],
        "potion_stats": [
            # Merge per-potion picked/used telemetry with the
            # owned-in-deck stats so the response includes both views.
            {
                "potion_id": r["_id"],
                "offered": r["offered"],
                "picked": r["picked"],
                "used": r["used"],
                "total_runs_with": potion_owned.get(r["_id"], {}).get(
                    "total_runs_with", 0
                ),
                "win_runs": potion_owned.get(r["_id"], {}).get("win_runs", 0),
            }
            for r in potion_pu
        ],
    }


# ── Materialized stats summary ────────────────────────────────────────────
# get_stats() does ~8 aggregations totaling 5–15s against 9.9K docs.
# That can't be made fast for a user-facing read at this scale. Instead,
# a background refresher (one process across the worker pool, via a
# Mongo lease) computes the heavy result once per minute and writes it
# to `stats_summary`. API handlers read that single document — O(1).


def _summary_coll():
    return _get_collection().database[SUMMARY_COLLECTION_NAME]


def _lease_coll():
    return _get_collection().database[LEASE_COLLECTION_NAME]


def _filter_key(
    character: str | None = None,
    win: str | None = None,
    ascension: str | None = None,
    game_mode: str | None = None,
    players: str | None = None,
    username: str | None = None,
) -> str:
    """Stable string key for a filter combo (used as _id in
    stats_summary). 'global' means no filters."""
    parts: list[str] = []
    if character:
        parts.append(f"character:{character.upper()}")
    if win:
        parts.append(f"win:{win}")
    if ascension is not None and ascension != "":
        parts.append(f"ascension:{ascension}")
    if game_mode:
        parts.append(f"game_mode:{game_mode}")
    if players:
        parts.append(f"players:{players}")
    if username:
        parts.append(f"username:{username}")
    return "|".join(parts) if parts else "global"


def read_stats_summary(
    character: str | None = None,
    win: str | None = None,
    ascension: str | None = None,
    game_mode: str | None = None,
    players: str | None = None,
    username: str | None = None,
) -> dict | None:
    """Read a pre-computed stats doc by filter key. Returns None if no
    doc exists (refresher hasn't populated it yet). O(1) read."""
    try:
        key = _filter_key(character, win, ascension, game_mode, players, username)
        doc = _summary_coll().find_one({"_id": key})
        if not doc:
            return None
        # Strip the wrapper fields before returning to the API caller.
        doc.pop("_id", None)
        doc.pop("updated_at", None)
        return doc
    except Exception:
        return None


# Hot filter combos to materialize. (character, win, ascension,
# game_mode, players, username). Refresher iterates this list and
# writes a doc per combo. Add to it when a new common filter combo
# emerges in production traffic.
HOT_FILTER_COMBOS: list[dict] = [
    {},
    {"character": "IRONCLAD"},
    {"character": "SILENT"},
    {"character": "DEFECT"},
    {"character": "NECROBINDER"},
    {"character": "REGENT"},
]


def try_acquire_refresh_lease() -> bool:
    """Atomic compare-and-set on the leader-lease doc. Returns True if
    the calling process now holds the lease. Other workers see False
    and skip the refresh cycle.

    Lease is held for LEASE_DURATION_SECONDS (90). The refresher runs
    every 60s, so the holder keeps re-acquiring; if it dies, another
    worker picks it up after 90s.
    """
    try:
        coll = _lease_coll()
        now = datetime.now(timezone.utc)
        expires = now + timedelta(seconds=LEASE_DURATION_SECONDS)
        holder = f"{os.uname().nodename}/{os.getpid()}"
        # find_one_and_update with upsert + the filter clause is atomic:
        # we either insert (no doc existed) or update (lease expired or
        # already held by us). If another worker holds an unexpired
        # lease, the filter fails and nothing happens.
        result = coll.find_one_and_update(
            {
                "_id": "stats-refresher",
                "$or": [
                    {"expires_at": {"$lt": now}},
                    {"expires_at": {"$exists": False}},
                    {"holder": holder},  # extend our own lease
                ],
            },
            {"$set": {"holder": holder, "expires_at": expires}},
            upsert=True,
            return_document=True,
        )
        return result is not None and result.get("holder") == holder
    except DuplicateKeyError:
        # Another worker won the upsert race — they're the leader.
        return False
    except Exception:
        return False


def refresh_stats_summary() -> int:
    """Compute every hot filter combo and write to stats_summary.
    Returns count of docs written. Called by the leader-only loop."""
    summary = _summary_coll()
    written = 0
    for filters in HOT_FILTER_COMBOS:
        try:
            result = get_stats(**filters)
            key = _filter_key(**filters)
            doc = {**result, "_id": key, "updated_at": datetime.now(timezone.utc)}
            summary.replace_one({"_id": key}, doc, upsert=True)
            written += 1
        except Exception:
            # Best-effort; if one filter combo fails, keep going.
            pass
    return written
