"""Personal community-stats for the profile page.

Walks one player's own submitted runs through the SAME accumulator the
/community-stats page uses (community_stats._accumulate_one), so the profile
gets the identical kit — deaths, campfire choices, event decisions, boon take
rates, records — computed over just their runs, with the community's numbers
attached to every section for comparison. The official-content filters
(modded rest options, modded event options, catalog-only entities) come along
for free from the shared finalize.

Self-only and request-time: a player has orders of magnitude fewer runs than
the community walk (capped anyway), so this stays an on-demand read with a
short per-user cache instead of riding the snapshot."""

import logging
import threading
import time
from typing import Any

from . import community_stats
from .run_entity_stats import get_community_stats, get_entity_metrics_table

logger = logging.getLogger(__name__)

# Newest runs walked per player. High enough that only extreme grinders hit
# it; bounded so one profile view can't stream unbounded blobs.
_MAX_RUNS = 2000
# A pick-rate comparison on 3 offers is noise; require a real sample.
_MIN_CARD_OFFERS = 10
_MIN_BOON_OFFERS = 5
_MIN_EVENT_VISITS = 5
_TOP_DELTAS = 8
# Event divergence gets more rows than the other delta lists: it's the
# section players learn the most from, so it earns the space.
_TOP_EVENT_DELTAS = 12
# Carry-rate comparisons need the relic to actually show up (or the player
# to have enough runs for its absence to mean something).
_MIN_RELIC_RUNS_WITH = 3
_MIN_RUNS_FOR_UNDER = 10
# Relic rarities excluded from the carry comparison: starters are forced
# (their carry rate is the character share, not a preference) and ancient
# boons already have the take-rate section with real offer denominators.
_RELIC_RARITIES_SKIPPED = frozenset({"starter", "ancient"})

_CACHE_TTL = 120.0
_walk_gate = threading.BoundedSemaphore(1)
_CACHE_MAX = 500
_cache: dict[str, tuple[float, dict]] = {}
_cache_lock = threading.Lock()


def _cache_get(steam_id: str) -> dict | None:
    with _cache_lock:
        hit = _cache.get(steam_id)
        if hit and time.time() - hit[0] < _CACHE_TTL:
            return hit[1]
        if hit:
            del _cache[steam_id]
    return None


def _cache_put(steam_id: str, payload: dict) -> None:
    with _cache_lock:
        if len(_cache) >= _CACHE_MAX:
            oldest = min(_cache, key=lambda k: _cache[k][0])
            del _cache[oldest]
        _cache[steam_id] = (time.time(), payload)


def _pct_map(rows: list[dict] | None, key: str = "pct") -> dict[str, float]:
    return {
        r["id"]: r.get(key)
        for r in rows or []
        if isinstance(r, dict) and r.get("id") is not None and r.get(key) is not None
    }


def _attach_community(mine: dict[str, Any], community: dict[str, Any]) -> None:
    """Stamp community_* comparison fields onto the personal blob, in place."""
    # Campfires: same nine official options; add the community share, plus
    # the community's below-half-HP split for the "arriving hurt" bar.
    comm_rest = _pct_map(community.get("rest_sites"))
    comm_rest_low = _pct_map(community.get("rest_sites"), key="pct_low_hp")
    for r in mine.get("rest_sites") or []:
        r["community_pct"] = comm_rest.get(r["id"])
        r["community_pct_low_hp"] = comm_rest_low.get(r["id"])

    # Map danger: community death rate per (act, node type), so "where you
    # die" renders your rate against everyone's on the same cells.
    comm_danger: dict[tuple, dict] = {}
    for act_row in community.get("map_danger") or []:
        for ptype, cell in (act_row.get("types") or {}).items():
            comm_danger[(act_row.get("act"), ptype)] = cell
    for act_row in mine.get("map_danger") or []:
        for ptype, cell in (act_row.get("types") or {}).items():
            comm = comm_danger.get((act_row.get("act"), ptype))
            cell["community_death_rate"] = (comm or {}).get("death_rate")

    # Characters: the community's win rate and run share per character, so
    # the merged overview renders "your Silent vs everyone's Silent".
    comm_chars = {
        r["id"]: r
        for r in community.get("by_character") or []
        if isinstance(r, dict) and r.get("id")
    }
    for r in mine.get("by_character") or []:
        comm = comm_chars.get(r.get("id"))
        r["community_win_rate"] = (comm or {}).get("win_rate")
        r["community_share"] = (comm or {}).get("share")

    # Deaths: how often the same encounter/event kills everyone else.
    deaths = community.get("deaths") or {}
    for key in ("encounters", "events"):
        comm = _pct_map(deaths.get(key))
        for r in (mine.get("deaths") or {}).get(key) or []:
            r["community_pct"] = comm.get(r["id"])

    # Boons: community take rate when offered.
    comm_boons = {
        r["id"]: r
        for r in community.get("ancient_picks") or []
        if isinstance(r, dict) and r.get("id")
    }
    for r in mine.get("ancient_picks") or []:
        comm = comm_boons.get(r["id"])
        r["community_take_rate"] = (comm or {}).get("take_rate")

    # Events: per-option community split for the events the player hit.
    comm_events = {
        e["id"]: _pct_map(e.get("options"))
        for e in community.get("events") or []
        if isinstance(e, dict) and e.get("id")
    }
    for e in mine.get("events") or []:
        opts = comm_events.get(e["id"]) or {}
        for o in e.get("options") or []:
            o["community_pct"] = opts.get(o["id"])


def _event_divergence(mine: dict[str, Any]) -> list[dict]:
    """Events where the player's favorite option differs most from the crowd,
    ranked by the percentage-point gap. Only events with a real sample."""
    out = []
    for e in mine.get("events") or []:
        if (e.get("total") or 0) < _MIN_EVENT_VISITS:
            continue
        best = None
        for o in e.get("options") or []:
            cp = o.get("community_pct")
            if cp is None or o.get("pct") is None:
                continue
            gap = o["pct"] - cp
            if best is None or abs(gap) > abs(best["gap"]):
                best = {
                    "event_id": e["id"],
                    "event_name": e.get("name"),
                    "option_id": o["id"],
                    "option_label": o.get("label"),
                    "your_pct": o["pct"],
                    "community_pct": cp,
                    "gap": round(gap, 1),
                    "visits": e["total"],
                }
        if best and abs(best["gap"]) >= 10:
            out.append(best)
    out.sort(key=lambda r: -abs(r["gap"]))
    return out[:_TOP_EVENT_DELTAS]


def _card_pick_deltas(
    user_id: str,
    character: str | None = None,
    ascension: int | None = None,
    version: str | None = None,
    players: int | None = None,
    bracket: str | None = None,
) -> dict[str, list[dict]]:
    """The player's card-reward keep rates vs the community's, split into the
    cards they take notably more / less often. Community side comes from the
    in-memory metrics snapshot, so only cards that pass its catalog and
    non-draftable filters can appear."""
    from .runs_db_mongo import get_user_card_pick_tallies

    picks = (
        get_user_card_pick_tallies(
            user_id,
            character=character,
            ascension=ascension,
            version=version,
            players=players,
        )
        or {}
    )
    table = get_entity_metrics_table("cards", bracket or "all")
    comm = {
        r["id"]: r["pick_rate"]
        for r in table.get("rows") or []
        if not r.get("upgraded") and r.get("pick_rate") is not None
    }
    deltas = []
    for cid, rec in picks.items():
        offered = rec.get("offered") or 0
        if offered < _MIN_CARD_OFFERS:
            continue
        community_rate = comm.get((cid or "").upper())
        if community_rate is None:
            continue
        your_rate = round(rec.get("picked", 0) / offered * 100, 1)
        deltas.append(
            {
                "id": (cid or "").upper(),
                "your_pick_rate": your_rate,
                "community_pick_rate": community_rate,
                "gap": round(your_rate - community_rate, 1),
                "offered": offered,
                "picked": rec.get("picked", 0),
            }
        )
    deltas.sort(key=lambda r: -r["gap"])
    return {
        "over_picked": [d for d in deltas if d["gap"] > 0][:_TOP_DELTAS],
        "under_picked": [d for d in deltas[::-1] if d["gap"] < 0][:_TOP_DELTAS],
    }


def _streaks(rows: list[dict]) -> dict[str, int]:
    """Best and current win streaks over the (newest-first) row list."""
    current = 0
    for r in rows:
        if r.get("win"):
            current += 1
        else:
            break
    best = run = 0
    for r in reversed(rows):
        run = run + 1 if r.get("win") else 0
        best = max(best, run)
    return {"current_win_streak": current, "best_win_streak": best}


# The activity chart shows this many most-recent weeks at most; beyond that
# the bars get too thin to read.
_ACTIVITY_WEEKS = 26


def _run_mode(r: dict) -> str:
    """solo / coop / daily / custom, matching the leaderboard mode split."""
    gm = (r.get("game_mode") or "standard").lower()
    if gm == "daily":
        return "daily"
    if gm == "custom":
        return "custom"
    return "coop" if (r.get("player_count") or 1) > 1 else "solo"


def _activity(rows: list[dict]) -> list[dict]:
    """Weekly run-count buckets split by mode, with the week's win rate,
    oldest first. Weeks with no runs are absent (the chart skips them);
    capped to the most recent _ACTIVITY_WEEKS buckets. Bucketed on when the
    run was PLAYED, in Pacific time (site policy: never upload date, never
    UTC calendar boundaries)."""
    from datetime import date

    from .timeutil import pacific_date

    buckets: dict[str, dict] = {}
    for r in rows:
        d = pacific_date(r.get("played_at") or r.get("submitted_at"))
        if d is None:
            continue
        week = date.fromordinal(d.toordinal() - d.weekday()).isoformat()
        b = buckets.setdefault(
            week,
            {
                "week": week,
                "runs": 0,
                "wins": 0,
                "solo": 0,
                "coop": 0,
                "daily": 0,
                "custom": 0,
            },
        )
        b["runs"] += 1
        b[_run_mode(r)] += 1
        if r.get("win"):
            b["wins"] += 1
    out = [buckets[k] for k in sorted(buckets)]
    for b in out:
        b["win_rate"] = round(b["wins"] / b["runs"] * 100, 1) if b["runs"] else 0.0
    return out[-_ACTIVITY_WEEKS:]


def _percentiles(username: str | None) -> dict[str, Any] | None:
    """Where the player sits among every qualifying submitter (the same 5-run
    floor the skill brackets use): win-rate and volume percentiles. None when
    the account has no username or too few runs to qualify."""
    if not username:
        return None
    from .runs_db_mongo import get_user_winrates

    winrates = get_user_winrates() or {}
    me = winrates.get(username.lower())
    if not me or (me[0] or 0) < 5:
        return None
    qualified = [(t, w) for t, w in winrates.values() if t >= 5]
    if len(qualified) < 2:
        return None
    my_rate = me[1] / me[0]
    below_rate = sum(1 for t, w in qualified if w / t < my_rate)
    below_runs = sum(1 for t, _ in qualified if t < me[0])
    n = len(qualified)
    return {
        "win_rate": round(my_rate * 100, 1),
        "win_rate_percentile": round(below_rate / n * 100),
        "runs": me[0],
        "runs_percentile": round(below_runs / n * 100),
        "players": n,
    }


def _skipped_relic_ids() -> frozenset[str]:
    """Relic ids whose carry rate isn't a preference signal (see
    _RELIC_RARITIES_SKIPPED). Empty on catalog read failure: fail open."""
    try:
        from .data_service import load_relics

        out = set()
        for r in load_relics():
            rarity = (r.get("rarity_key") or r.get("rarity") or "").lower()
            if (
                r.get("id")
                and rarity.split()[:1]
                and rarity.split()[0] in _RELIC_RARITIES_SKIPPED
            ):
                out.add(r["id"].upper())
        return frozenset(out)
    except Exception:
        logger.warning("relic rarity catalog read failed", exc_info=True)
        return frozenset()


def _relic_carry_deltas(
    user_id: str,
    character: str | None,
    user_total_runs: int,
    ascension: int | None = None,
    version: str | None = None,
    players: int | None = None,
    bracket: str | None = None,
) -> dict[str, list[dict]]:
    """Relics the player ends runs with notably more / less often than the
    community. Relics have no offered/picked stream like cards, so the
    comparison is carry rate: the share of runs containing the relic, yours
    vs the community's (character-scoped on both sides when filtered)."""
    if user_total_runs < _MIN_RUNS_FOR_UNDER:
        return {"over_carried": [], "under_carried": []}
    from .runs_db_mongo import get_user_relic_run_counts

    mine = (
        get_user_relic_run_counts(
            user_id,
            character=character,
            ascension=ascension,
            version=version,
            players=players,
        )
        or {}
    )
    table = get_entity_metrics_table("relics", bracket or "all", character)
    comm_total = (
        table.get("character_runs") if character else table.get("total_runs")
    ) or 0
    if not comm_total:
        return {"over_carried": [], "under_carried": []}
    skipped = _skipped_relic_ids()
    deltas = []
    for row in table.get("rows") or []:
        rid = (row.get("id") or "").upper()
        if not rid or rid in skipped:
            continue
        community_rate = round((row.get("picks") or 0) / comm_total * 100, 1)
        runs_with = mine.get(rid, 0)
        your_rate = round(runs_with / user_total_runs * 100, 1)
        if runs_with < _MIN_RELIC_RUNS_WITH and your_rate >= community_rate:
            continue
        deltas.append(
            {
                "id": rid,
                "your_rate": your_rate,
                "community_rate": community_rate,
                "gap": round(your_rate - community_rate, 1),
                "runs_with": runs_with,
                "runs": user_total_runs,
            }
        )
    deltas.sort(key=lambda r: -r["gap"])
    return {
        "over_carried": [d for d in deltas if d["gap"] > 0][:_TOP_DELTAS],
        "under_carried": [
            d for d in deltas[::-1] if d["gap"] < 0 and d["community_rate"] >= 2
        ][:_TOP_DELTAS],
    }


def _bare_character(raw: str | None) -> str:
    """`CHARACTER.DEFECT` / `defect` -> `DEFECT`."""
    return (raw or "").rsplit(".", 1)[-1].upper()


# The walk below (blob fetch + full community-stats accumulate per run) takes
# minutes for large accounts — far past the 60s gateway timeout (Yitsy's first
# load 504'd on 2026-08-12) — so it never runs on the request path. Results
# live in Redis so all workers share them; a fresh marker with the old 120s
# TTL decides when to re-walk, and stale copies keep serving instantly while
# the refresh runs behind them.
# 7 days, not 24h: the payload is stale-while-revalidate, so serving an old
# profile instantly beats an empty one in every case -- 24h TTLs let a
# two-day incident window (2026-08-25/26) empty every profile on the site
# into the building placeholder at once.
_STALE_REDIS_TTL = 7 * 24 * 3600
_LOCK_TTL = 15 * 60

# cache_key -> walk start time. Entries EXPIRE after _LOCK_TTL: a wedged or
# very slow walk thread must not permanently silence a key's refreshes on
# this worker (an entry that never cleared did exactly that on 2026-08-27).
_inflight: dict[str, float] = {}
_inflight_lock = threading.Lock()


def _filters_bracket(
    ascension: int | None, version: str | None, players: int | None
) -> str | None:
    """The materialized community bracket matching the active filters, or
    None when nothing maps (character is not a bracket axis, and only A10
    has a skill bracket). Composes player:skill:version in the same order
    as the site's ?bracket= values, so the profile's community comparison
    numbers match the /stats pages for the same slice."""
    player = {1: "solo", 2: "2p", 3: "3p", 4: "4p"}.get(players or 0, "")
    skill = "a10" if ascension == 10 else ""
    parts = [p for p in (player, skill) if p]
    if version:
        parts.append(version)
    return ":".join(parts) or None


def _apply_row_filters(
    rows: list[dict],
    character: str | None,
    ascension: int | None,
    version: str | None,
    players: int | None,
) -> list[dict]:
    """Narrow the run rows to the requested filter axes. Each axis is exact:
    ascension level, build_id version, player count (1=solo .. 4)."""
    if character:
        rows = [r for r in rows if _bare_character(r.get("character")) == character]
    if ascension is not None:
        rows = [r for r in rows if int(r.get("ascension") or 0) == ascension]
    if version:
        rows = [r for r in rows if (r.get("build_id") or "") == version]
    if players is not None:
        rows = [r for r in rows if int(r.get("player_count") or 1) == players]
    return rows


def _filters_suffix(
    character: str | None,
    ascension: int | None,
    version: str | None,
    players: int | None,
) -> str:
    """Cache-key suffix for the filter axes. The unfiltered and
    character-only forms predate ascension/version/players and MUST keep
    their exact historical keys, or a deploy cold-starts every cached
    profile into the "building" state at once."""
    key = f":{character or ''}"
    if ascension is not None or version or players is not None:
        asc = "" if ascension is None else ascension
        ppl = "" if players is None else players
        key += f":a{asc}:v{version or ''}:p{ppl}"
    return key


def _payload_key(cache_key: str) -> str:
    return f"user_insights:{cache_key}"


def _fresh_key(cache_key: str) -> str:
    return f"user_insights:fresh:{cache_key}"


def _insights_coll():
    """Durable store for computed insight payloads: database first, Redis
    in front. Redis expiry or eviction can never empty a profile again --
    only a user who has never been computed shows the building state."""
    from .runs_db_mongo import _get_collection

    return _get_collection().database["user_insights"]


def _is_hollow(payload: dict | None) -> bool:
    """A payload claiming runs but walking none means the blob fetch failed
    underneath the walk — an artifact of database pressure, not a real
    profile. Such payloads must never be stored, cached, or served: treat
    them as absent everywhere so the next view rebuilds instead. (A user
    with zero claimed runs walking zero is a REAL empty profile.)"""
    return bool(
        payload and payload.get("claimed_runs") and not payload.get("runs_walked")
    )


def _store_payload(cache_key: str, payload: dict) -> None:
    if _is_hollow(payload):
        logger.warning("refusing to durably store a hollow profile: %s", cache_key)
        return
    if payload.get("partial"):
        logger.warning("not durably storing a partial profile: %s", cache_key)
        return
    try:
        from datetime import datetime, timezone

        _insights_coll().replace_one(
            {"_id": cache_key},
            {
                "_id": cache_key,
                "payload": payload,
                "updated_at": datetime.now(timezone.utc),
            },
            upsert=True,
        )
    except Exception:
        logger.warning("insights durable store write failed", exc_info=True)


def _load_stored_payload(cache_key: str) -> dict | None:
    try:
        doc = _insights_coll().find_one({"_id": cache_key})
        return doc.get("payload") if doc else None
    except Exception:
        logger.warning("insights durable store read failed", exc_info=True)
        return None


def get_user_insights(
    user_id: str,
    username: str | None = None,
    character: str | None = None,
    ascension: int | None = None,
    version: str | None = None,
    players: int | None = None,
) -> dict[str, Any]:
    """Cached view over _compute_insights. Serves instantly in all cases:
    a fresh result directly, a stale result while a background refresh runs,
    or {"building": true} when there is nothing cached yet — clients poll
    until the walk lands."""
    from . import cache as app_cache

    character = (character or "").strip().upper() or None
    version = (version or "").strip() or None
    cache_key = f"{user_id}{_filters_suffix(character, ascension, version, players)}"
    local = _cache_get(cache_key)
    if local is not None and not _is_hollow(local):
        return local
    payload = app_cache.get_json(_payload_key(cache_key))
    if _is_hollow(payload):
        payload = None
    if payload is not None and app_cache.get_json(_fresh_key(cache_key)) is not None:
        _cache_put(cache_key, payload)
        return payload
    if payload is None:
        # Redis miss: the database is the store of record. Serve the stored
        # copy immediately and let the background refresh recompute it.
        payload = _load_stored_payload(cache_key)
        if _is_hollow(payload):
            payload = None
        if payload is not None:
            app_cache.set_json(_payload_key(cache_key), payload, _STALE_REDIS_TTL)
    _kick_refresh(cache_key, user_id, username, character, ascension, version, players)
    if payload is not None:
        return payload
    building: dict[str, Any] = {"building": True}
    try:
        from .runs_db_mongo import count_user_runs

        building["claimed_runs"] = count_user_runs(user_id)
    except Exception:
        pass
    return building


def _prewarm_slices() -> list[tuple]:
    """The filter slices with durable standing: the unfiltered profile plus
    the dropdown picks the prewarmer builds (each character, A10, Solo)."""
    slices: list[tuple] = [(None, None, None, None)]
    slices += [(c, None, None, None) for c in _PREWARM_CHARACTERS]
    slices += [(None, 10, None, None), (None, None, None, 1)]
    return slices


def invalidate_user_insights(user_id: str) -> None:
    """Mark an account's insight slices stale after it gains runs (submit
    or claim). The stored payload keeps serving instantly; the next profile
    view sees the missing fresh marker and kicks a background re-walk, so
    the profile looks current right after your own upload without paying a
    walk per submission. Only the prewarmed slices need clearing — ad-hoc
    slices' fresh markers expire on their own short TTL."""
    from . import cache as app_cache

    for c, a, v, p in _prewarm_slices():
        key = f"{user_id}{_filters_suffix(c, a, v, p)}"
        try:
            app_cache.delete(_fresh_key(key))
        except Exception:
            return


# Accounts that gained runs recently, per worker: uid -> (last activity,
# username). A bulk upload notes activity per submit; the sweeper rebuilds
# once the burst goes quiet instead of once per run. Cross-worker dedup is
# _kick_refresh's Redis lock.
_pending_lock = threading.Lock()
_pending: dict[str, tuple[float, str | None]] = {}
_pending_checked: set[str] = set()
_sweeper_started = False
_PENDING_IDLE_SECONDS = 45.0
_SWEEP_INTERVAL_SECONDS = 20.0


def _due_pending(
    pending: dict[str, tuple[float, str | None]],
    now: float,
    idle: float = _PENDING_IDLE_SECONDS,
) -> list[str]:
    return [uid for uid, (ts, _) in pending.items() if now - ts >= idle]


def note_profile_activity(user_id: str, username: str | None = None) -> None:
    """Called when an account gains runs (submit, claim, sign-in backfill).
    An account with no profile yet starts building immediately, so a new
    player's page exists while their backlog is still uploading; the burst
    then gets one final rebuild after it goes quiet."""
    global _sweeper_started
    with _pending_lock:
        first_sight = user_id not in _pending_checked
        _pending_checked.add(user_id)
        _pending[user_id] = (time.time(), username)
        if not _sweeper_started:
            _sweeper_started = True
            threading.Thread(
                target=_sweep_pending, daemon=True, name="insights-sweeper"
            ).start()
    if not first_sight:
        return
    from . import cache as app_cache

    cache_key = f"{user_id}:"
    has_payload = (
        _cache_get(cache_key) is not None
        or app_cache.get_json(_payload_key(cache_key)) is not None
        or _load_stored_payload(cache_key) is not None
    )
    if not has_payload:
        _kick_refresh(cache_key, user_id, username, None, None, None, None)


def _sweep_pending() -> None:
    while True:
        time.sleep(_SWEEP_INTERVAL_SECONDS)
        try:
            now = time.time()
            with _pending_lock:
                due = _due_pending(_pending, now)
                items = [(uid, _pending.pop(uid)[1]) for uid in due]
                _pending_checked.difference_update(due)
            for uid, username in items:
                _kick_refresh(f"{uid}:", uid, username, None, None, None, None)
        except Exception:
            logger.warning("insights sweeper pass failed", exc_info=True)


def prewarm_user_insights(user_id: str, username: str | None = None) -> None:
    """Fill a cold cache before the user ever opens their profile (called from
    /me, which fires on every page load). Kicks the background walk only when
    NO payload exists at all — any cached copy, however stale, already serves
    instantly and the view path handles refreshing it, so prewarming again
    would just burn walks on every page view. Costs one local dict hit plus
    at most one Redis GET per call."""
    from . import cache as app_cache

    cache_key = f"{user_id}:"
    if _cache_get(cache_key) is not None:
        return
    if app_cache.get_json(_payload_key(cache_key)) is not None:
        return
    stored = _load_stored_payload(cache_key)
    if stored is not None:
        # Re-warm Redis (not marked fresh) so the next /me hits Redis
        # instead of repeating this Mongo read on every page load.
        app_cache.set_json(_payload_key(cache_key), stored, _STALE_REDIS_TTL)
        return
    _kick_refresh(cache_key, user_id, username, None, None, None, None)


def _kick_refresh(
    cache_key: str,
    user_id: str,
    username: str | None,
    character: str | None,
    ascension: int | None,
    version: str | None,
    players: int | None,
) -> None:
    """Start one background walk per cache key: an in-process set stops
    duplicate threads in this worker, a Redis lock stops the other workers
    (fail-open, so with Redis down each worker walks once — same as the old
    synchronous behavior)."""
    from . import cache as app_cache

    with _inflight_lock:
        started = _inflight.get(cache_key)
        if started is not None and time.time() - started < _LOCK_TTL:
            return
        _inflight[cache_key] = time.time()
    lock_key = f"user_insights:lock:{cache_key}"
    if not app_cache.acquire_lock(lock_key, _LOCK_TTL):
        with _inflight_lock:
            _inflight.pop(cache_key, None)
        return

    def _run() -> None:
        # One walk at a time per worker: each holds every blob for the
        # account in memory, and unbounded stacking swapped the box on
        # 2026-08-20.
        with _walk_gate:
            _run_locked()

    def _run_locked() -> None:
        from fastapi.encoders import jsonable_encoder

        # Logged BEFORE the work: a walk that hangs or crawls under box
        # pressure must be visible in the logs, not indistinguishable from
        # no walk having started at all.
        logger.info(
            "user-insights walk starting uid=%s slice=%s",
            user_id,
            _filters_suffix(character, ascension, version, players),
        )
        try:
            unfiltered = (
                character is None
                and ascension is None
                and not version
                and players is None
            )
            if unfiltered:
                # The blob fetch is the walk's whole cost, so the unfiltered
                # walk also pre-builds the popular filter slices from the
                # same pass — their dropdowns then serve instantly.
                for suffix, slice_payload in _compute_insights_all_slices(
                    user_id, username
                ).items():
                    enc = jsonable_encoder(slice_payload)
                    key = f"{user_id}{suffix}"
                    app_cache.set_json(_payload_key(key), enc, _STALE_REDIS_TTL)
                    # Partial payloads (blob fetch under pressure) serve now
                    # but go stale fast so the walk retries toward complete.
                    fresh_ttl = 60 if enc.get("partial") else int(_CACHE_TTL)
                    app_cache.set_json(_fresh_key(key), 1, fresh_ttl)
                    _cache_put(key, enc)
                    _store_payload(key, enc)
                return
            payload = jsonable_encoder(
                _compute_insights(
                    user_id,
                    username=username,
                    character=character,
                    ascension=ascension,
                    version=version,
                    players=players,
                )
            )
            app_cache.set_json(_payload_key(cache_key), payload, _STALE_REDIS_TTL)
            fresh_ttl = 60 if payload.get("partial") else int(_CACHE_TTL)
            app_cache.set_json(_fresh_key(cache_key), 1, fresh_ttl)
            _cache_put(cache_key, payload)
            # Durable standing is reserved for the prewarmed slices; an
            # ad-hoc tuple (arbitrary version/ascension spellings on the
            # public endpoint) lives in Redis only, so unauthenticated
            # requests can't mint permanent user_insights documents.
            if (character, ascension, version, players) in set(_prewarm_slices()):
                _store_payload(cache_key, payload)
        except Exception:
            logger.warning("user-insights refresh failed", exc_info=True)
        finally:
            app_cache.delete(lock_key)
            with _inflight_lock:
                _inflight.pop(cache_key, None)

    threading.Thread(
        target=_run, daemon=True, name=f"insights-{cache_key[:24]}"
    ).start()


def _compute_insights(
    user_id: str,
    username: str | None = None,
    character: str | None = None,
    ascension: int | None = None,
    version: str | None = None,
    players: int | None = None,
) -> dict[str, Any]:
    """The signed-in account's personal community-stats blob plus community
    comparison fields, over its claimed runs. Shape mirrors /community-stats
    with extras: card_picks (over/under-picked vs the crowd) and
    event_divergence.

    `character` scopes the whole walk to that character's runs. The community
    comparison fields stay all-community (per-character community blobs
    aren't materialized) except card pick rates, which are inherently
    character-scoped: a card is only ever offered to its own character.
    Percentiles are omitted when filtered - the ranking map is overall-only,
    so showing it against a character slice would mislead."""
    character = (character or "").strip().upper() or None

    from .runs_db_mongo import get_user_run_rows

    t0 = time.time()
    rows = get_user_run_rows(user_id, limit=_MAX_RUNS)
    # Elo rates the account's whole A10 standard history — it ignores the
    # active filter axes so the profile shows one rating on every slice.
    try:
        from .player_elo import elo_block_from_rows

        elo_block = elo_block_from_rows(rows)
    except Exception:
        logger.warning("profile elo block failed", exc_info=True)
        elo_block = None
    rows = _apply_row_filters(rows, character, ascension, version, players)
    t1 = time.time()
    blobs = _fetch_blobs(rows)
    cov_ok = _require_blob_coverage(rows, blobs)
    t2 = time.time()
    acc = community_stats._new_acc_one()
    walked = _accumulate_rows(rows, blobs, acc)
    payload = _assemble_payload(
        user_id,
        username,
        rows,
        acc,
        walked,
        elo_block,
        character,
        ascension,
        version,
        players,
    )
    if not cov_ok:
        payload["partial"] = True
    logger.info(
        "user-insights walk uid=%s slice=%s rows=%d fetch_ms=%d walk_ms=%d total_ms=%d",
        user_id,
        _filters_suffix(character, ascension, version, players),
        len(rows),
        int((t2 - t1) * 1000),
        int((time.time() - t2) * 1000),
        int((time.time() - t0) * 1000),
    )
    return payload


_PREWARM_CHARACTERS = ("IRONCLAD", "SILENT", "DEFECT", "NECROBINDER", "REGENT")


def _require_blob_coverage(rows: list[dict], blobs: dict[str, dict]) -> bool:
    """True when the fetch covered enough of the account to store durably.
    Zero coverage on a nonempty account raises (Mongo was unavailable);
    anything between builds a payload that serves flagged partial but is
    never durably stored, instead of the old hard refusal that left bulk
    uploads with missing blobs stuck on "building" forever."""
    if not rows:
        return True
    have = sum(1 for r in rows if r["run_hash"] in blobs)
    if not have:
        raise RuntimeError(f"insights blob fetch returned 0/{len(rows)} runs")
    if have < len(rows) * 0.9:
        logger.warning("insights blob fetch partial: %d/%d runs", have, len(rows))
        return False
    return True


def _fetch_blobs(rows: list[dict]) -> dict[str, dict]:
    """All blobs for `rows`, fetched in parallel 300-doc batches. The blob
    fetch dominates walk latency (map_point_history is ~90% of every blob),
    so the batches overlap instead of running back to back."""
    from concurrent.futures import ThreadPoolExecutor

    from .runs_db_mongo import get_run_blobs

    batches = [rows[i : i + 300] for i in range(0, len(rows), 300)]
    if not batches:
        return {}
    if len(batches) == 1:
        return get_run_blobs([r["run_hash"] for r in batches[0]])
    out: dict[str, dict] = {}
    # 2 workers, not 4: the 2026-08-20 load incident showed stacked walks x
    # wide fetches swapping the box; latency still roughly halves vs serial.
    with ThreadPoolExecutor(max_workers=min(2, len(batches))) as pool:
        for blobs in pool.map(
            lambda b: get_run_blobs([r["run_hash"] for r in b]), batches
        ):
            out.update(blobs)
    return out


def _accumulate_rows(rows: list[dict], blobs: dict[str, dict], acc: dict) -> int:
    walked = 0
    for r in rows:
        blob = blobs.get(r["run_hash"])
        if blob is None:
            continue
        try:
            community_stats._accumulate_one(
                acc,
                blob,
                run_hash=r["run_hash"],
                is_win=bool(r.get("win")),
                character=r.get("character") or "",
                ascension=r.get("ascension") or 0,
            )
            walked += 1
        except Exception:
            logger.warning(
                "user-insights accumulate failed for %s",
                r["run_hash"],
                exc_info=True,
            )
    return walked


def _compute_insights_all_slices(user_id: str, username: str | None) -> dict[str, dict]:
    """One blob pass, many payloads: the unfiltered profile plus the filter
    slices people actually click (each character, A10, Solo), keyed by their
    cache suffix. The blob fetch is nearly all of a walk's cost, so building
    these from the same pass makes those dropdowns serve instantly instead
    of each spawning its own minutes-long walk."""
    from .runs_db_mongo import get_user_run_rows

    t0 = time.time()
    rows = get_user_run_rows(user_id, limit=_MAX_RUNS)
    try:
        from .player_elo import elo_block_from_rows

        elo_block = elo_block_from_rows(rows)
    except Exception:
        logger.warning("profile elo block failed", exc_info=True)
        elo_block = None
    t1 = time.time()
    blobs = _fetch_blobs(rows)
    cov_ok = _require_blob_coverage(rows, blobs)
    t2 = time.time()

    slices: list[tuple[tuple, list[dict]]] = [((None, None, None, None), rows)]
    for c in _PREWARM_CHARACTERS:
        slices.append(
            ((c, None, None, None), _apply_row_filters(rows, c, None, None, None))
        )
    slices.append(
        ((None, 10, None, None), _apply_row_filters(rows, None, 10, None, None))
    )
    slices.append(
        ((None, None, None, 1), _apply_row_filters(rows, None, None, None, 1))
    )

    out: dict[str, dict] = {}
    t_walk = 0.0
    for f, srows in slices:
        c, a, v, pl = f
        tw = time.time()
        acc = community_stats._new_acc_one()
        walked = _accumulate_rows(srows, blobs, acc)
        t_walk += time.time() - tw
        try:
            out[_filters_suffix(c, a, v, pl)] = _assemble_payload(
                user_id, username, srows, acc, walked, elo_block, c, a, v, pl
            )
        except Exception:
            logger.warning("insights slice assemble failed for %s", f, exc_info=True)
    if not cov_ok:
        for p in out.values():
            p["partial"] = True
    logger.info(
        "user-insights prewarm uid=%s rows=%d slices=%d rows_ms=%d fetch_ms=%d walk_ms=%d total_ms=%d",
        user_id,
        len(rows),
        len(out),
        int((t1 - t0) * 1000),
        int((t2 - t1) * 1000),
        int(t_walk * 1000),
        int((time.time() - t0) * 1000),
    )
    return out


def _assemble_payload(
    user_id: str,
    username: str | None,
    rows: list[dict],
    acc: dict,
    walked: int,
    elo_block: dict | None,
    character: str | None,
    ascension: int | None,
    version: str | None,
    players: int | None,
) -> dict[str, Any]:
    """Build one slice's payload from its accumulated walk. Shared by the
    on-demand compute and the multi-slice prewarm, so a prewarmed slice is
    identical to an on-demand one."""
    filtered = bool(
        character or ascension is not None or version or players is not None
    )
    mine = community_stats._finalize_one(acc)
    bracket = _filters_bracket(ascension, version, players)
    community = get_community_stats(bracket)
    _attach_community(mine, community)
    mine["event_divergence"] = _event_divergence(mine)
    try:
        mine["card_picks"] = _card_pick_deltas(
            user_id, character, ascension, version, players, bracket
        )
    except Exception:
        logger.warning("user-insights card deltas failed", exc_info=True)
        mine["card_picks"] = {"over_picked": [], "under_picked": []}
    try:
        mine["relic_picks"] = _relic_carry_deltas(
            user_id,
            character,
            mine.get("total_runs") or 0,
            ascension,
            version,
            players,
            bracket,
        )
    except Exception:
        logger.warning("user-insights relic deltas failed", exc_info=True)
        mine["relic_picks"] = {"over_carried": [], "under_carried": []}
    # Streaks are order-sensitive: walk runs in PLAYED order (newest first),
    # not upload order — a backfilled old loss must not break today's streak.
    # str() sorts both datetime objects and ISO strings chronologically.
    mine["streaks"] = _streaks(
        sorted(
            rows,
            key=lambda r: str(r.get("played_at") or r.get("submitted_at") or ""),
            reverse=True,
        )
    )
    mine["elo"] = elo_block
    mine["activity"] = _activity(rows)
    if filtered:
        mine["percentiles"] = None
    else:
        try:
            mine["percentiles"] = _percentiles(username)
        except Exception:
            logger.warning("user-insights percentiles failed", exc_info=True)
            mine["percentiles"] = None
    mine["character"] = character
    mine["ascension"] = ascension
    mine["version"] = version
    mine["players"] = players
    mine["runs_walked"] = walked
    mine["claimed_runs"] = len(rows)
    mine["runs_capped"] = len(rows) >= _MAX_RUNS
    return mine
