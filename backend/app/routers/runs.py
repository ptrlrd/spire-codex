"""Run submission and community stats API endpoints."""

import json
import logging
import os
import time
from functools import lru_cache
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query, Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address
from ..services.runs_db import submit_run, get_stats, claim_runs
from ..services import cache as app_cache
from ..services.run_entity_stats import (
    get_all_entity_scores,
    get_community_stats as get_community_fun_stats,
    get_entity_metrics_table,
    get_entity_stats,
    get_top_entities_for_character,
    snapshot_loaded,
    snapshot_status,
)
from ..metrics import (
    run_submissions,
    run_character,
    run_outcome,
    run_errors,
    run_ascension,
    run_duration,
)

_data_dir = Path(
    os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data")
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/runs", tags=["Runs"])
limiter = Limiter(key_func=get_remote_address)

MAX_BODY_SIZE = 512 * 1024  # 512 KB


@lru_cache(maxsize=256)
def _load_run_blob(run_hash: str) -> str | None:
    """Read a run JSON file once and serve from memory thereafter.

    Run files are immutable once submitted, so a cache is safe — the only
    way the contents change is the multiplayer-sibling fallback below
    `shutil.copy2`'ing a sibling's file in, which happens at most once per
    `run_hash` (the next request hits the file directly). Returning the
    raw text keeps FastAPI from re-serializing on every request, which
    matters when a scraper enumerates hashes and turns the worker into a
    json.dumps loop. `None` means file missing.
    """
    run_file = _data_dir / "runs" / f"{run_hash}.json"
    if not run_file.exists():
        return None
    with open(run_file, "r", encoding="utf-8") as f:
        return f.read()


@router.post("", tags=["Runs"])
@limiter.limit("3000/hour")
async def submit_run_endpoint(
    request: Request,
    username: str | None = None,
    steam_id: str | None = None,
    discord_id: str | None = None,
):
    """Submit a run for community stats. Paste the .run file JSON content. Optional ?username= param.

    Pass ?steam_id=<SteamID64> (the overlay / Compendium send the signed-in
    player's Steam ID) and/or ?discord_id=<id> to tag the run with its owner
    so it links to their account on sign-in without a manual claim.

    Rate limit: 3000/hour (~50/min sustained, with room for burst). The
    earlier 600/hour ceiling was sized for "a few hundred backlog runs
    on first install" but silently capped users with larger histories
    — a Discord report of someone with 1000+ saved runs would have
    dropped 400 of them at 600/hour. Each submission is ~10ms backend
    work (Mongo insert + JSON file write + metrics bump) and duplicate
    detection short-circuits at ~3ms via the run_hash UNIQUE
    constraint, so actual write load is bounded by *distinct* runs per
    uploader, not raw submission count. Easy to lower again if scraper
    abuse shows up in
    `spire_codex_api_errors_total{status_code="429"}` against this
    endpoint.
    """
    if os.environ.get("DISABLE_RUN_SUBMISSIONS"):
        run_errors.labels(reason="disabled").inc()
        raise HTTPException(
            status_code=403,
            detail="Run submissions are disabled on the beta site. Submit to spire-codex.com instead.",
        )
    body = await request.body()
    if len(body) > MAX_BODY_SIZE:
        run_errors.labels(reason="too_large").inc()
        raise HTTPException(
            status_code=413,
            detail=f"Request too large. Max {MAX_BODY_SIZE // 1024} KB.",
        )
    try:
        data = await request.json()
    except Exception:
        run_errors.labels(reason="invalid_json").inc()
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Sanitize username — alphanumeric, underscores, hyphens, spaces only
    clean_username = None
    if username:
        import re

        sanitized = re.sub(r"[^a-zA-Z0-9_\- ]", "", username.strip())[:32].strip()
        clean_username = sanitized or None

    # Sanitize steam_id / discord_id — both are digits only (SteamID64 and
    # Discord snowflake). Drop anything else so a malformed value can't
    # widen the linkage query.
    clean_steam_id = None
    if steam_id:
        digits = "".join(ch for ch in steam_id if ch.isdigit())
        clean_steam_id = digits or None

    # Authenticated uploads (the in-game mod sends `Authorization: Bearer <jwt>` from the
    # Steam sign-in flow): the token's verified steamid outranks the spoofable query param.
    auth_header = request.headers.get("authorization") or ""
    if auth_header.lower().startswith("bearer "):
        from ..services.auth_jwt import decode_token

        claims = decode_token(auth_header[7:].strip())
        token_steamid = str((claims or {}).get("steam_id") or "")
        if token_steamid.isdigit():
            clean_steam_id = token_steamid

    clean_discord_id = None
    if discord_id:
        digits = "".join(ch for ch in discord_id if ch.isdigit())
        clean_discord_id = digits or None

    result = submit_run(
        data,
        username=clean_username,
        steam_id=clean_steam_id,
        discord_id=clean_discord_id,
    )

    site_base = os.environ.get("PUBLIC_SITE_BASE", "https://spire-codex.com").rstrip(
        "/"
    )

    if result.get("error"):
        if result.get("duplicate"):
            run_submissions.labels(status="duplicate").inc()
            dup_hash = result.get("run_hash")
            return {
                "success": True,
                "duplicate": True,
                "run_hash": dup_hash,
                "url": f"{site_base}/runs/{dup_hash}" if dup_hash else None,
            }
        run_submissions.labels(status="error").inc()
        run_errors.labels(reason="missing_fields").inc()
        raise HTTPException(status_code=400, detail=result["error"])

    # Enrich for the in-game post-run card: the shareable page URL, and (when this
    # run is itself a completed upload on a known seed) its seed standing.
    run_hash = result.get("run_hash")
    if run_hash:
        result["url"] = f"{site_base}/runs/{run_hash}"
    seed = (data.get("seed") or "").strip()
    if (
        seed
        and not data.get("was_abandoned")
        and os.environ.get("MONGO_URL", "").strip()
    ):
        try:
            from ..services.runs_db_mongo import seed_rank_for

            rank = seed_rank_for(clean_steam_id, seed)
            result["seed_rank"] = rank.get("seed_rank")
            result["seed_total"] = rank.get("seed_total")
        except Exception:
            pass  # enrichment only; the upload itself already succeeded

    # Track successful submission metrics
    run_submissions.labels(status="success").inc()
    player = data.get("players", [{}])[0]
    char = player.get("character", "").replace("CHARACTER.", "")
    if char:
        run_character.labels(character=char).inc()
    if data.get("was_abandoned"):
        run_outcome.labels(outcome="abandoned").inc()
    elif data.get("win"):
        run_outcome.labels(outcome="win").inc()
    else:
        run_outcome.labels(outcome="loss").inc()

    ascension = data.get("ascension", 0)
    run_ascension.labels(ascension=str(ascension)).inc()

    run_time = data.get("run_time", 0)
    if run_time > 0:
        run_duration.observe(run_time)

    return result


MAX_CLAIM_HASHES = 5000


@router.post("/claim", tags=["Runs"])
@limiter.limit("10/minute")
async def claim_runs_endpoint(request: Request):
    """Attach a username to previously-submitted runs by hash.

    Body: `{ "username": "name", "hashes": ["abc123...", ...] }`

    Only rows with a NULL/empty username are updated — existing
    claims are never overwritten. Intended for the Spire Compendium
    desktop app: after Steam sign-in, the client computes hashes
    for every local run and claims the ones it already uploaded
    anonymously.
    """
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    raw_username = payload.get("username")
    if not raw_username or not isinstance(raw_username, str):
        raise HTTPException(status_code=400, detail="username is required")

    import re

    sanitized = re.sub(r"[^a-zA-Z0-9_\- ]", "", raw_username.strip())[:32].strip()
    if not sanitized:
        raise HTTPException(
            status_code=400, detail="username is empty after sanitization"
        )

    hashes = payload.get("hashes")
    if not isinstance(hashes, list):
        raise HTTPException(status_code=400, detail="hashes must be a list")
    if len(hashes) > MAX_CLAIM_HASHES:
        raise HTTPException(
            status_code=413,
            detail=f"Too many hashes. Max {MAX_CLAIM_HASHES} per request.",
        )

    clean_hashes = [
        h for h in hashes if isinstance(h, str) and h.isalnum() and 8 <= len(h) <= 64
    ]
    if not clean_hashes:
        return {"claimed": 0, "already_claimed": 0, "unknown": 0}

    return claim_runs(sanitized, clean_hashes)


@router.get("/list", tags=["Runs"])
@limiter.limit("120/minute")
def list_runs(
    request: Request,
    response: Response,
    character: str | None = None,
    win: str | None = None,
    username: str | None = None,
    winrate_min: float | None = Query(None, ge=0, le=100),
    winrate_max: float | None = Query(None, ge=0, le=100),
    seed: str | None = None,
    sort: str | None = None,
    build_id: str | None = None,
    players: str | None = None,
    game_mode: str | None = None,
    ascension: int | None = None,
    ascension_min: int | None = None,
    ascension_max: int | None = None,
    build_ids: str | None = None,
    card: str | None = None,
    relic: str | None = None,
    today: bool = False,
    page: int = 1,
    limit: int = 50,
):
    """List submitted runs with optional filters, sorting, and pagination.

    `winrate_min` / `winrate_max` filter runs by their submitter's overall
    win rate percentage; only users with at least 5 submitted runs qualify,
    and anonymous runs never match.
    """
    # Browser/edge caching: new runs arrive constantly, but 30s of staleness
    # on a browse page is invisible and lets Cloudflare absorb repeat hits.
    response.headers["Cache-Control"] = "public, max-age=30"
    # Redis layer (60s TTL): the default landing view and any repeated or
    # shared search serve from cache; the long tail of unique filter combos
    # falls through to Mongo, which the bounded counts + indexes keep fast.
    cache_key = "runs_list:" + ":".join(
        str(v if v is not None else "")
        for v in (
            character,
            win,
            username,
            winrate_min,
            winrate_max,
            seed,
            sort,
            build_id,
            build_ids,
            players,
            game_mode,
            ascension,
            ascension_min,
            ascension_max,
            card,
            relic,
            int(today),
            page,
            limit,
        )
    )
    cached = app_cache.get_json(cache_key)
    if cached is not None:
        return cached
    if os.environ.get("MONGO_URL", "").strip():
        from ..services.runs_db_mongo import list_runs as _list_runs_mongo

        result = _list_runs_mongo(
            character=character,
            win=win,
            username=username,
            winrate_min=winrate_min,
            winrate_max=winrate_max,
            seed=seed,
            sort=sort,
            build_id=build_id,
            build_ids=build_ids,
            players=players,
            game_mode=game_mode,
            ascension=ascension,
            ascension_min=ascension_min,
            ascension_max=ascension_max,
            card=card,
            relic=relic,
            today=today,
            page=page,
            limit=limit,
        )
        app_cache.set_json(cache_key, result, ttl_seconds=60)
        return result

    from ..services.runs_db import get_conn

    with get_conn() as conn:
        conditions = []
        params: list = []
        if character:
            conditions.append("character = ?")
            params.append(character.upper())
        if win == "true":
            conditions.append("win = 1")
        elif win == "false":
            conditions.append("win = 0 AND was_abandoned = 0")
        if username:
            conditions.append("username LIKE ?")
            params.append(f"%{username}%")
        if seed:
            conditions.append("seed LIKE ?")
            params.append(f"%{seed}%")
        if build_id:
            conditions.append("build_id = ?")
            params.append(build_id)
        if players == "single":
            conditions.append("player_count = 1")
        elif players == "multi":
            conditions.append("player_count > 1")
        if game_mode:
            conditions.append("game_mode = ?")
            params.append(game_mode)
        if winrate_min is not None or winrate_max is not None:
            # Mirror the Mongo path: submitter winrate within range, with a
            # 5-run floor so one-run wonders don't flood winrate:100.
            conditions.append(
                "username IN (SELECT username FROM runs WHERE username != '' "
                "GROUP BY username HAVING COUNT(*) >= 5 "
                "AND 100.0 * SUM(win) / COUNT(*) BETWEEN ? AND ?)"
            )
            params.append(winrate_min if winrate_min is not None else 0.0)
            params.append(winrate_max if winrate_max is not None else 100.0)
        if today:
            # "Today's daily" = today's daily seed (prefixed DD_MM_YYYY), not
            # submitted_at (upload time). Mirrors _today_daily_seed_match in the
            # Mongo path.
            from datetime import datetime, timezone

            conditions.append("seed LIKE ?")
            params.append(datetime.now(timezone.utc).strftime("%d_%m_%Y") + "%")
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        # Sort options
        order_clauses = {
            "time_asc": "run_time ASC",
            "time_desc": "run_time DESC",
            "ascension_desc": "ascension DESC, run_time ASC",
            "date": "submitted_at DESC",
        }
        order_by = order_clauses.get(sort, "submitted_at DESC")

        total = conn.execute(
            f"SELECT COUNT(*) as c FROM runs {where}", params
        ).fetchone()["c"]

        per_page = min(limit, 100)
        offset = (max(page, 1) - 1) * per_page
        query_params = list(params) + [per_page, offset]
        rows = conn.execute(
            f"""
            SELECT run_hash, character, win, was_abandoned, ascension, game_mode,
                   run_time, floors_reached, deck_size, relic_count, killed_by,
                   username, submitted_at, build_id
            FROM runs {where}
            ORDER BY {order_by} LIMIT ? OFFSET ?
        """,
            query_params,
        ).fetchall()

        return {
            "runs": [dict(r) for r in rows],
            "total": total,
            "page": max(page, 1),
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page,
        }


@router.get("/leaderboard", tags=["Runs"])
@limiter.limit("120/minute")
def get_leaderboard(
    request: Request,
    response: Response,
    category: str = "fastest",
    character: str | None = None,
    players: str | None = None,
    game_mode: str | None = None,
    today: bool = False,
    page: int = 1,
    limit: int = 50,
    ascension_min: int | None = None,
):
    """Leaderboard for winning runs.

    Categories: `fastest`, `highest_ascension`.
    `ascension_min`: only runs at this ascension or higher (e.g. 10 for the
    A10 fastest-wins board); without it the board spans every ascension, so a
    low-ascension speedrun can outrank an A10 win.
    `players`: `single` (player_count == 1) or `multi` (player_count > 1).
    `game_mode`: `standard`, `daily`, or `custom`. Custom runs ride on
    custom seeds so their times aren't comparable to the standard
    ladder; the frontend defaults to `standard` and exposes mode
    explicitly so users can opt into the other pools.
    Single-player and multiplayer runs aren't directly comparable, so the
    frontend reads them as disjoint pools.
    """
    # Edge/browser caching: 30s of ladder staleness is invisible and lets
    # Cloudflare absorb repeat hits now that the frontend stopped cache-busting.
    response.headers["Cache-Control"] = "public, max-age=30"
    # Redis layer (60s TTL, matching the refresher cycle): one cluster-wide
    # copy per filter combination instead of per-worker recomputation. Misses
    # fall straight through to the existing data paths.
    cache_key = app_cache.leaderboard_key(
        category=category,
        character=character,
        players=players,
        game_mode=game_mode,
        today=today,
        page=page,
        limit=limit,
        ascension_min=ascension_min,
    )
    cached = app_cache.get_json(cache_key)
    if cached is not None:
        return cached
    if os.environ.get("MONGO_URL", "").strip():
        from ..services.runs_db_mongo import leaderboard as _lb_mongo

        result = _lb_mongo(
            category=category,
            character=character,
            players=players,
            game_mode=game_mode,
            today=today,
            page=page,
            limit=limit,
            ascension_min=ascension_min,
        )
        app_cache.set_json(cache_key, result, ttl_seconds=60)
        return result

    from ..services.runs_db import get_conn

    with get_conn() as conn:
        conditions = ["win = 1"]
        params: list = []
        if character:
            conditions.append("character = ?")
            params.append(character.upper())
        # SQLite fallback stores player_count from the post-Mongo era; pre-existing
        # rows default to 1 via runs_db.py's schema, so the single filter is safe
        # even on legacy data.
        if players == "single":
            conditions.append("player_count = 1")
        elif players == "multi":
            conditions.append("player_count > 1")
        if game_mode:
            conditions.append("game_mode = ?")
            params.append(game_mode)
        if ascension_min is not None:
            conditions.append("ascension >= ?")
            params.append(ascension_min)
        where = "WHERE " + " AND ".join(conditions)

        if category == "highest_ascension":
            order_by = "ascension DESC, run_time ASC"
        else:
            # Default: fastest
            order_by = "run_time ASC"

        total = conn.execute(
            f"SELECT COUNT(*) as c FROM runs {where}", params
        ).fetchone()["c"]

        per_page = min(limit, 100)
        offset = (max(page, 1) - 1) * per_page
        query_params = list(params) + [per_page, offset]
        rows = conn.execute(
            f"""
            SELECT run_hash, character, win, ascension, run_time, floors_reached,
                   deck_size, relic_count, username, submitted_at, killed_by
            FROM runs {where}
            ORDER BY {order_by} LIMIT ? OFFSET ?
        """,
            query_params,
        ).fetchall()

        result = {
            "runs": [dict(r) for r in rows],
            "total": total,
            "page": max(page, 1),
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page,
            "category": category,
        }
        app_cache.set_json(cache_key, result, ttl_seconds=60)
        return result


@router.get("/leaderboard/seed-rank", tags=["Runs"])
@limiter.limit("120/minute")
def get_seed_rank(request: Request, seed: str, steam_id: str | None = None):
    """Seed + global standing for the in-game mod (F9 panel, post-run card).

    Pool = completed runs sharing the seed; ranking = winning runs by run_time,
    cross-character. `seed_rank`/`global_rank`/`percentile` are null when the
    caller has no winning run in that pool (the mod hides those lines).
    """
    seed = (seed or "").strip()
    if not seed or len(seed) > 64:
        raise HTTPException(status_code=400, detail="seed required")
    clean_steam = None
    if steam_id:
        digits = "".join(ch for ch in steam_id if ch.isdigit())
        clean_steam = digits or None

    if os.environ.get("MONGO_URL", "").strip():
        from ..services.runs_db_mongo import seed_rank_for

        return seed_rank_for(clean_steam, seed)

    # SQLite fallback: enough shape for the mod to degrade cleanly.
    return {
        "seed": seed,
        "seed_total": 0,
        "seed_wins": 0,
        "seed_rank": None,
        "global_rank": None,
        "global_total": 0,
        "percentile": None,
    }


@router.get("/leaderboard/rank/{run_hash}", tags=["Runs"])
@limiter.limit("120/minute")
def get_run_rank(request: Request, run_hash: str, category: str = "fastest"):
    """Rank of a single winning run within its character's leaderboard.

    Ordering matches `/leaderboard`:
    - `fastest`: `run_time ASC` — rank = (wins by char with run_time < this) + 1
    - `highest_ascension`: `ascension DESC, run_time ASC` — rank = (wins by char
      with higher ascension, or same ascension and faster) + 1

    Returns `{"rank": None}` for losses, missing hashes, or abandoned runs so
    the caller can render "DNF" / "—" uniformly.
    """
    if os.environ.get("MONGO_URL", "").strip():
        from ..services.runs_db_mongo import get_run_rank as _rank_mongo

        return _rank_mongo(run_hash=run_hash, category=category)

    from ..services.runs_db import get_conn

    with get_conn() as conn:
        row = conn.execute(
            "SELECT win, character, run_time, ascension FROM runs WHERE run_hash = ?",
            [run_hash],
        ).fetchone()
        if not row or not row["win"]:
            return {"rank": None}

        if category == "highest_ascension":
            ahead = conn.execute(
                """
                SELECT COUNT(*) AS c FROM runs
                WHERE win = 1 AND character = ?
                  AND (ascension > ? OR (ascension = ? AND run_time < ?))
            """,
                [
                    row["character"],
                    row["ascension"],
                    row["ascension"],
                    row["run_time"],
                ],
            ).fetchone()["c"]
        else:
            ahead = conn.execute(
                """
                SELECT COUNT(*) AS c FROM runs
                WHERE win = 1 AND character = ?
                  AND run_time < ?
            """,
                [row["character"], row["run_time"]],
            ).fetchone()["c"]
        return {"rank": ahead + 1, "category": category}


@router.get("/encounter-stats", tags=["Runs"])
@limiter.limit("60/minute")
def get_encounter_stats_endpoint(
    request: Request,
    act: str | None = None,
    room_type: str | None = None,
    multiplayer: str | None = None,
    page: int = 1,
    limit: int = 50,
):
    """Per-encounter combat stats over submitted runs.

    Served from the precomputed run-entity-stats snapshot (built in the
    same all-runs walk as the entity / community / charts stats), so this
    is an O(rows) slice rather than a per-request walk over every run's
    `map_point_history`. Counts official runs only — Ascension 11+ and
    non-official-character (modded) runs are excluded at snapshot build
    time, matching the rest of the stats.

    Query params:
      * `act` — comma-separated list of acts to include (e.g. `1,2`).
        Omit for all.
      * `room_type` — comma-separated list of room types
        (`monster,elite,boss`). Omit for all.
      * `multiplayer` — `only` returns multiplayer-only runs,
        `exclude` removes multiplayer runs, omit for both.
      * `page` (default 1) + `limit` (default 50, max 200) — pagination
        applied after grouping, sorted by sample size descending.

    Each row contains the encounter's total appearances, fatal count,
    avg damage taken, avg turns, plus a `characters` array with the
    same fields scoped per character. Returns `{encounters, page,
    limit, total, has_next}`. Mongo-only (returns empty when MONGO_URL
    is unset for local dev).
    """
    if not os.environ.get("MONGO_URL", "").strip():
        return {
            "encounters": [],
            "page": page,
            "limit": limit,
            "total": 0,
            "has_next": False,
        }

    from ..services.run_entity_stats import (
        get_encounter_stats as _get_encounter_stats,
    )

    acts = [int(a) for a in act.split(",") if a.strip().isdigit()] if act else None
    room_types = (
        [r.strip().lower() for r in room_type.split(",") if r.strip()]
        if room_type
        else None
    )
    return _get_encounter_stats(
        acts=acts,
        room_types=room_types,
        multiplayer=multiplayer,
        page=page,
        limit=limit,
    )


@router.get("/versions", tags=["Runs"])
def get_run_versions(request: Request):
    """Return distinct build_id values from submitted runs."""
    if os.environ.get("MONGO_URL", "").strip():
        from ..services.runs_db_mongo import distinct_build_ids

        return {"versions": distinct_build_ids()}

    from ..services.runs_db import get_conn

    with get_conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT build_id FROM runs WHERE build_id IS NOT NULL AND build_id != '' ORDER BY build_id DESC"
        ).fetchall()
        return {"versions": [r["build_id"] for r in rows]}


@router.get("/shared/{run_hash}", tags=["Runs"])
# Per-IP cap. Legitimate share-link traffic is one request per run; this
# only bites scrapers enumerating hashes — which was sustaining ~8 req/s
# against this single endpoint and pegging the worker at 100% CPU.
@limiter.limit("60/minute")
def get_shared_run(run_hash: str, request: Request):
    """Retrieve a shared run by its hash, merged with DB-side username.

    The on-disk run JSON is the immutable client-submitted blob — it does
    not contain the submitter's username, since users may attach a name
    AFTER submitting via /api/runs/claim. The username lives in the
    SQLite runs row. Without merging, /shared dropped usernames entirely
    even though /api/runs/list happily reported them.
    """
    using_mongo = bool(os.environ.get("MONGO_URL", "").strip())

    # Redis layer (15min TTL): runs are immutable so this is safe to serve
    # straight from cache; the short TTL absorbs share-link bursts without
    # every viewed run squatting in memory forever. 404s are never cached.
    redis_key = f"run:{run_hash}"
    redis_cached = app_cache.get_json(redis_key)
    if redis_cached is not None:
        return redis_cached

    def _attach_username(blob: dict) -> dict:
        # Flag beta-build runs so the client merges the beta catalog when it
        # resolves deck/relic/potion entities that only exist in the beta data
        # tree. build_id like "v0.107.0" with a matching data-beta dir = beta.
        from ..services.data_service import BETA_DATA_DIR

        bid = (blob.get("build_id") or "").strip()
        blob["is_beta"] = bool(bid) and (BETA_DATA_DIR / bid).exists()
        if using_mongo:
            from ..services.runs_db_mongo import get_username_for_hash

            name = get_username_for_hash(run_hash)
            if name:
                blob["username"] = name
            return blob

        from ..services.runs_db import get_conn

        with get_conn() as conn:
            row = conn.execute(
                "SELECT username FROM runs WHERE run_hash = ?", (run_hash,)
            ).fetchone()
            if row and row["username"]:
                blob["username"] = row["username"]
        return blob

    cached = _load_run_blob(run_hash)
    if cached is not None:
        result = _attach_username(json.loads(cached))
        app_cache.set_json(redis_key, result, ttl_seconds=15 * 60)
        return result

    # Fallback for multiplayer: find sibling player runs by seed.
    if using_mongo:
        from ..services.runs_db_mongo import find_sibling_hashes

        siblings = find_sibling_hashes(run_hash)
        if not siblings:
            # Differentiate "no such run" vs "no sibling has a file" — if
            # the hash is unknown to the DB entirely, that's a 404.
            from ..services.runs_db_mongo import _get_collection

            row = _get_collection().find_one({"_id": run_hash}, {"_id": 1})
            if not row:
                raise HTTPException(status_code=404, detail="Run not found")
    else:
        from ..services.runs_db import get_conn

        with get_conn() as conn:
            row = conn.execute(
                "SELECT seed, character FROM runs WHERE run_hash = ?", (run_hash,)
            ).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Run not found")
            siblings = [
                r["run_hash"]
                for r in conn.execute(
                    "SELECT run_hash FROM runs WHERE seed = ? AND run_hash != ?",
                    (row["seed"], run_hash),
                ).fetchall()
            ]

    for sib_hash in siblings:
        sib_file = _data_dir / "runs" / f"{sib_hash}.json"
        if sib_file.exists():
            import shutil

            run_file = _data_dir / "runs" / f"{run_hash}.json"
            shutil.copy2(sib_file, run_file)
            _load_run_blob.cache_clear()
            with open(run_file, "r", encoding="utf-8") as f:
                result = _attach_username(json.load(f))
            app_cache.set_json(redis_key, result, ttl_seconds=15 * 60)
            return result

    raise HTTPException(status_code=404, detail="Run data not available")


# Per-entity run stats — drives the "Stats" tab on each detail page.
# Aggregates which runs picked a specific relic / card / potion, the
# win rate when picked, the per-character distribution, and the most
# recent submission. Cache is precomputed in process memory; first
# request after TTL expiry blocks for the rebuild (a few seconds).
_ENTITY_STATS_TYPES = {"relics", "cards", "potions"}


@router.get("/stats/{entity_type}/{entity_id}", tags=["Runs"])
@limiter.limit("120/minute")
def get_entity_run_stats(request: Request, entity_type: str, entity_id: str):
    if entity_type not in _ENTITY_STATS_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"entity_type must be one of {sorted(_ENTITY_STATS_TYPES)}",
        )
    stats = get_entity_stats(entity_type, entity_id)
    if stats is None:
        # Entity hasn't appeared in any submitted run yet — return a
        # zero-filled stub so the UI can render "No runs yet" gracefully
        # without a separate not-found branch.
        return {
            "entity_type": entity_type,
            "entity_id": entity_id.upper(),
            "picks": 0,
            "wins": 0,
            "win_rate": 0.0,
            "pick_rate": 0.0,
            "total_runs": 0,
            "baseline_win_rate": 0.0,
            "score": None,
            "by_character": [],
            "last_submitted_at": None,
            "last_run_hash": None,
        }
    return stats


@router.get("/scores/{entity_type}", tags=["Runs"])
@limiter.limit("60/minute")
def get_entity_scores(
    request: Request,
    entity_type: str,
    character: str | None = None,
    act: int | None = Query(
        None,
        ge=1,
        le=3,
        description=(
            "Relics only: restrict to pickups made during this act "
            "(3 includes later acts). Scores are graded against a per-act "
            "baseline so survivorship into later acts doesn't inflate them."
        ),
    ),
):
    """All Codex Scores for one entity type, keyed by ID.

    Each entry carries the 0-100 Codex Score plus picks/wins/win_rate, and
    for cards the Codex Elo (null for entities without one). Cards that are
    never a reward pick (curses, statuses, events, tokens, starters) are
    excluded. With `act` set (relics only), stats cover only pickups made
    during that act, graded against that act's baseline. Used by list pages
    to render the score column / sort by tier without N round-trips to
    /stats/{type}/{id}. Cached at the same TTL as the per-entity stats since
    both derive from the same walk.

    `character` (e.g. NECROBINDER) switches each entry to that character's
    slice when its sample is big enough, falling back to global otherwise;
    entries then carry `scope: "character" | "global"`. Used by the in-game
    mod for deck-context scoring. Without it the shape is unchanged.
    """
    if entity_type not in _ENTITY_STATS_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"entity_type must be one of {sorted(_ENTITY_STATS_TYPES)}",
        )
    if act is not None and entity_type != "relics":
        raise HTTPException(
            status_code=400, detail="act filtering is only available for relics"
        )
    char = character.strip().upper() if character else None
    # Redis layer (5min TTL): hit constantly by tier-list pages and detail
    # sort columns. Key carries every response-shaping param.
    cache_key = app_cache.entity_scores_key(entity_type, act=act, character=char)
    cached = app_cache.get_json(cache_key)
    if cached is not None:
        return cached
    result = get_all_entity_scores(entity_type, character=char, act=act)
    # While the snapshot is rebuilding (post-deploy), the result is an empty
    # shell; caching it would extend the gap past the rebuild for everyone.
    if snapshot_loaded():
        app_cache.set_json(cache_key, result, ttl_seconds=5 * 60)
    return result


@router.get("/snapshot-status", tags=["Runs"])
@limiter.limit("120/minute")
def runs_snapshot_status(request: Request, response: Response):
    """Whether the stats snapshot is loaded, rebuilding after a deploy, or
    serving a previous version while the current one builds. Lets the UI
    show "stats are rebuilding" instead of rendering empty charts as if the
    data were gone."""
    response.headers["Cache-Control"] = "no-store"
    return snapshot_status()


@router.get("/community-stats", tags=["Runs"])
@limiter.limit("60/minute")
def community_stats(request: Request, response: Response):
    """Community / fun stats for the /community-stats page: per-event player
    decision breakdowns, deadliest encounters/events, headline totals by
    ascension and character, and a few records and quirks. Official game
    content only (modded entities are filtered out). Built in the same walk
    as the Codex Score cache, so this is an in-memory read."""
    # An empty shell during a post-deploy rebuild must not stick in the
    # edge cache for 5 minutes on top of the rebuild itself.
    response.headers["Cache-Control"] = (
        "public, max-age=300" if snapshot_loaded() else "no-store"
    )
    return get_community_fun_stats()


@router.get("/me/picks", tags=["Runs"])
@limiter.limit("60/minute")
def my_picks(request: Request, response: Response):
    """The signed-in player's own pick rates across decision surfaces (card
    rewards + ancient 3-relic offers for now). Scoped to the JWT's verified
    steam_id; never accepts an arbitrary steam_id param (self-only)."""
    auth_header = request.headers.get("authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="auth required")
    from ..services.auth_jwt import decode_token
    from ..services.runs_db_mongo import get_user_picks

    claims = decode_token(auth_header[7:].strip())
    steam_id = str((claims or {}).get("steam_id") or "")
    if not steam_id.isdigit():
        raise HTTPException(status_code=401, detail="invalid token")

    response.headers["Cache-Control"] = "private, max-age=60"
    return get_user_picks(steam_id)


@router.get("/metrics/{entity_type}", tags=["Runs"])
@limiter.limit("60/minute")
def get_entity_metrics(
    request: Request, response: Response, entity_type: str, cohort: str = "all"
):
    """Dense metrics table for one entity type, powers /leaderboards/metrics.

    Each row carries the win-outcome metrics (Codex Score, Win%) AND the
    revealed-preference metrics (Codex Elo, Pick%, per-act pick splits) plus
    raw counts. Served from the same pre-built snapshot as /scores, so it's
    one in-memory pass with no per-request aggregation; the client sorts
    and filters the whole table locally. Cards carry Elo/Pick%; relics and
    potions only the win-outcome columns (rewards don't offer them this way).

    `cohort` slices to a pre-built run cohort: `all` (default), `solo`,
    `2p`, `3p`, `4p`, `a10` (ascension 10), `daily`, `custom`. Every cohort
    is materialized in the same snapshot, so this stays a single cached read.
    """
    if entity_type not in _ENTITY_STATS_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"entity_type must be one of {sorted(_ENTITY_STATS_TYPES)}",
        )
    # Snapshot refreshes at most every 10 min; let edges/clients cache it.
    # Except while a post-deploy rebuild runs: an empty table cached at the
    # edge would outlive the rebuild.
    response.headers["Cache-Control"] = (
        "public, max-age=300, stale-while-revalidate=600"
        if snapshot_loaded()
        else "no-store"
    )
    return get_entity_metrics_table(entity_type, cohort)


@router.get("/top/{entity_type}/{character}", tags=["Runs"])
@limiter.limit("120/minute")
def get_top_for_character(
    request: Request, entity_type: str, character: str, limit: int = 5
):
    """Most-picked entities of a type for one character, ranked by picks.

    Powers the "Top 5 picked" sections on character pages. Returns a
    list of {entity_id, picks, wins, win_rate, score}; empty while the
    snapshot is cold or the character has no runs yet.
    """
    if entity_type not in _ENTITY_STATS_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"entity_type must be one of {sorted(_ENTITY_STATS_TYPES)}",
        )
    limit = max(1, min(limit, 20))
    return get_top_entities_for_character(entity_type, character, limit)


# Stats reads come from the materialized `stats_summary` collection,
# populated by a background refresher (start_stats_refresher) that
# runs in exactly one worker via a Mongo-based lease. The endpoint
# does a single find_one() — sub-millisecond reads, no aggregation on
# the user path.
#
# Filtered combos NOT in the hot list (rare ascension/seed/username
# filters) fall through to the live get_stats() — slow but functional.
# In-process LRU caches those for the duration of the worker so
# repeated rare queries still benefit.
_STATS_FALLBACK_TTL_SECONDS = 300
_stats_fallback_cache: dict[tuple, tuple[float, dict]] = {}

_REFRESHER_INTERVAL_SECONDS = 60


def start_stats_refresher() -> None:
    """Spawn the daemon thread that keeps the materialized stats
    collection fresh.

    Uses a Mongo-based lease so only ONE worker across the pool
    actually runs the heavy aggregation cycle. Others spin idle
    every refresh interval and the lease auto-rotates if the holder
    dies.
    """
    import threading

    def _loop() -> None:
        # Lazy import — runs_db_mongo only exists when MONGO_URL is set.
        # If we're on the SQLite path this thread is harmless (the
        # imports below raise; we catch and back off).
        while True:
            try:
                from ..services.runs_db_mongo import try_acquire_refresh_lease

                if try_acquire_refresh_lease():
                    # The lease lasts 90s but the snapshot walk inside this
                    # cycle can take 10+ minutes. Without renewal mid-cycle,
                    # leadership rotates while the holder is still walking and
                    # every worker ends up rebuilding concurrently (the
                    # June 11 forty-minute stampede). Heartbeat keeps the
                    # lease ours for as long as the cycle actually runs.
                    hb_stop = threading.Event()

                    def _heartbeat() -> None:
                        while not hb_stop.wait(30):
                            try:
                                try_acquire_refresh_lease()
                            except Exception:
                                pass

                    hb = threading.Thread(
                        target=_heartbeat, daemon=True, name="lease-heartbeat"
                    )
                    hb.start()
                    try:
                        _run_refresh_cycle()
                    finally:
                        hb_stop.set()
            except Exception:
                # Expected on the SQLite path (no Mongo to refresh); a real
                # Mongo deployment failing here must be visible, not silent.
                if os.environ.get("MONGO_URL", "").strip():
                    logger.warning("stats refresher cycle failed", exc_info=True)
            time.sleep(_REFRESHER_INTERVAL_SECONDS)

    def _run_refresh_cycle() -> None:
        from ..services.runs_db_mongo import (
            refresh_leaderboard_summary,
            refresh_stats_summary,
        )
        from ..services.run_entity_stats import refresh_entity_stats_snapshot

        try:
            refresh_stats_summary()
        except Exception:
            logger.warning("stats summary refresh failed", exc_info=True)
        # Pre-compute the default (category, character) ladder
        # views into leaderboard_summary. Reads for the common
        # combos become O(1) find_one instead of a 500ms
        # count+sort. Cheap (~600ms total) and idempotent.
        try:
            refresh_leaderboard_summary()
        except Exception:
            logger.warning("leaderboard summary refresh failed", exc_info=True)
        # Rebuild the shared entity-stats snapshot (tier-list
        # / Codex Score source) on the same leader-only loop.
        # Internally throttled, so this is a no-op find_one
        # most cycles and only walks the run files every
        # ~10 min on one worker.
        try:
            refresh_entity_stats_snapshot()
        except Exception:
            logger.warning("entity-stats snapshot refresh failed", exc_info=True)
        # Proactive warm of the entity-scores cache (in-memory
        # reads, cheap every cycle) so tier pages serve straight
        # from Redis cluster-wide instead of recomputing per
        # worker. Includes the per-act relic views.
        try:
            # Never warm Redis from an unloaded cache: that would push
            # empty score maps cluster-wide with the warm TTL.
            if app_cache.enabled() and snapshot_loaded():
                for etype in ("cards", "relics", "potions"):
                    app_cache.set_json(
                        app_cache.entity_scores_key(etype),
                        get_all_entity_scores(etype),
                        ttl_seconds=app_cache.WARM_TTL_SECONDS,
                    )
                for warm_act in (1, 2, 3):
                    app_cache.set_json(
                        app_cache.entity_scores_key("relics", act=warm_act),
                        get_all_entity_scores("relics", act=warm_act),
                        ttl_seconds=app_cache.WARM_TTL_SECONDS,
                    )
        except Exception:
            logger.warning("entity-scores cache warm failed", exc_info=True)
        # Warm the /charts page: precompute the default no-filter view of each
        # chart so the page and chart switches serve from Redis instead of
        # aggregating live on the first hit. One worker, shared cache, cheap.
        try:
            if app_cache.enabled():
                from .charts import prewarm_charts

                prewarm_charts()
        except Exception:
            logger.warning("charts prewarm failed", exc_info=True)

    threading.Thread(target=_loop, daemon=True, name="stats-refresher").start()


@router.get("/stats", tags=["Runs"])
@limiter.limit("120/minute")
def get_community_stats(
    request: Request,
    character: str | None = None,
    win: str | None = None,
    ascension: str | None = None,
    game_mode: str | None = None,
    players: str | None = None,
    username: str | None = None,
):
    """Get aggregated run stats. Community-wide by default; pass
    `username` to narrow to a single uploader.

    Read path:
      0. Redis (60s TTL, cluster-wide).
      1. Try the materialized stats_summary collection (sub-ms).
      2. If the filter combo isn't in the hot list / hasn't been
         materialized yet, fall through to a process-local TTL cache.
      3. On cache miss, run the live aggregation (slow, ~5-10s).
    """
    # 0. Redis layer: one cluster-wide copy per filter combo, refreshed on
    # the same cadence as the refresher cycle. Misses fall through to the
    # existing chain unchanged.
    redis_key = app_cache.stats_key(
        character=character,
        win=win,
        ascension=ascension,
        game_mode=game_mode,
        players=players,
        username=username,
    )
    redis_cached = app_cache.get_json(redis_key)
    if redis_cached is not None:
        return redis_cached

    # 1. Materialized view path
    try:
        from ..services.runs_db_mongo import read_stats_summary

        materialized = read_stats_summary(
            character=character,
            win=win,
            ascension=ascension,
            game_mode=game_mode,
            players=players,
            username=username,
        )
        if materialized is not None:
            app_cache.set_json(redis_key, materialized, ttl_seconds=60)
            return materialized
    except Exception:
        # Not on the Mongo path (SQLite fallback) — keep going.
        pass

    # 2. Process-local TTL cache for rare filter combos
    cache_key = (character, win, ascension, game_mode, players, username)
    now = time.monotonic()
    hit = _stats_fallback_cache.get(cache_key)
    if hit and now - hit[0] < _STATS_FALLBACK_TTL_SECONDS:
        return hit[1]
    for k in [
        k
        for k, (t, _) in _stats_fallback_cache.items()
        if now - t >= _STATS_FALLBACK_TTL_SECONDS
    ]:
        del _stats_fallback_cache[k]

    # 3. Slow path: live aggregation
    result = get_stats(
        character=character,
        win=win,
        ascension=ascension,
        game_mode=game_mode,
        players=players,
        username=username,
    )
    _stats_fallback_cache[cache_key] = (now, result)
    app_cache.set_json(redis_key, result, ttl_seconds=60)

    # Lazy write-through to stats_summary so subsequent requests for this
    # combo -- on any worker -- serve from the materialized view instead
    # of paying the 5-10s aggregation again. Hot combos still get
    # overwritten by the periodic refresher; non-hot combos persist until
    # something else replaces them.
    try:
        from ..services.runs_db_mongo import write_stats_summary

        write_stats_summary(
            result,
            character=character,
            win=win,
            ascension=ascension,
            game_mode=game_mode,
            players=players,
            username=username,
        )
    except Exception:
        pass

    return result
