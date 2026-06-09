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
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import DuplicateKeyError

from ..metrics import db_operations, db_operation_duration

OFFICIAL_CHARACTERS = {"IRONCLAD", "SILENT", "DEFECT", "NECROBINDER", "REGENT"}


def _today_daily_seed_match() -> dict:
    """Mongo match for runs of *today's* daily seed.

    Daily seeds are prefixed with the UTC date as ``DD_MM_YYYY`` (e.g.
    ``"09_06_2026_2P"``), so "today's daily" is a seed-prefix match on the
    current UTC date. This is the correct key, NOT ``submitted_at``: that's
    upload time, which is often null on freshly-tracked runs and gets stamped
    in bulk when old runs are backfilled, so a March daily uploaded today
    would otherwise rank as "today's daily"."""
    date = datetime.now(timezone.utc).strftime("%d_%m_%Y")
    return {"$regex": f"^{date}"}


@contextmanager
def _timed_op(operation: str, collection: str = "runs"):
    """Increment db_operations + observe latency for a Mongo op.

    `spire_codex_db_operations_total` and `spire_codex_db_operation_seconds`
    were originally wired to SQLite calls. The Mongo migration deleted
    those call sites but left the metric defs in place; this restores
    them under Mongo semantics. The `table` label is repurposed for the
    collection name. Use only at public-function entry points — wrapping
    every pymongo call would explode label cardinality without giving
    more signal than coarse op-level p95s.
    """
    start = time.perf_counter()
    try:
        yield
    finally:
        elapsed = time.perf_counter() - start
        db_operations.labels(operation=operation, table=collection).inc()
        db_operation_duration.labels(operation=operation).observe(elapsed)


def _instrument(operation: str, collection: str = "runs"):
    """Decorator: wrap a function body in `_timed_op` for one-line
    instrumentation of public service entry points. Lets us tag each
    function with its op name + collection without indenting bodies."""

    def deco(fn):
        def wrapped(*a, **kw):
            with _timed_op(operation, collection):
                return fn(*a, **kw)

        wrapped.__name__ = fn.__name__
        wrapped.__doc__ = fn.__doc__
        return wrapped

    return deco


# Name of the materialized-stats collection. Read by API handlers,
# written by one worker (whoever holds the refresh lease).
SUMMARY_COLLECTION_NAME = "stats_summary"
LEADERBOARD_SUMMARY_COLLECTION_NAME = "leaderboard_summary"
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
    coll.create_index([("user_id", ASCENDING), ("submitted_at", DESCENDING)])
    # Backfill query on sign-in matches runs by submitter steam_id / discord_id.
    coll.create_index([("steam_id", ASCENDING)])
    coll.create_index([("discord_id", ASCENDING)])
    coll.create_index(
        [
            ("game_mode", ASCENDING),
            ("win", ASCENDING),
            ("submitted_at", DESCENDING),
            ("run_time", ASCENDING),
        ]
    )
    # Leaderboard sort indexes. The existing (character, win, ascension) helps
    # filter + sort for the highest_ascension category, but the *fastest*
    # category sorts by run_time, so without these the query materialized
    # every win for a character and sorted in memory -- 10+ seconds in prod.
    coll.create_index(
        [("character", ASCENDING), ("win", ASCENDING), ("run_time", ASCENDING)],
        name="char_win_runtime",
    )
    coll.create_index(
        [
            ("character", ASCENDING),
            ("win", ASCENDING),
            ("ascension", DESCENDING),
            ("run_time", ASCENDING),
        ],
        name="char_win_asc_runtime",
    )
    coll.create_index(
        [("win", ASCENDING), ("run_time", ASCENDING)],
        name="win_runtime",
    )
    coll.create_index(
        [("game_mode", ASCENDING), ("win", ASCENDING), ("run_time", ASCENDING)],
        name="mode_win_runtime",
    )


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
@_instrument("submit_run")
def submit_run(
    data: dict,
    username: str | None = None,
    steam_id: str | None = None,
    discord_id: str | None = None,
) -> dict:
    """Parse a run and store one document per player. Returns status dict
    matching the SQLite implementation.

    When ``steam_id`` / ``discord_id`` is provided (the overlay / Compendium
    pass the signed-in player's SteamID64), the run is tagged with it and,
    if an account already exists for that identity, linked to it immediately
    by setting ``user_id`` + ``username`` so it shows up on the owner's
    profile without a manual claim. Runs submitted before the account
    existed are linked retroactively by ``backfill_user_runs`` on sign-in."""
    # Resolve the owning account once (not per player) so a backlog upload
    # of N runs does a single user lookup rather than N. Steam is checked
    # first since that's what the game clients send; discord_id is here for
    # parity so any client that knows it links the same way.
    linked_user_id = None
    linked_username = None
    if steam_id or discord_id:
        try:
            from .users_db import get_user_by_steam_id, get_user_by_discord_id

            owner = None
            if steam_id:
                owner = get_user_by_steam_id(steam_id)
            if owner is None and discord_id:
                owner = get_user_by_discord_id(discord_id)
            if owner:
                linked_user_id = owner["_id"]
                linked_username = owner.get("username")
        except Exception:
            # Linking is best-effort; a lookup failure must not drop the run.
            pass

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
            linked_username or username,
            steam_id,
            discord_id,
            linked_user_id,
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
    steam_id: str | None = None,
    discord_id: str | None = None,
    linked_user_id: str | None = None,
) -> dict:
    """One Mongo insert per player. The full nested structure goes into
    a single document — no joins required at query time."""
    from bson import ObjectId

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
        # Submitter identity (when the client sends it). Lets a run be linked
        # to its owner's account on sign-in even if it was submitted
        # anonymously. user_id is set here when an account already exists for
        # that identity; otherwise backfill_user_runs fills it in.
        "steam_id": steam_id,
        "discord_id": discord_id,
        "user_id": ObjectId(linked_user_id) if linked_user_id else None,
        "build_id": data.get("build_id"),
        "submitted_at": datetime.now(timezone.utc),
        "deck": deck,
        "relics": relics,
        "potions": potions,
        "card_choices": card_choices,
        # Per-room history needed for the encounter-stats aggregation
        # (`/api/runs/encounter-stats`). Stored as the original 2D
        # array (acts → rooms) so the agg can `$unwind` it without a
        # reshape. Each room dict carries at minimum model_id,
        # room_type, damage_taken, turns_taken — the full submitted
        # JSON has more fields we don't need at aggregation time, so
        # we keep the projection narrow to bound doc size.
        "map_point_history": data.get("map_point_history", []),
    }

    coll = _get_collection()
    try:
        coll.insert_one(doc)
    except DuplicateKeyError:
        # The run already exists (commonly: it was submitted anonymously
        # before the client started sending an identity). Re-submitting with
        # a steam_id / discord_id becomes a migration path — tag the existing
        # doc so a later sign-in can link it. Each $set is guarded on the
        # field being null so we never reassign a run another account owns.
        if steam_id:
            coll.update_one(
                {"_id": run_hash, "steam_id": None},
                {"$set": {"steam_id": steam_id}},
            )
        if discord_id:
            coll.update_one(
                {"_id": run_hash, "discord_id": None},
                {"$set": {"discord_id": discord_id}},
            )
        if linked_user_id:
            owner_set: dict = {"user_id": ObjectId(linked_user_id)}
            if username:
                owner_set["username"] = username
            coll.update_one(
                {"_id": run_hash, "user_id": None},
                {"$set": owner_set},
            )
        return {
            "error": "This run has already been submitted",
            "duplicate": True,
            "run_hash": run_hash,
        }

    return {"success": True, "run_id": run_hash, "run_hash": run_hash}


@_instrument("backfill_user_runs")
def backfill_user_runs(
    user_id: str,
    steam_id: str | None = None,
    discord_id: str | None = None,
    username: str | None = None,
) -> int:
    """Link previously-anonymous runs to an account on sign-in.

    Sets ``user_id`` (and ``username`` when the account has one) on every
    run tagged with this account's ``steam_id`` or ``discord_id`` that isn't
    already owned. Passing both matters because an account can link Steam +
    Discord — signing in either way links runs tagged with the other ID.
    Returns the number of runs linked. Idempotent — only touches runs whose
    ``user_id`` is still null, so re-running on every sign-in is cheap."""
    if not user_id:
        return 0

    identity_conds: list[dict] = []
    if steam_id:
        identity_conds.append({"steam_id": steam_id})
    if discord_id:
        identity_conds.append({"discord_id": discord_id})
    if not identity_conds:
        return 0

    from bson import ObjectId

    coll = _get_collection()
    update: dict = {"user_id": ObjectId(user_id)}
    if username:
        update["username"] = username

    result = coll.update_many(
        {"user_id": None, "$or": identity_conds},
        {"$set": update},
    )
    return result.modified_count


@_instrument("claim_runs")
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
    # ETL'd docs store win/was_abandoned as 0/1 integers (from the
    # legacy SQLite schema), while submit_run on the new code path
    # stores them as true/false booleans. Strict-equal filters miss
    # half the data — match both forms with $in.
    if win == "true":
        m["win"] = {"$in": [True, 1]}
    elif win == "false":
        m["win"] = {"$in": [False, 0]}
        m["was_abandoned"] = {"$in": [False, 0]}
    elif win == "abandoned":
        m["was_abandoned"] = {"$in": [True, 1]}
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


@_instrument("get_encounter_stats")
def get_encounter_stats(
    acts: list[int] | None = None,
    room_types: list[str] | None = None,
    multiplayer: str | None = None,
    page: int = 1,
    limit: int = 50,
) -> dict:
    """Per-encounter aggregation over submitted runs.

    Walks each run's `map_point_history` (array of acts → array of rooms),
    yields one entry per combat room, and groups by encounter id with a
    per-character breakdown.

    Filters:
      * `acts` — restrict to specific act numbers (1, 2, 3). None = all.
      * `room_types` — restrict to "monster" / "elite" / "boss". None = all.
      * `multiplayer` — "only" / "exclude" / None (no filter). Multiplayer
        detection uses `player_count > 1` since the run docs are one per
        player and `player_count` is denormalized at submit time.

    Pagination is applied AFTER grouping (we always compute all
    encounters then slice), since the total ordering by sample size is
    what determines the page contents.

    Each returned row carries enough numbers to populate the listing's
    primary columns (total runs that encountered it, fatal count, avg
    damage, avg turns) plus a `characters` map shaped
    `{IRONCLAD: {total, fatal, ...}, SILENT: {...}, ...}` for the
    expanded per-character sub-table.

    Fatal detection: a run "died here" when the run's `killed_by` field
    matches the encounter id. This is an approximation — the same enemy
    type can appear earlier in the same run and we'd attribute the death
    to all instances. PR #266's extract logic narrows this to the *last*
    matching room; we settle for the simpler heuristic here since the
    distinction only matters for repeat enemy IDs in long runs (rare).
    """
    coll = _get_collection()

    # Build the pre-unwind run-level match. Keep this as cheap as possible
    # — we burn an unwind per room afterward, so any filter that can be
    # applied to the run as a whole saves multiplicative downstream cost.
    run_match: dict = {}
    if multiplayer == "only":
        run_match["player_count"] = {"$gt": 1}
    elif multiplayer == "exclude":
        run_match["player_count"] = {"$lte": 1}

    # Each `map_point_history[act][location]` is a LOCATION dict carrying
    # `player_stats[]` (per-player damage_taken etc.) + `rooms[]` (the
    # actual encounter, with `model_id`/`room_type`/`turns_taken`). The
    # previous shape assumed rooms were one level shallower, which is
    # why the aggregation silently returned zero rows. See
    # _oneoff-inspect-mph2.yml for the real shape.
    rooms_filter = list(room_types) if room_types else ["monster", "elite", "boss"]
    room_match: dict = {"map_point_history.rooms.room_type": {"$in": rooms_filter}}

    # `act_idx` is 0-based from $unwind's includeArrayIndex. We expose
    # `act` as 1-based in the response since that's what /api/acts uses.
    act_match: dict = {}
    if acts:
        act_match["act_idx"] = {"$in": [a - 1 for a in acts]}

    pipeline: list[dict] = [
        {"$match": run_match} if run_match else {"$match": {}},
        {
            "$project": {
                "character": 1,
                "killed_by": 1,
                "win": 1,
                "map_point_history": 1,
            }
        },
        {"$unwind": {"path": "$map_point_history", "includeArrayIndex": "act_idx"}},
    ]
    if act_match:
        pipeline.append({"$match": act_match})
    pipeline.extend(
        [
            # After unwinding acts, map_point_history is a LIST of
            # locations. We need to unwind that list before we can read
            # per-location fields (player_stats, rooms) — without this
            # step every downstream `$map_point_history.*` reference
            # silently resolves to the list-of-list projection and the
            # pipeline produces zero rows.
            {"$unwind": "$map_point_history"},
            # Locations within an act carry player_stats[] + rooms[]. We
            # compute the damage-taken total across all players here
            # because rooms[] doesn't carry damage; player_stats[] does.
            # In practice each location has 1 room, so attributing
            # location_damage to that room is accurate.
            {
                "$addFields": {
                    "location_damage": {
                        "$sum": {
                            "$map": {
                                "input": {
                                    "$ifNull": [
                                        "$map_point_history.player_stats",
                                        [],
                                    ]
                                },
                                "as": "ps",
                                "in": {"$ifNull": ["$$ps.damage_taken", 0]},
                            }
                        }
                    }
                }
            },
            {"$unwind": "$map_point_history.rooms"},
            {"$match": room_match},
            # Strip the "ENCOUNTER." prefix from model_id so the
            # response uses the same bare id format as `killed_by`
            # (CORPSE_SLUGS_WEAK rather than ENCOUNTER.CORPSE_SLUGS_WEAK).
            # This also lets the fatal-match comparison work directly.
            {
                "$addFields": {
                    "encounter_id": {
                        "$let": {
                            "vars": {"m": "$map_point_history.rooms.model_id"},
                            "in": {
                                "$cond": [
                                    {
                                        "$eq": [
                                            {
                                                "$substrCP": [
                                                    "$$m",
                                                    0,
                                                    10,
                                                ]
                                            },
                                            "ENCOUNTER.",
                                        ]
                                    },
                                    {
                                        "$substrCP": [
                                            "$$m",
                                            10,
                                            {"$strLenCP": "$$m"},
                                        ]
                                    },
                                    "$$m",
                                ]
                            },
                        }
                    }
                }
            },
            {
                "$group": {
                    "_id": {
                        "encounter": "$encounter_id",
                        "act": {"$add": ["$act_idx", 1]},
                        "room_type": "$map_point_history.rooms.room_type",
                        "character": "$character",
                    },
                    "total": {"$sum": 1},
                    "fatal": {
                        "$sum": {
                            "$cond": [
                                {
                                    "$and": [
                                        {
                                            "$eq": [
                                                "$encounter_id",
                                                "$killed_by",
                                            ]
                                        },
                                        {"$in": ["$win", [False, 0]]},
                                    ]
                                },
                                1,
                                0,
                            ],
                        }
                    },
                    "total_damage": {"$sum": {"$ifNull": ["$location_damage", 0]}},
                    "total_turns": {
                        "$sum": {"$ifNull": ["$map_point_history.rooms.turns_taken", 0]}
                    },
                }
            },
            # Collapse the per-character buckets up into per-encounter rows
            # so the page-size limit applies to encounters, not (encounter,
            # character) pairs. Each encounter carries a `characters` map.
            {
                "$group": {
                    "_id": {
                        "encounter": "$_id.encounter",
                        "act": "$_id.act",
                        "room_type": "$_id.room_type",
                    },
                    "total": {"$sum": "$total"},
                    "fatal": {"$sum": "$fatal"},
                    "total_damage": {"$sum": "$total_damage"},
                    "total_turns": {"$sum": "$total_turns"},
                    "characters": {
                        "$push": {
                            "character": "$_id.character",
                            "total": "$total",
                            "fatal": "$fatal",
                            "total_damage": "$total_damage",
                            "total_turns": "$total_turns",
                        }
                    },
                }
            },
            {"$sort": {"total": -1}},
        ]
    )

    rows = list(coll.aggregate(pipeline, allowDiskUse=True))

    page = max(page, 1)
    limit = max(min(limit, 200), 1)
    total_encounters = len(rows)
    start = (page - 1) * limit
    sliced = rows[start : start + limit]

    def _shape_row(r: dict) -> dict:
        n = r["total"] or 0
        return {
            "encounter_id": r["_id"]["encounter"],
            "act": r["_id"]["act"],
            "room_type": r["_id"]["room_type"],
            "total": n,
            "fatal": r["fatal"],
            "avg_damage": round(r["total_damage"] / n, 1) if n else 0,
            "avg_turns": round(r["total_turns"] / n, 2) if n else 0,
            "characters": [
                {
                    "character": c["character"],
                    "total": c["total"],
                    "fatal": c["fatal"],
                    "avg_damage": round(c["total_damage"] / c["total"], 1)
                    if c["total"]
                    else 0,
                    "avg_turns": round(c["total_turns"] / c["total"], 2)
                    if c["total"]
                    else 0,
                }
                for c in sorted(r["characters"], key=lambda x: -(x["total"] or 0))
                if c["character"]
            ],
        }

    return {
        "encounters": [_shape_row(r) for r in sliced],
        "page": page,
        "limit": limit,
        "total": total_encounters,
        "has_next": start + limit < total_encounters,
    }


@_instrument("get_stats")
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
            {
                "$match": {
                    **match,
                    "win": {"$in": [False, 0]},
                    "killed_by": {"$ne": None},
                }
            },
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
            {"$sort": {"offered": -1}},
            {"$limit": 100},
        ]
    )

    # $limit 100 caps the doc size — frontend never paginates past
    # ~50; this keeps the materialized doc under 1MB and JSON
    # serialization sub-100ms on the user path. (Previous 1000 cap
    # produced an 8MB response that took 1-4s to serialize.)
    cards = agg(
        [
            {"$match": match},
            *_item_stats_pipeline("deck"),
            {"$sort": {"count": -1}},
            {"$limit": 100},
        ]
    )
    relics = agg(
        [
            {"$match": match},
            *_item_stats_pipeline("relics"),
            {"$sort": {"count": -1}},
            {"$limit": 100},
        ]
    )
    potions_owned_list = agg(
        [
            {"$match": match},
            *_item_stats_pipeline("potions"),
            {"$sort": {"count": -1}},
            {"$limit": 100},
        ]
    )
    potion_owned = {r["_id"]: r for r in potions_owned_list}

    # Potion offered/picked is computed SHOP-ONLY, on purpose. A combat-drop
    # potion with an open slot gets taken ~91% of the time because it's free
    # and has no downside, so a drop "pick rate" measures slot availability,
    # not potion quality. A SHOP purchase is a real decision (you spend gold),
    # and the buy rate sits around ~9% — that's the signal worth ranking on.
    # So we count offers/buys only from potions seen on a shop shelf: walk
    # map_point_history -> shop locations -> potion_choices. `used` stays a
    # run-level usage metric (independent of where the potion came from).
    potion_shop = agg(
        [
            {"$match": match},
            {"$unwind": "$map_point_history"},  # acts -> one act (list of locations)
            {"$unwind": "$map_point_history"},  # locations -> one location dict
            {"$match": {"map_point_history.rooms.room_type": "shop"}},
            {"$unwind": "$map_point_history.player_stats"},
            {"$unwind": "$map_point_history.player_stats.potion_choices"},
            {
                "$group": {
                    "_id": "$map_point_history.player_stats.potion_choices.choice",
                    "picked": {
                        "$sum": {
                            "$cond": [
                                "$map_point_history.player_stats."
                                "potion_choices.was_picked",
                                1,
                                0,
                            ]
                        }
                    },
                    "offered": {"$sum": 1},
                }
            },
        ]
    )
    potion_used_rows = agg(
        [
            {"$match": match},
            {"$unwind": "$potions"},
            {
                "$group": {
                    "_id": "$potions.id",
                    "used": {"$sum": {"$cond": ["$potions.was_used", 1, 0]}},
                }
            },
        ]
    )
    used_by_id = {r["_id"]: r["used"] for r in potion_used_rows}
    # Strip the "POTION." namespace so shop ids line up with the clean ids
    # used everywhere else (potion_owned, used_by_id, the entity routes).
    potion_pu = [
        {
            "_id": (cid.split(".", 1)[1] if "." in cid else cid),
            "offered": r["offered"],
            "picked": r["picked"],
            "used": used_by_id.get((cid.split(".", 1)[1] if "." in cid else cid), 0),
        }
        for r in potion_shop
        if (cid := r["_id"])
    ]

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
            if r["_id"] in OFFICIAL_CHARACTERS
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
        # Frontend (StatsClient.tsx) and the SQLite path use the keys
        # `deadliest` (entries shaped as {encounter, count}) and
        # `top_potions` (entries with a precomputed pick_rate). The
        # initial Mongo port introduced `deaths` + `killed_by` and
        # `potion_stats` without pick_rate; the field-name mismatch
        # silently rendered "0 potions" and a blank deadliest panel.
        "deadliest": [{"encounter": r["_id"], "count": r["count"]} for r in deaths],
        "top_potions": [
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
                "pick_rate": round(r["picked"] / r["offered"] * 100, 1)
                if r["offered"] > 0
                else 0,
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


def get_database():
    """Public handle to the default database, reusing the pooled client.

    Lets other services (e.g. the Steam auth session store) share a
    Mongo-backed collection without opening a second client.
    """
    return _get_collection().database


def _summary_coll():
    return _get_collection().database[SUMMARY_COLLECTION_NAME]


def _leaderboard_summary_coll():
    return _get_collection().database[LEADERBOARD_SUMMARY_COLLECTION_NAME]


def _leaderboard_key(
    category: str = "fastest",
    character: str | None = None,
) -> str:
    """Composite cache key for leaderboard_summary docs. Mirrors the
    HOT_LEADERBOARD_COMBOS shape -- only (category, character) so the
    common per-character ladder is O(1)."""
    return f"{category}|{character or '_'}"


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


@_instrument("read_stats_summary", collection="stats_summary")
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


# Hot leaderboard combos to materialize into leaderboard_summary.
# (category, character). Page 1, limit 50, today=False, no players/game_mode
# filter -- the default ladder view. Other combos fall through to the live
# query, which the new sort indexes already keep at ~500ms.
_LEADERBOARD_CATEGORIES = ("fastest", "highest_ascension")
_LEADERBOARD_CHARACTERS = ("IRONCLAD", "SILENT", "DEFECT", "NECROBINDER", "REGENT")
HOT_LEADERBOARD_COMBOS: list[dict] = [
    {"category": cat} for cat in _LEADERBOARD_CATEGORIES
] + [
    {"category": cat, "character": ch}
    for cat in _LEADERBOARD_CATEGORIES
    for ch in _LEADERBOARD_CHARACTERS
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


@_instrument("refresh_stats_summary", collection="stats_summary")
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


@_instrument("refresh_leaderboard_summary", collection="leaderboard_summary")
def refresh_leaderboard_summary() -> int:
    """Compute the hot (category, character) leaderboard combos and write
    them to leaderboard_summary. Returns count of docs written. Called by
    the leader-only loop alongside refresh_stats_summary."""
    summary = _leaderboard_summary_coll()
    written = 0
    for combo in HOT_LEADERBOARD_COMBOS:
        try:
            result = _leaderboard_live(
                category=combo.get("category", "fastest"),
                character=combo.get("character"),
                players=None,
                game_mode=None,
                today=False,
                page=1,
                limit=50,
            )
            key = _leaderboard_key(
                category=combo.get("category", "fastest"),
                character=combo.get("character"),
            )
            doc = {**result, "_id": key, "updated_at": datetime.now(timezone.utc)}
            summary.replace_one({"_id": key}, doc, upsert=True)
            written += 1
        except Exception:
            pass
    return written


def write_stats_summary(
    result: dict,
    *,
    character: str | None = None,
    win: str | None = None,
    ascension: str | None = None,
    game_mode: str | None = None,
    players: str | None = None,
    username: str | None = None,
) -> None:
    """Lazy-cache a live get_stats() result in stats_summary so other
    workers and future requests can read it without re-aggregating.

    Called from the API handler after a live aggregation hit (i.e. when
    the requested filter combo isn't in HOT_FILTER_COMBOS and therefore
    isn't kept warm by the refresher). The next request for the same
    combo, on any worker, gets it from the summary in a single find_one.

    Best-effort: any failure is swallowed -- this is a write-through
    cache, not a critical path.
    """
    try:
        key = _filter_key(
            character=character,
            win=win,
            ascension=ascension,
            game_mode=game_mode,
            players=players,
            username=username,
        )
        doc = {**result, "_id": key, "updated_at": datetime.now(timezone.utc)}
        _summary_coll().replace_one({"_id": key}, doc, upsert=True)
    except Exception:
        pass


# ── Run listing / leaderboard / rank / versions / shared ─────────────────
# These mirror the inline get_conn() callers in routers/runs.py that
# previously ran raw SQL. Router dispatches here when MONGO_URL is set.


def _projection_row() -> dict:
    """Fields to return for /list and /leaderboard rows. Excludes the
    big nested arrays (deck/relics/etc.) to keep responses small."""
    return {
        "_id": 1,
        "character": 1,
        "win": 1,
        "was_abandoned": 1,
        "ascension": 1,
        "game_mode": 1,
        "run_time": 1,
        "floors_reached": 1,
        "deck_size": 1,
        "relic_count": 1,
        "killed_by": 1,
        "username": 1,
        "submitted_at": 1,
        "build_id": 1,
    }


def _row_to_dict(doc: dict) -> dict:
    """Strip Mongo's _id wrapper into the run_hash field the API expects."""
    if not doc:
        return doc
    out = {**doc}
    out["run_hash"] = out.pop("_id")
    # Coerce booleans to int (0/1) for backward compat with the SQLite
    # response shape that the frontend consumed historically.
    for k in ("win", "was_abandoned"):
        if k in out and isinstance(out[k], bool):
            out[k] = int(out[k])
    # submitted_at: stringify datetimes to ISO for JSON
    if "submitted_at" in out and out["submitted_at"] is not None:
        sa = out["submitted_at"]
        if hasattr(sa, "isoformat"):
            out["submitted_at"] = sa.isoformat()
    return out


@_instrument("list_runs")
def list_runs(
    character: str | None = None,
    win: str | None = None,
    username: str | None = None,
    seed: str | None = None,
    sort: str | None = None,
    build_id: str | None = None,
    build_ids: str | None = None,
    players: str | None = None,
    game_mode: str | None = None,
    ascension: int | None = None,
    ascension_min: int | None = None,
    ascension_max: int | None = None,
    card: str | None = None,
    relic: str | None = None,
    today: bool = False,
    page: int = 1,
    limit: int = 50,
) -> dict:
    """Paginated, filterable run list. Mirrors the /api/runs/list SQLite path."""
    coll = _get_collection()
    q: dict[str, Any] = {}
    if character:
        q["character"] = character.upper()
    if win == "true":
        q["win"] = {"$in": [True, 1]}
    elif win == "false":
        q["win"] = {"$in": [False, 0]}
        q["was_abandoned"] = {"$in": [False, 0]}
    if username:
        q["username"] = {"$regex": username, "$options": "i"}
    if seed:
        q["seed"] = {"$regex": seed, "$options": "i"}
    if build_ids:
        q["build_id"] = {"$in": [b for b in build_ids.split(",") if b]}
    elif build_id:
        q["build_id"] = build_id
    if players == "single":
        q["player_count"] = 1
    elif players == "multi":
        q["player_count"] = {"$gt": 1}
    if game_mode:
        q["game_mode"] = game_mode
    if ascension is not None:
        q["ascension"] = ascension
    elif ascension_min is not None or ascension_max is not None:
        asc_range: dict[str, int] = {}
        if ascension_min is not None:
            asc_range["$gte"] = ascension_min
        if ascension_max is not None:
            asc_range["$lte"] = ascension_max
        q["ascension"] = asc_range
    if card:
        cards = [
            c.strip().upper().replace(" ", "_") for c in card.split(",") if c.strip()
        ]
        if len(cards) == 1:
            q["deck.id"] = cards[0]
        elif cards:
            q["deck.id"] = {"$all": cards}
    if relic:
        relics_f = [
            r.strip().upper().replace(" ", "_") for r in relic.split(",") if r.strip()
        ]
        if len(relics_f) == 1:
            q["relics.id"] = relics_f[0]
        elif relics_f:
            q["relics.id"] = {"$all": relics_f}
    if today:
        q["seed"] = _today_daily_seed_match()

    sort_map = {
        "time_asc": [("run_time", 1)],
        "time_desc": [("run_time", -1)],
        "ascension_desc": [("ascension", -1), ("run_time", 1)],
        "date": [("submitted_at", -1)],
    }
    sort_clause = sort_map.get(sort or "date", [("submitted_at", -1)])

    total = coll.count_documents(q)
    per_page = min(limit, 100)
    offset = (max(page, 1) - 1) * per_page
    cursor = (
        coll.find(q, _projection_row()).sort(sort_clause).skip(offset).limit(per_page)
    )
    runs = [_row_to_dict(r) for r in cursor]

    return {
        "runs": runs,
        "total": total,
        "page": max(page, 1),
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
    }


@_instrument("leaderboard")
def leaderboard(
    category: str = "fastest",
    character: str | None = None,
    players: str | None = None,
    game_mode: str | None = None,
    today: bool = False,
    page: int = 1,
    limit: int = 50,
) -> dict:
    """Wins-only leaderboard. Mirrors the /api/runs/leaderboard SQLite path.

    Read path:
      1. Fast path -- if the request matches the materialized (category,
         character) default view (page 1, limit 50, no today/players/
         game_mode filter), serve from leaderboard_summary in a single
         find_one. O(1).
      2. Live path -- _leaderboard_live runs the count + find + sort
         directly. The new sort indexes keep this at ~500ms even when the
         summary doesn't cover the combo.
    """
    # Fast path: serve from the materialized summary if this is the
    # default ladder view and the combo is one we materialize.
    if (
        not today
        and page == 1
        and limit == 50
        and players is None
        and game_mode is None
    ):
        try:
            key = _leaderboard_key(category=category, character=character)
            doc = _leaderboard_summary_coll().find_one({"_id": key})
            if doc:
                doc.pop("_id", None)
                doc.pop("updated_at", None)
                return doc
        except Exception:
            pass

    return _leaderboard_live(
        category=category,
        character=character,
        players=players,
        game_mode=game_mode,
        today=today,
        page=page,
        limit=limit,
    )


def _leaderboard_live(
    category: str = "fastest",
    character: str | None = None,
    players: str | None = None,
    game_mode: str | None = None,
    today: bool = False,
    page: int = 1,
    limit: int = 50,
) -> dict:
    """Live leaderboard query -- the original implementation, used directly
    by refresh_leaderboard_summary and as the fallback when the summary
    doesn't cover the requested combo (rare players/game_mode/today/page>1).

    `players` segregates single-player (player_count == 1) from
    multiplayer (player_count > 1) so a fast 5-room MP run doesn't
    sit alongside a fast solo speedrun in the same ladder.
    `game_mode` further filters to standard/daily/custom — custom seeds
    in particular invalidate speedrun comparisons, so the frontend
    surfaces this explicitly and defaults to standard.
    """
    coll = _get_collection()
    # ETL'd docs store win as 0/1 int; submit_run stores bool. Match both.
    q: dict[str, Any] = {"win": {"$in": [True, 1]}}
    if character:
        q["character"] = character.upper()
    if players == "single":
        q["player_count"] = 1
    elif players == "multi":
        q["player_count"] = {"$gt": 1}
    if game_mode:
        q["game_mode"] = game_mode
    if today:
        q["seed"] = _today_daily_seed_match()

    if category == "highest_ascension":
        sort_clause = [("ascension", -1), ("run_time", 1)]
    else:
        sort_clause = [("run_time", 1)]

    total = coll.count_documents(q)
    per_page = min(limit, 100)
    offset = (max(page, 1) - 1) * per_page
    cursor = (
        coll.find(q, _projection_row()).sort(sort_clause).skip(offset).limit(per_page)
    )
    runs = [_row_to_dict(r) for r in cursor]

    return {
        "runs": runs,
        "total": total,
        "page": max(page, 1),
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
        "category": category,
    }


@_instrument("get_run_rank")
def get_run_rank(run_hash: str, category: str = "fastest") -> dict:
    """Rank of a single winning run within its character's leaderboard."""
    coll = _get_collection()
    row = coll.find_one(
        {"_id": run_hash},
        {"win": 1, "character": 1, "run_time": 1, "ascension": 1},
    )
    if not row or not row.get("win"):
        return {"rank": None}

    if category == "highest_ascension":
        ahead = coll.count_documents(
            {
                "win": {"$in": [True, 1]},
                "character": row["character"],
                "$or": [
                    {"ascension": {"$gt": row.get("ascension", 0)}},
                    {
                        "ascension": row.get("ascension", 0),
                        "run_time": {"$lt": row.get("run_time", 0)},
                    },
                ],
            }
        )
    else:
        ahead = coll.count_documents(
            {
                "win": {"$in": [True, 1]},
                "character": row["character"],
                "run_time": {"$lt": row.get("run_time", 0)},
            }
        )
    return {"rank": ahead + 1, "category": category}


def distinct_build_ids() -> list[str]:
    """Distinct build_id values from submitted runs, newest first."""
    coll = _get_collection()
    return sorted([v for v in coll.distinct("build_id") if v], reverse=True)


@_instrument("get_username_for_hash")
def get_username_for_hash(run_hash: str) -> str | None:
    """Look up the username associated with a single run hash."""
    doc = _get_collection().find_one({"_id": run_hash}, {"username": 1})
    return (doc or {}).get("username")


@_instrument("find_sibling_hashes")
def find_sibling_hashes(run_hash: str) -> list[str]:
    """For a multiplayer run, find sibling player runs (same seed)."""
    coll = _get_collection()
    row = coll.find_one({"_id": run_hash}, {"seed": 1})
    if not row or not row.get("seed"):
        return []
    siblings = coll.find({"seed": row["seed"], "_id": {"$ne": run_hash}}, {"_id": 1})
    return [s["_id"] for s in siblings]


# ── Competitive / comparison queries ────────────────────────────────────


@_instrument("get_daily_leaderboard")
def get_daily_leaderboard(username: str | None = None) -> dict:
    """Today's top daily climb wins, plus the requesting user's rank."""
    coll = _get_collection()
    base = {
        "win": {"$in": [True, 1]},
        "game_mode": "daily",
        "seed": _today_daily_seed_match(),
    }

    top_10 = list(coll.find(base, _projection_row()).sort("run_time", 1).limit(10))
    total = coll.count_documents(base)

    runs = []
    for r in top_10:
        row = _row_to_dict(r)
        row["is_current_user"] = bool(username and row.get("username") == username)
        runs.append(row)

    user_rank = None
    if username:
        user_run = coll.find_one(
            {**base, "username": username},
            {"run_time": 1},
            sort=[("run_time", 1)],
        )
        if user_run:
            user_rank = (
                coll.count_documents(
                    {**base, "run_time": {"$lt": user_run["run_time"]}}
                )
                + 1
            )

    return {"runs": runs, "user_rank": user_rank, "total_today": total}


@_instrument("get_run_rank_scoped")
def get_run_rank_scoped(
    run_hash: str,
    category: str = "fastest",
    game_mode: str | None = None,
    players: str | None = None,
    today_only: bool = False,
) -> dict:
    """Rank of a run within a scoped leaderboard. Extends get_run_rank
    with optional game_mode, players, and today-only filters."""
    from datetime import datetime, timezone

    coll = _get_collection()
    row = coll.find_one(
        {"_id": run_hash},
        {"win": 1, "character": 1, "run_time": 1, "ascension": 1},
    )
    if not row or not row.get("win"):
        return {"rank": None, "total": 0}

    scope: dict[str, Any] = {"win": {"$in": [True, 1]}}
    if not today_only:
        scope["character"] = row["character"]
    if game_mode:
        scope["game_mode"] = game_mode
    if players == "single":
        scope["player_count"] = 1
    elif players == "multi":
        scope["player_count"] = {"$gt": 1}
    if today_only:
        scope["seed"] = _today_daily_seed_match()

    if category == "highest_ascension":
        ahead_q = {
            **scope,
            "$or": [
                {"ascension": {"$gt": row.get("ascension", 0)}},
                {
                    "ascension": row.get("ascension", 0),
                    "run_time": {"$lt": row.get("run_time", 0)},
                },
            ],
        }
    else:
        ahead_q = {**scope, "run_time": {"$lt": row.get("run_time", 0)}}

    ahead = coll.count_documents(ahead_q)
    total = coll.count_documents(scope)
    return {"rank": ahead + 1, "total": total}


@_instrument("get_win_rate_comparison")
def get_win_rate_comparison(username: str) -> list[dict]:
    """Per-character win rate for the user vs community average."""
    coll = _get_collection()

    user_chars = list(
        coll.aggregate(
            [
                {"$match": {"username": username}},
                {
                    "$group": {
                        "_id": "$character",
                        "total": {"$sum": 1},
                        "wins": {"$sum": {"$cond": ["$win", 1, 0]}},
                    }
                },
            ],
            allowDiskUse=True,
        )
    )

    summary = _summary_coll().find_one({"_id": "global"})
    community_chars = {}
    if summary and "characters" in summary:
        for c in summary["characters"]:
            community_chars[c["character"]] = c.get("win_rate", 0)

    result = []
    for uc in user_chars:
        char = uc["_id"]
        if char not in OFFICIAL_CHARACTERS or uc["total"] < 5:
            continue
        user_wr = round(uc["wins"] / uc["total"] * 100, 1) if uc["total"] > 0 else 0
        result.append(
            {
                "character": char,
                "user_win_rate": user_wr,
                "community_win_rate": community_chars.get(char, 0),
                "user_wins": uc["wins"],
                "user_total": uc["total"],
            }
        )

    result.sort(key=lambda x: x["user_total"], reverse=True)
    return result


# ── User run ownership ──────────────────────────────────────────────────


def get_user_runs(
    user_id: str,
    page: int = 1,
    limit: int = 50,
) -> dict:
    coll = _get_collection()
    from bson import ObjectId

    match = {"user_id": ObjectId(user_id), "deleted_at": None}
    total = coll.count_documents(match)
    skip = (page - 1) * limit

    rows = list(
        coll.find(match, {"raw": 0})
        .sort("submitted_at", DESCENDING)
        .skip(skip)
        .limit(limit)
    )

    runs = []
    for r in rows:
        runs.append(
            {
                "run_hash": r["_id"],
                "character": r.get("character"),
                "win": r.get("win"),
                "was_abandoned": r.get("was_abandoned"),
                "ascension": r.get("ascension"),
                "game_mode": r.get("game_mode"),
                "player_count": r.get("player_count"),
                "floors_reached": r.get("floors_reached"),
                "killed_by": r.get("killed_by"),
                "username": r.get("username"),
                "submitted_at": r.get("submitted_at"),
            }
        )

    return {"runs": runs, "total": total, "page": page, "limit": limit}


def soft_delete_run(run_hash: str, user_id: str) -> dict:
    coll = _get_collection()

    run = coll.find_one({"_id": run_hash}, {"user_id": 1, "deleted_at": 1})
    if not run:
        return {"error": "Run not found"}

    run_owner = run.get("user_id")
    if not run_owner or str(run_owner) != user_id:
        return {"error": "You do not own this run"}

    if run.get("deleted_at"):
        return {"success": True}

    from datetime import datetime, timezone

    coll.update_one(
        {"_id": run_hash},
        {"$set": {"deleted_at": datetime.now(timezone.utc)}},
    )
    return {"success": True}
