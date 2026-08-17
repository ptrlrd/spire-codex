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
    capped to the most recent _ACTIVITY_WEEKS buckets."""
    from datetime import date

    buckets: dict[str, dict] = {}
    for r in rows:
        ts = r.get("submitted_at")
        if ts is None:
            continue
        try:
            d = date.fromisoformat(str(ts)[:10])
        except ValueError:
            continue
        week = d.fromordinal(d.toordinal() - d.weekday()).isoformat()
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
_STALE_REDIS_TTL = 24 * 3600
_LOCK_TTL = 15 * 60

_inflight: set[str] = set()
_inflight_lock = threading.Lock()


def _filters_bracket(
    ascension: int | None, version: str | None, players: int | None
) -> str | None:
    """The materialized community bracket matching the active filters, or
    None when nothing maps (character is not a bracket axis, and only A10
    has a skill bracket). Composes player:skill:version in the same order
    as the site's ?bracket= values, so the profile's community comparison
    numbers match /leaderboards/stats for the same slice."""
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
    if local is not None:
        return local
    payload = app_cache.get_json(_payload_key(cache_key))
    if payload is not None and app_cache.get_json(_fresh_key(cache_key)) is not None:
        _cache_put(cache_key, payload)
        return payload
    _kick_refresh(cache_key, user_id, username, character, ascension, version, players)
    if payload is not None:
        return payload
    return {"building": True}


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
        if cache_key in _inflight:
            return
        _inflight.add(cache_key)
    lock_key = f"user_insights:lock:{cache_key}"
    if not app_cache.acquire_lock(lock_key, _LOCK_TTL):
        with _inflight_lock:
            _inflight.discard(cache_key)
        return

    def _run() -> None:
        from fastapi.encoders import jsonable_encoder

        try:
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
            app_cache.set_json(_fresh_key(cache_key), 1, int(_CACHE_TTL))
            _cache_put(cache_key, payload)
        except Exception:
            logger.warning("user-insights refresh failed", exc_info=True)
        finally:
            app_cache.delete(lock_key)
            with _inflight_lock:
                _inflight.discard(cache_key)

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

    from .runs_db_mongo import get_run_blobs, get_user_run_rows

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
    filtered = bool(
        character or ascension is not None or version or players is not None
    )
    acc = community_stats._new_acc_one()
    walked = 0
    for i in range(0, len(rows), 300):
        batch = rows[i : i + 300]
        blobs = get_run_blobs([r["run_hash"] for r in batch])
        for r in batch:
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
    mine["streaks"] = _streaks(rows)
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
    mine["runs_capped"] = len(rows) >= _MAX_RUNS
    return mine
