"""Admin API. Same container as everything else; isolation comes from layers:

1. `require_admin` at the *router* level, so every route here is guarded by
   construction and a forgotten decorator can't open a hole. The allowlist
   is the ADMIN_IDS env var (site user ids, Steam64 ids, or Discord ids),
   checked per request so removals apply instantly. Fails closed when unset.
2. Non-admins get a 404, never a 403: the code is public, no need to confirm
   to a probe that it found something real.
3. Cloudflare Access fronts /admin and /api/admin at the edge (configured in
   the Zero Trust dashboard, not in this repo), so unauthenticated traffic
   never reaches the app in production.

Every hit is audit-logged with the admin's identity.
"""

import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request

from ..services import cache as app_cache
from ..services.auth_jwt import require_admin

logger = logging.getLogger("spire-codex.admin")

router = APIRouter(
    prefix="/api/admin",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


def _audit(request: Request) -> None:
    user = getattr(request.state, "admin_user", None) or {}
    logger.info(
        "admin %s %s by user=%s",
        request.method,
        request.url.path,
        user.get("_id") or "?",
    )


def _runs_info() -> dict:
    out: dict = {}
    try:
        if os.environ.get("MONGO_URL", "").strip():
            from ..services.runs_db_mongo import _get_collection

            coll = _get_collection()
            out["total"] = coll.estimated_document_count()
            cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
            out["last_24h"] = coll.count_documents({"submitted_at": {"$gte": cutoff}})
            latest = coll.find_one({}, {"submitted_at": 1}, sort=[("submitted_at", -1)])
            sub = (latest or {}).get("submitted_at")
            out["last_submission"] = sub.isoformat() if sub else None
        else:
            from ..services.runs_db import get_conn

            with get_conn() as conn:
                out["total"] = conn.execute("SELECT COUNT(*) FROM runs").fetchone()[0]
                out["last_24h"] = conn.execute(
                    "SELECT COUNT(*) FROM runs WHERE submitted_at >= datetime('now', '-1 day')"
                ).fetchone()[0]
                row = conn.execute("SELECT MAX(submitted_at) FROM runs").fetchone()
                out["last_submission"] = row[0]
    except Exception:
        logger.warning("admin runs info failed", exc_info=True)
    return out


def _users_info() -> dict:
    try:
        from ..services.users_db import _get_collection

        return {"total": _get_collection().estimated_document_count()}
    except Exception:
        return {}


def _snapshot_info() -> dict:
    """The persisted snapshot's vitals (the shared truth all workers serve
    from), falling back to this worker's in-process cache on SQLite."""
    try:
        if os.environ.get("MONGO_URL", "").strip():
            from ..services.run_entity_stats import SNAPSHOT_COLLECTION_NAME
            from ..services.runs_db_mongo import _get_collection

            db = _get_collection().database
            meta = db[SNAPSHOT_COLLECTION_NAME].find_one({"_id": "__meta__"}) or {}
            built = meta.get("built_at")
            built_iso = built.isoformat() if hasattr(built, "isoformat") else built
            age = None
            if hasattr(built, "timestamp"):
                if built.tzinfo is None:
                    built = built.replace(tzinfo=timezone.utc)
                age = int(datetime.now(timezone.utc).timestamp() - built.timestamp())
            return {
                "built_at": built_iso,
                "age_seconds": age,
                "version": meta.get("snapshot_version"),
                "total_runs": (meta.get("global_totals") or {}).get("total_runs"),
                "has_charts": bool(meta.get("charts")),
            }
        from ..services import run_entity_stats as res

        return {
            "built_at": res._cache_built_at or None,
            "version": res.SNAPSHOT_VERSION,
            "total_runs": (res._global_totals or {}).get("total_runs"),
        }
    except Exception:
        logger.warning("admin snapshot info failed", exc_info=True)
        return {}


def _dau_info() -> dict:
    """Mod usage from the telemetry_dau collection (distinct salted steam-id
    hashes per day): today's count, 7- and 30-day distinct accounts, and a
    14-day daily series. Empty without Mongo."""
    try:
        if not os.environ.get("MONGO_URL", "").strip():
            return {}
        from ..services.runs_db_mongo import get_database

        coll = get_database().telemetry_dau
        rows = list(
            coll.aggregate(
                [
                    {"$group": {"_id": "$day", "count": {"$sum": 1}}},
                    {"$sort": {"_id": -1}},
                    {"$limit": 14},
                ]
            )
        )
        series = [{"day": r["_id"], "count": r["count"]} for r in reversed(rows)]
        # Day strings are bucketed in Pacific time by the telemetry ping; read
        # "today" and the rolling windows in the same zone so they line up.
        from .telemetry import DAU_TZ

        today = datetime.now(DAU_TZ).strftime("%Y-%m-%d")
        today_count = next((r["count"] for r in series if r["day"] == today), 0)

        def _distinct_since(days: int) -> int:
            cutoff = (datetime.now(DAU_TZ) - timedelta(days=days)).strftime("%Y-%m-%d")
            res = list(
                coll.aggregate(
                    [
                        {"$match": {"day": {"$gte": cutoff}}},
                        {"$group": {"_id": "$uid"}},
                        {"$count": "n"},
                    ]
                )
            )
            return res[0]["n"] if res else 0

        return {
            "today": today_count,
            "wau": _distinct_since(7),
            "mau": _distinct_since(30),
            "series": series,
        }
    except Exception:
        logger.warning("admin dau info failed", exc_info=True)
        return {}


# Overview vitals cache: the five info blocks are independent Mongo queries
# (the DAU aggregations are the slow ones); computed serially they made the
# admin landing page drag. Fan out + a short TTL so revisits are instant.
_OVERVIEW_TTL_SECONDS = 20.0
_overview_cache: dict = {"at": 0.0, "data": None}


@router.get("/overview")
def overview(request: Request):
    """Operational vitals: run volume, users, snapshot freshness, Redis, and
    the mod's daily-active-user counts."""
    _audit(request)
    import time
    from concurrent.futures import ThreadPoolExecutor

    now = time.monotonic()
    if (
        _overview_cache["data"] is not None
        and now - _overview_cache["at"] < _OVERVIEW_TTL_SECONDS
    ):
        return _overview_cache["data"]

    with ThreadPoolExecutor(max_workers=5, thread_name_prefix="admin-ov") as pool:
        futures = {
            "runs": pool.submit(_runs_info),
            "users": pool.submit(_users_info),
            "snapshot": pool.submit(_snapshot_info),
            "redis": pool.submit(app_cache.info),
            "dau": pool.submit(_dau_info),
        }
        data = {k: f.result() for k, f in futures.items()}
    data["environment"] = os.environ.get("ENVIRONMENT", "development")
    _overview_cache["data"] = data
    _overview_cache["at"] = now
    return data


@router.get("/live")
def live(request: Request):
    """Live players: the current roster (identity, depth, current-session
    length) and the all-time live-hours leaderboard. Both from the presence
    layer; polled more often than /overview since it changes by the second."""
    _audit(request)
    from ..services import presence_db

    # Capture the current concurrency against the all-time peak while we're here,
    # so opening this view records a high even if no new session fired it.
    presence_db.note_peak()
    return {
        "current": presence_db.current_summary(50),
        "all_time": presence_db.top_live_totals(20),
        "peak": presence_db.peak_concurrent(),
    }


# ── The operational surfaces (the rest of the lair) ─────────────────────


@router.get("/runs/search")
def runs_search(
    request: Request,
    username: str | None = None,
    seed: str | None = None,
    run_hash: str | None = None,
    max_win_seconds: int | None = None,
    anomalies: bool = False,
    hidden_only: bool = False,
    limit: int = 25,
):
    """Find submitted runs to inspect, hide, or delete. run_hash wins when given.
    max_win_seconds surfaces the cheater review queue: wins faster than that many
    seconds, fastest first, with already-hidden runs included so you can see
    what's flagged. Otherwise username/seed filter the normal listing, newest
    first. Admin searches include hidden runs (they carry a `hidden` flag)."""
    _audit(request)
    if not os.environ.get("MONGO_URL", "").strip():
        return {"runs": [], "total": 0}
    from ..services.runs_db_mongo import get_database, list_runs

    limit = max(1, min(limit, 100))
    if run_hash:
        # Single-player runs key on _id (= the run hash) with no run_hash field;
        # multiplayer runs share a run_hash field across per-player docs. Match
        # either, and expose the hash as run_hash for the UI.
        h = run_hash.strip()
        docs = list(get_database()["runs"].find({"$or": [{"_id": h}, {"run_hash": h}]}))
        for d in docs:
            d["run_hash"] = d.get("run_hash") or d.pop("_id", None)
            d.pop("_id", None)
            d.pop("raw", None)
        return {"runs": docs, "total": len(docs)}
    if hidden_only:
        # Everything currently hidden (manual or auto), newest first, with
        # the auto-hide reason so the queue explains itself.
        cursor = (
            get_database()["runs"]
            .find(
                {"hidden": True},
                {
                    "seed": 1,
                    "character": 1,
                    "win": 1,
                    "ascension": 1,
                    "run_time": 1,
                    "username": 1,
                    "submitted_at": 1,
                    "hidden": 1,
                    "hidden_reason": 1,
                    "run_hash": 1,
                },
            )
            .sort([("submitted_at", -1)])
            .limit(limit)
        )
        runs = list(cursor)
        for d in runs:
            d["run_hash"] = d.get("run_hash") or d.pop("_id", None)
            d.pop("_id", None)
            sa = d.get("submitted_at")
            if hasattr(sa, "isoformat"):
                d["submitted_at"] = sa.isoformat()
        return {"runs": runs, "total": len(runs)}
    if anomalies:
        # Combined implausibility queue: each rule contributes up to 50 rows
        # with a reason tag; a run tripping several rules carries them all.
        coll = get_database()["runs"]
        proj = {
            "run_hash": 1,
            "run_time": 1,
            "character": 1,
            "ascension": 1,
            "username": 1,
            "win": 1,
            "hidden": 1,
            "submitted_at": 1,
            "deck_size": {"$size": {"$ifNull": ["$deck", []]}},
        }
        flagged: dict[str, dict] = {}

        def _collect(query: dict, reason: str, sort: list) -> None:
            for d in coll.find(query, proj).sort(sort).limit(50):
                h = d.get("run_hash") or d.get("_id")
                row = flagged.setdefault(h, {**d, "reasons": []})
                row["reasons"].append(reason)

        _collect(
            {"win": {"$in": [True, 1]}, "run_time": {"$gt": 0, "$lt": 420}},
            "win under 7 minutes",
            [("run_time", 1)],
        )
        _collect(
            {"run_time": {"$gt": 7 * 24 * 3600}},
            "run_time over 7 days",
            [("run_time", -1)],
        )
        _collect(
            {"$expr": {"$gt": [{"$size": {"$ifNull": ["$deck", []]}}, 150]}},
            "deck over 150 cards",
            [("submitted_at", -1)],
        )
        runs = []
        for h, d in flagged.items():
            d["run_hash"] = h
            d.pop("_id", None)
            sa = d.get("submitted_at")
            if hasattr(sa, "isoformat"):
                d["submitted_at"] = sa.isoformat()
            runs.append(d)
        runs.sort(key=lambda r: (bool(r.get("hidden")), -len(r["reasons"])))
        return {"runs": runs[: max(1, min(limit, 200))], "total": len(runs)}
    if max_win_seconds is not None:
        # The review queue: implausibly fast "wins", fastest first, hidden ones
        # included so an admin can tell what's already been flagged.
        coll = get_database()["runs"]
        q = {
            "win": {"$in": [True, 1]},
            "run_time": {"$gt": 0, "$lt": int(max_win_seconds)},
        }
        cursor = (
            coll.find(
                q,
                {
                    # _id is the run hash for single-player; multiplayer docs also
                    # carry a run_hash field. Keep both and resolve below.
                    "run_hash": 1,
                    "run_time": 1,
                    "character": 1,
                    "ascension": 1,
                    "username": 1,
                    "win": 1,
                    "hidden": 1,
                    "submitted_at": 1,
                },
            )
            .sort([("run_time", 1)])
            .limit(limit)
        )
        runs = list(cursor)
        for d in runs:
            # Expose the hash as run_hash so the admin UI can hide/delete these.
            d["run_hash"] = d.get("run_hash") or d.pop("_id", None)
            d.pop("_id", None)
            sa = d.get("submitted_at")
            if hasattr(sa, "isoformat"):
                d["submitted_at"] = sa.isoformat()
        return {"runs": runs, "total": len(runs)}
    result = list_runs(
        username=(username or "").strip() or None,
        seed=(seed or "").strip() or None,
        sort="newest",
        page=1,
        limit=limit,
        include_hidden=True,
    )
    return result


@router.post("/runs/cheat-sweep")
def runs_cheat_sweep(request: Request, dry_run: bool = True, limit: int = 500):
    """Scan existing runs for the submit-time cheat signals (stacked relic
    copies, boss-teleport wins) and hide the matches. dry_run=true (the
    default) only lists what would be hidden."""
    _audit(request)
    if not os.environ.get("MONGO_URL", "").strip():
        return {"dry_run": dry_run, "flagged": [], "hidden": 0}
    from ..services.cheat_detect import MAX_RELIC_COPIES, MIN_ACT_FLOORS
    from ..services.runs_db_mongo import get_database, set_run_hidden

    db = get_database()["runs"]
    flagged: dict[str, str] = {}

    # Stacked relics: any doc whose relics.id list has duplicates at all
    # (cheap server-side set test), then verify the real ceiling in Python.
    dupe_candidates = db.find(
        {
            "hidden": {"$ne": True},
            "$expr": {
                "$gt": [
                    {"$size": {"$ifNull": ["$relics", []]}},
                    {"$size": {"$setUnion": [{"$ifNull": ["$relics.id", []]}, []]}},
                ]
            },
        },
        {"relics.id": 1, "run_hash": 1},
    ).limit(2000)
    for d in dupe_candidates:
        counts: dict[str, int] = {}
        for r in d.get("relics") or []:
            rid = str(r.get("id") or "")
            counts[rid] = counts.get(rid, 0) + 1
        worst = max(counts.items(), key=lambda kv: kv[1], default=("", 0))
        if worst[1] > MAX_RELIC_COPIES:
            h = d.get("run_hash") or d["_id"]
            flagged[h] = f"duplicate_relics:{worst[0]}x{worst[1]}"

    # Boss-teleport wins: cheap floors_reached prefilter, then the same
    # per-act check submit-time detection uses, from the stored history.
    tele_candidates = db.find(
        {
            "hidden": {"$ne": True},
            "win": True,
            "floors_reached": {"$gt": 0, "$lt": 40},
        },
        {"map_point_history": 1, "run_hash": 1},
    ).limit(2000)
    for d in tele_candidates:
        for i, act in enumerate(d.get("map_point_history") or []):
            floors = act or []
            has_boss = any(
                (room.get("room_type") or "").lower() == "boss"
                for fl in floors
                if isinstance(fl, dict)
                for room in fl.get("rooms") or []
                if isinstance(room, dict)
            )
            if has_boss and len(floors) < MIN_ACT_FLOORS:
                h = d.get("run_hash") or d["_id"]
                flagged[h] = f"boss_teleport:act{i + 1}:{len(floors)}floors"
                break

    items = sorted(flagged.items())[:limit]
    hidden = 0
    if not dry_run:
        for h, reason in items:
            set_run_hidden(h, True)
            db.update_many(
                {"$or": [{"_id": h}, {"run_hash": h}]},
                {"$set": {"hidden_reason": "auto:" + reason}},
            )
            hidden += 1
    return {
        "dry_run": dry_run,
        "flagged": [{"run_hash": h, "reason": r} for h, r in items],
        "hidden": hidden,
    }


@router.delete("/runs/{run_hash}")
def runs_delete(request: Request, run_hash: str):
    """Remove a submitted run: every Mongo doc sharing the hash, the
    run_blobs doc, the blob file, and the caches in front of them.
    Aggregates (snapshot, leaderboard summaries) drop it on their next
    scheduled rebuild."""
    _audit(request)
    from ..services import admin_db
    from .runs import _data_dir, _load_run_blob

    result = admin_db.delete_run(run_hash.strip(), _data_dir / "runs")
    # The shared-run endpoint caches blobs in Redis (run:<hash>, 15min TTL)
    # and an in-process LRU; evict both so the deleted run stops being served
    # here immediately. The LRU is per worker, so other workers only age it
    # out via LRU eviction — acceptable for moderation deletes.
    app_cache.delete(f"run:{run_hash.strip()}")
    _load_run_blob.cache_clear()
    logger.info(
        "admin deleted run %s: %s docs, blob_deleted=%s, file_removed=%s",
        run_hash,
        result["deleted_docs"],
        result["blob_deleted"],
        result["file_removed"],
    )
    return {"run_hash": run_hash, **result}


@router.post("/runs/{run_hash}/hide")
async def runs_set_hidden(request: Request, run_hash: str):
    """Flag (or unflag) a run as ineligible so it drops out of the leaderboards,
    /charts, the stats, and the run browser. Body: {"hidden": bool} (defaults to
    true). Reversible - the run is kept, just filtered. Materialized leaderboard
    and stats summaries clear it on their next ~60s rebuild."""
    _audit(request)
    from fastapi import HTTPException

    if not os.environ.get("MONGO_URL", "").strip():
        raise HTTPException(status_code=503, detail="run hiding needs MongoDB")
    try:
        body = await request.json()
    except Exception:
        body = {}
    hidden = bool(body.get("hidden", True))
    from ..services.runs_db_mongo import set_run_hidden
    from .runs import _load_run_blob

    result = set_run_hidden(run_hash.strip(), hidden)
    # Evict the in-process blob LRU so this worker stops serving the run's
    # detail immediately; other workers age it out on their own.
    _load_run_blob.cache_clear()
    logger.info("admin set hidden=%s on run %s: %s", hidden, run_hash, result)
    return {"run_hash": run_hash, "hidden": hidden, **result}


# ── Users ───────────────────────────────────────────────────────────────


def _require_mongo_users() -> None:
    if not os.environ.get("MONGO_URL", "").strip():
        from fastapi import HTTPException

        raise HTTPException(status_code=503, detail="user management needs MongoDB")


@router.get("/users")
def users_list(request: Request, q: str | None = None, page: int = 1, limit: int = 50):
    """Every registered account, newest first, with linked identities and run
    counts. `q` filters by username, email, or any identity id (Steam/Discord/
    Twitch/account id)."""
    _audit(request)
    _require_mongo_users()
    from ..services.users_db import admin_list_users

    return admin_list_users(q=q, page=page, limit=limit)


@router.patch("/users/{user_id}")
async def users_rename(request: Request, user_id: str):
    """Admin rename: bypasses the 3/day self-service cap but still enforces
    sanitization + uniqueness, and re-stamps the name on the account's runs."""
    _audit(request)
    _require_mongo_users()
    from fastapi import HTTPException

    try:
        body = await request.json()
    except Exception:
        body = {}
    username = (body.get("username") or "").strip()
    if not username:
        raise HTTPException(status_code=422, detail="username required")
    from ..services.users_db import admin_set_username

    result = admin_set_username(user_id, username)
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    logger.info("admin renamed user %s -> %s", user_id, result.get("username"))
    return result


@router.delete("/users/{user_id}")
def users_delete(request: Request, user_id: str):
    """Delete an account. Its runs are kept but unlinked (user_id cleared), so
    nothing is lost; merge instead when you want to keep the attribution."""
    _audit(request)
    _require_mongo_users()
    from fastapi import HTTPException

    from ..services.users_db import admin_delete_user

    result = admin_delete_user(user_id)
    if result.get("error"):
        raise HTTPException(status_code=404, detail=result["error"])
    logger.info("admin deleted user %s: %s", user_id, result)
    return result


@router.post("/users/merge")
async def users_merge(request: Request):
    """Merge one account into another: body {"source_id", "target_id"}. Moves
    the source's runs onto the target, lifts any identities the target lacks
    (Steam / Discord / Twitch / email / partner) from the source, then deletes
    the source."""
    _audit(request)
    _require_mongo_users()
    from fastapi import HTTPException

    try:
        body = await request.json()
    except Exception:
        body = {}
    source_id = (body.get("source_id") or "").strip()
    target_id = (body.get("target_id") or "").strip()
    if not source_id or not target_id:
        raise HTTPException(status_code=422, detail="source_id and target_id required")
    from ..services.users_db import admin_merge_users

    result = admin_merge_users(source_id, target_id)
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    logger.info("admin merged user %s into %s: %s", source_id, target_id, result)
    return result


@router.post("/users/{user_id}/partner")
async def users_set_partner(request: Request, user_id: str):
    """Mark or unmark a curated partner: body {"is_partner": bool}. A partner
    who is both live in the mod and streaming on Twitch floats to the top of the
    /live roster. Requires the account to have a Twitch login linked."""
    _audit(request)
    _require_mongo_users()
    from fastapi import HTTPException

    try:
        body = await request.json()
    except Exception:
        body = {}
    is_partner = bool(body.get("is_partner"))
    from ..services.users_db import set_partner

    result = set_partner(user_id, is_partner)
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    logger.info("admin set partner=%s on user %s", is_partner, user_id)
    return result


# Cap the batch so one paste can't fan out into thousands of outbound Steam
# requests. Plenty for a giveaway entrant list.
_STEAM_RESOLVE_CAP = 300


@router.post("/steam/resolve")
async def steam_resolve(request: Request):
    """Resolve a batch of raw SteamID64s for the giveaway tool. Each id is
    validated, looked up against Steam's public profile XML (persona + avatar,
    works for anyone with a public profile), and cross-checked against our
    accounts (member? run count?). Input order is preserved and duplicates are
    collapsed; the batch is capped at _STEAM_RESOLVE_CAP."""
    _audit(request)
    from fastapi import HTTPException

    try:
        body = await request.json()
    except Exception:
        body = {}
    raw = body.get("steam_ids") if isinstance(body, dict) else None
    if not isinstance(raw, list):
        raise HTTPException(status_code=422, detail="steam_ids must be a list")

    # Dedupe preserving first-seen order, then cap.
    seen: list[str] = []
    for item in raw:
        sid = str(item).strip()
        if sid and sid not in seen:
            seen.append(sid)
        if len(seen) >= _STEAM_RESOLVE_CAP:
            break

    from ..services import steam_profile

    valid = [s for s in seen if steam_profile.is_valid_steamid64(s)]
    profiles = await steam_profile.resolve_many(valid)

    members: dict = {}
    try:
        from ..services.users_db import admin_members_by_steam_ids

        members = admin_members_by_steam_ids(valid)
    except Exception:
        # A Mongo hiccup shouldn't sink the whole lookup; entrants still resolve
        # to Steam profiles, just without the member/run-count annotation.
        logger.warning("giveaway member lookup failed", exc_info=True)

    results = []
    resolved = 0
    for sid in seen:
        prof = profiles.get(sid)
        if prof:
            resolved += 1
        results.append(
            {
                "steam_id": sid,
                "valid": steam_profile.is_valid_steamid64(sid),
                "steam": prof,
                "member": members.get(sid),
            }
        )

    return {
        "results": results,
        "counts": {
            "total": len(seen),
            "valid": len(valid),
            "invalid": len(seen) - len(valid),
            "resolved": resolved,
            "members": len(members),
        },
    }


@router.get("/feedback")
def feedback_inbox(request: Request, include_resolved: bool = False, limit: int = 50):
    """The feedback inbox: site feedback and QA card reports, newest first.
    Submissions land here alongside the Discord webhook."""
    _audit(request)
    from ..services import admin_db

    return {
        "items": admin_db.list_feedback(limit=limit, include_resolved=include_resolved)
    }


@router.post("/feedback/{item_id}/resolve")
def feedback_resolve(request: Request, item_id: str):
    _audit(request)
    from ..services import admin_db

    return {"resolved": admin_db.resolve_feedback(item_id)}


@router.get("/guides/pending")
def guides_pending(request: Request, limit: int = 50):
    """Guide submissions awaiting review. Publishing stays a git operation
    (guides ship in data/guides.json); dismiss clears handled entries."""
    _audit(request)
    from ..services import admin_db

    return {"items": admin_db.list_pending_guides(limit=limit)}


@router.post("/guides/submissions/{sub_id}/dismiss")
def guides_dismiss(request: Request, sub_id: str):
    _audit(request)
    from ..services import admin_db

    return {"dismissed": admin_db.dismiss_guide_submission(sub_id)}


@router.post("/cf/purge")
async def cf_purge(request: Request):
    """Purge the Cloudflare cache: body {"paths": ["/cards", ...]} purges
    those URLs on the apex domain; an empty/missing list purges the whole
    zone. Needs CF_TOKEN + CF_ZONE in the backend env."""
    _audit(request)
    token = os.environ.get("CF_TOKEN", "").strip()
    zone = os.environ.get("CF_ZONE", "").strip()
    if not token or not zone:
        from fastapi import HTTPException

        raise HTTPException(status_code=503, detail="CF_TOKEN / CF_ZONE not configured")

    try:
        body = await request.json()
    except Exception:
        body = {}
    paths = [p for p in (body.get("paths") or []) if isinstance(p, str) and p.strip()]
    if paths:
        site = os.environ.get("PUBLIC_SITE_BASE", "https://spire-codex.com").rstrip("/")
        files = [f"{site}{p if p.startswith('/') else '/' + p}" for p in paths[:30]]
        payload: dict = {"files": files}
    else:
        payload = {"purge_everything": True}

    import httpx

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"https://api.cloudflare.com/client/v4/zones/{zone}/purge_cache",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )
    ok = resp.status_code == 200 and resp.json().get("success") is True
    logger.info("admin CF purge (%s): ok=%s", "paths" if paths else "everything", ok)
    return {"ok": ok, "purged": "paths" if paths else "everything", "count": len(paths)}


@router.get("/announcements")
def announcements_list(request: Request):
    """Every banner announcement, active or not, newest first."""
    _audit(request)
    from ..services import admin_db

    return {"items": admin_db.list_announcements()}


@router.post("/announcements")
async def announcements_create(request: Request):
    """Create a banner announcement: body {"message": "..."} with optional
    inline [label](/href) links. New announcements start active, and each
    visitor's dismissal is keyed per announcement, so publishing a new one
    reshows the banner for everyone automatically."""
    _audit(request)
    from fastapi import HTTPException

    try:
        body = await request.json()
    except Exception:
        body = {}
    message = (body.get("message") or "").strip()
    if not message or len(message) > 500:
        raise HTTPException(status_code=422, detail="message required, max 500 chars")
    from ..services import admin_db

    item = admin_db.create_announcement(message)
    app_cache.delete("announcements:active")
    return item


@router.post("/announcements/{ann_id}/toggle")
def announcements_toggle(request: Request, ann_id: str):
    _audit(request)
    from ..services import admin_db

    ok = admin_db.toggle_announcement(ann_id)
    app_cache.delete("announcements:active")
    return {"toggled": ok}


@router.delete("/announcements/{ann_id}")
def announcements_delete(request: Request, ann_id: str):
    _audit(request)
    from ..services import admin_db

    ok = admin_db.delete_announcement(ann_id)
    app_cache.delete("announcements:active")
    return {"deleted": ok}


# ── Umami analytics (proxied so credentials stay server-side) ───────────

_umami_token: str | None = None


async def _umami_get(client, url: str, params: dict) -> dict | None:
    """GET with the cached bearer token, re-logging-in once on a 401
    (self-hosted Umami tokens expire)."""
    global _umami_token
    # docker-compose templates this as `${UMAMI_URL:-}`, so an unset
    # host-side var arrives as an EMPTY string, not a missing key; a
    # plain .get() default never kicks in and httpx then explodes on a
    # host-less URL. `or` past the empty string to the real default.
    #
    # Default to the container next door over the shared docker network, NOT
    # the public host. analytics.spire-codex.com sits behind Cloudflare
    # Access, so a server-side login POST there gets the CF challenge page
    # instead of the API and every call silently returns None - blank cards
    # that look like zero traffic. umami:3000 is the same box, no edge.
    base = (os.environ.get("UMAMI_URL", "").strip() or "http://umami:3000").rstrip("/")
    username = os.environ.get("UMAMI_USERNAME", "").strip()
    password = os.environ.get("UMAMI_PASSWORD", "").strip()
    for attempt in (1, 2):
        if not _umami_token:
            resp = await client.post(
                f"{base}/api/auth/login",
                json={"username": username, "password": password},
            )
            if resp.status_code != 200:
                logger.warning("umami login failed: %s", resp.status_code)
                return None
            _umami_token = resp.json().get("token")
        resp = await client.get(
            f"{base}{url}",
            params=params,
            headers={"Authorization": f"Bearer {_umami_token}"},
        )
        if resp.status_code == 401 and attempt == 1:
            _umami_token = None
            continue
        if resp.status_code != 200:
            logger.warning("umami %s failed: %s", url, resp.status_code)
            return None
        return resp.json()
    return None


def _active_count(raw) -> int:
    """Umami's /active endpoint has shipped two shapes across versions:
    `[{"x": N}]` (older) and `{"visitors": N}` (current). Accept either, and
    None (the call failed) as 0."""
    if isinstance(raw, list):
        return int(raw[0].get("x", 0)) if raw and isinstance(raw[0], dict) else 0
    if isinstance(raw, dict):
        return int(raw.get("visitors", raw.get("x", 0)) or 0)
    return 0


def _norm_stats(raw) -> dict | None:
    """Umami's /stats shape changed across versions. Current builds return flat
    numbers with the previous period under `comparison`:
        {"pageviews": 4938, "visitors": 1302, ..., "comparison": {"pageviews": 4891, ...}}
    older builds nested each metric as {"value": N, "prev": M}. Normalise both
    to {metric: {value, prev}} so the admin UI has one stable contract."""
    if not isinstance(raw, dict):
        return None
    comp = raw.get("comparison") or {}
    out: dict = {}
    for k in ("pageviews", "visitors", "visits", "bounces", "totaltime"):
        v = raw.get(k)
        if isinstance(v, dict):  # already {value, prev}
            out[k] = {"value": v.get("value"), "prev": v.get("prev")}
        elif v is not None:
            out[k] = {"value": v, "prev": comp.get(k)}
    return out or None


@router.get("/analytics")
async def analytics(request: Request):
    """Umami headline numbers: active visitors right now, plus visitors and
    pageviews for the last 24h and 7d and the top pages, proxied server-side.
    503 until UMAMI_USERNAME and UMAMI_PASSWORD are configured."""
    _audit(request)
    if not (
        os.environ.get("UMAMI_USERNAME", "").strip()
        and os.environ.get("UMAMI_PASSWORD", "").strip()
    ):
        from fastapi import HTTPException

        raise HTTPException(
            status_code=503, detail="UMAMI_USERNAME / UMAMI_PASSWORD not configured"
        )

    import time as _time

    import httpx

    website = (
        os.environ.get("UMAMI_WEBSITE_ID", "").strip()
        or "715a2b92-5064-4369-9d33-cdd1c0ea8f93"
    )
    now_ms = int(_time.time() * 1000)
    day_ms = 24 * 3600 * 1000
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Visitors active in the last ~5 min: the realtime figure.
            active_raw = await _umami_get(client, f"/api/websites/{website}/active", {})
            stats_24h = await _umami_get(
                client,
                f"/api/websites/{website}/stats",
                {"startAt": now_ms - day_ms, "endAt": now_ms},
            )
            stats_7d = await _umami_get(
                client,
                f"/api/websites/{website}/stats",
                {"startAt": now_ms - 7 * day_ms, "endAt": now_ms},
            )
            # Current Umami calls the page-URL metric "path"; older builds
            # called it "url" (and reject "path"), so fall back once.
            page_params = {
                "startAt": now_ms - 7 * day_ms,
                "endAt": now_ms,
                "limit": 10,
            }
            top_pages = await _umami_get(
                client,
                f"/api/websites/{website}/metrics",
                {"type": "path", **page_params},
            )
            if top_pages is None:
                top_pages = await _umami_get(
                    client,
                    f"/api/websites/{website}/metrics",
                    {"type": "url", **page_params},
                )
    except httpx.HTTPError as exc:
        # Bad UMAMI_URL, DNS failure, timeout: degrade to a labelled 502
        # instead of an anonymous 500 so the admin UI says what to fix.
        from fastapi import HTTPException

        logger.warning("umami proxy failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=502, detail=f"Umami unreachable: {type(exc).__name__}: {exc}"
        ) from exc
    # Every call comes back None when login itself failed (wrong creds, or
    # UMAMI_URL pointing at the Cloudflare-gated public host). Say so loudly
    # instead of returning a payload of blanks that reads as zero traffic.
    if stats_24h is None and stats_7d is None and active_raw is None:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=502,
            detail=(
                "Umami login/website lookup failed. Check UMAMI_URL points at the "
                "internal http://umami:3000 (not the Cloudflare-gated public host), "
                "the credentials, and UMAMI_WEBSITE_ID."
            ),
        )
    return {
        "active": _active_count(active_raw),
        "last_24h": _norm_stats(stats_24h),
        "last_7d": _norm_stats(stats_7d),
        "top_pages": top_pages or [],
        # Always the public dashboard, never the container-internal
        # UMAMI_URL (http://umami:3000) the proxy itself may use.
        "dashboard_url": "https://analytics.spire-codex.com",
    }
