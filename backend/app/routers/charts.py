"""Charts API: pre-aggregated run data for the /charts explorer page.

Every endpoint returns a small, ready-to-plot payload:
{ chart, params, series: [{id, label, points: [{x, y, n?}]}], total_runs }

Metadata charts aggregate the in-memory run frame per request (fast), support
splitting series by character / player count / outcome / ascension band, and
the results are cached. Blob charts (per-floor curves, encounter damage,
event outcomes, per-entity stats) read the snapshot accumulated during the
regular stats walk, or walk a single user's blobs on demand when `username`
is set.
"""

import logging
import os
import re
import time

from fastapi import APIRouter, HTTPException, Query, Request
from slowapi import Limiter
from ..dependencies import client_ip
from ..services import rate_limit_config

from ..services import cache as app_cache
from ..services import charts_stats as cs
from ..services.run_entity_stats import (
    _BRACKET_KEYS,
    get_charts_blob_stats,
    get_recent_stat_versions,
)

router = APIRouter(prefix="/api/charts", tags=["Charts"])
# client_ip, not slowapi's get_remote_address: behind Cloudflare -> nginx
# the latter reads the proxy address, so every visitor would share ONE
# bucket and these limits would trip fleet-wide (see dependencies.client_ip).
limiter = Limiter(key_func=client_ip, **rate_limit_config.storage_kwargs())
logger = logging.getLogger(__name__)

# On-demand entries. Chart data only changes when the snapshot does (one
# refresh cycle, ~2h), so a longer TTL just means the second-through-Nth
# viewers of a filtered slice hit Redis instead of re-aggregating; staleness
# stays bounded by the cycle either way.
_CACHE_TTL = 1800
# Entries the refresher pre-warms each cycle. They're overwritten with fresh
# data every cycle, so the TTL is only a safety net against a dead refresher;
# it must comfortably outlive one full cycle or the warm cache expires while
# the next walk is still running (which is exactly the first-visitor tax the
# prewarm exists to prevent).
_WARM_TTL = 8 * 60 * 60

_ALL_SPLITS = ["character", "players", "outcome", "ascension"]
# Win-rate charts can't split by outcome (a winners-only win rate is 100%).
_RATE_SPLITS = ["character", "players", "ascension"]

# Registry: which charts exist, how they're built, and which filters apply.
# kind "frame" charts support every filter and series splits; "blob" charts
# support players and username (ascension/mode splits would blow up the
# snapshot, so they're all-ascensions by design and the UI says so).
CHARTS: dict[str, dict] = {
    # ── Win rates (frame) ──
    "winrate-by-floor": {
        "label": "Win rate by floor reached",
        "group": "Win rates",
        "kind": "frame",
        "splits": _RATE_SPLITS,
        "axis": {"x": "Floor reached", "y": "Eventual win %"},
        "desc": "Of the runs that made it to floor X, how many went on to win the run.",
    },
    "winrate-over-time": {
        "label": "Win rate over time",
        "group": "Win rates",
        "kind": "frame",
        "splits": _RATE_SPLITS,
        "axis": {"x": "Week", "y": "Win %"},
        "desc": "Weekly community win rate from submitted runs.",
    },
    "winrate-by-stat": {
        "label": "Win rate vs run stat",
        "group": "Win rates",
        "kind": "frame",
        "needs": ["stat"],
        "splits": _RATE_SPLITS,
        "axis": {"x": "stat", "y": "Win %"},
        "desc": "Win rate of runs bucketed by a run stat (deck size, relics, length, ...).",
    },
    "winrate-by-ascension": {
        "label": "Win rate by ascension",
        "group": "Win rates",
        "kind": "frame",
        "splits": ["character", "players"],
        "axis": {"x": "Ascension", "y": "Win %"},
        "desc": "Win rate at each ascension level.",
    },
    "hardest-dailies": {
        "label": "Daily win rate by date",
        "group": "Win rates",
        "kind": "frame",
        "daily": True,
        "bars": True,
        "splits": [],
        "axis": {"x": "Daily", "y": "Win %"},
        "desc": "Win rate of each daily climb (the seed encodes the daily's date). Low bars were the brutal ones.",
    },
    # ── Survival (frame + blob) ──
    "deaths-by-floor": {
        "label": "Deaths by floor",
        "group": "Survival",
        "kind": "frame",
        "splits": ["character", "players", "ascension"],
        "axis": {"x": "Floor", "y": "% of losses"},
        "desc": "Where losses end. Abandoned runs are excluded.",
    },
    "acts-funnel": {
        "label": "How far runs get (funnel)",
        "group": "Survival",
        "kind": "frame",
        "bars": True,
        "splits": _RATE_SPLITS,
        "axis": {"x": "Stage", "y": "% of runs"},
        "desc": "Share of runs surviving each act boundary, ending in the win rate.",
    },
    "deaths-by-room": {
        "label": "Deaths by room type",
        "group": "Survival",
        "kind": "blob",
        "bars": True,
        "axis": {"x": "Room type", "y": "% of deaths"},
        "desc": "What kind of room runs die in. All ascensions and modes.",
    },
    # ── Run curves (blob) ──
    "hp-trajectory": {
        "label": "HP trajectory, wins vs losses",
        "group": "Run curves",
        "kind": "blob",
        "metric": "hp",
        "axis": {"x": "Floor", "y": "Avg % of max HP"},
        "desc": "Average health per floor for winning and losing runs. All ascensions and modes.",
    },
    "gold-curve": {
        "label": "Gold curve, wins vs losses",
        "group": "Run curves",
        "kind": "blob",
        "metric": "gold",
        "axis": {"x": "Floor", "y": "Avg gold held"},
        "desc": "Average gold held per floor for winning and losing runs. All ascensions and modes.",
    },
    "deck-growth": {
        "label": "Deck growth, wins vs losses",
        "group": "Run curves",
        "kind": "blob",
        "metric": "deck",
        "axis": {"x": "Floor", "y": "Avg cards added"},
        "desc": "Average number of final-deck cards acquired by each floor (removed cards aren't counted). All ascensions and modes.",
    },
    # ── Combat (blob) ──
    "hp-loss-by-floor": {
        "label": "% max HP lost per fight floor",
        "group": "Combat",
        "kind": "blob",
        "axis": {"x": "Floor", "y": "Avg % max HP lost"},
        "desc": "Average share of max HP lost in combat at each floor. All ascensions and modes.",
    },
    "encounter-damage": {
        "label": "Encounter damage ranking",
        "group": "Combat",
        "kind": "blob",
        "bars": True,
        "horizontal": True,
        "axis": {"x": "Encounter", "y": "Avg % max HP lost"},
        "desc": "Encounters ranked by the average share of max HP they take per fight. All ascensions and modes.",
    },
    "encounter-turns": {
        "label": "Slowest encounters (turns)",
        "group": "Combat",
        "kind": "blob",
        "bars": True,
        "horizontal": True,
        "axis": {"x": "Encounter", "y": "Avg turns per fight"},
        "desc": "Encounters ranked by how many turns the fight takes. All ascensions and modes.",
    },
    "encounter-histogram": {
        "label": "Encounter damage histogram",
        "group": "Combat",
        "kind": "blob",
        "bars": True,
        "needs": ["encounter"],
        "axis": {"x": "% of max HP lost", "y": "% of fights"},
        "desc": "Damage distribution for one encounter, in 5%-of-max-HP buckets. All ascensions and modes.",
    },
    # ── Strategy (blob) ──
    "elites-vs-winrate": {
        "label": "Elites fought vs win rate",
        "group": "Strategy",
        "kind": "blob",
        "axis": {"x": "Elite fights in the run", "y": "Win %"},
        "desc": "Do greedy elite routes pay off. All ascensions and modes.",
    },
    "smiths-vs-winrate": {
        "label": "Upgrades taken vs win rate",
        "group": "Strategy",
        "kind": "blob",
        "axis": {"x": "Smith choices in the run", "y": "Win %"},
        "desc": "Win rate by how many rest sites went to upgrading. All ascensions and modes.",
    },
    "event-outcomes": {
        "label": "Event choice outcomes",
        "group": "Strategy",
        "kind": "blob",
        "bars": True,
        "needs": ["event"],
        "axis": {"x": "Option", "y": "%"},
        "desc": "What players pick at one event, and the win rate of runs that picked each option. All ascensions and modes.",
    },
    # ── Cards and relics (blob) ──
    "entity-over-time": {
        "label": "Card / relic / potion over time",
        "group": "Cards and relics",
        "kind": "blob",
        "needs": ["etype", "entity"],
        "axis": {"x": "Week", "y": "%"},
        "desc": "Weekly share of runs holding it, win rate with it, and the overall win rate baseline. All ascensions and modes.",
    },
    "entity-copies": {
        "label": "Copies in deck vs win rate",
        "group": "Cards and relics",
        "kind": "blob",
        "bars": True,
        "needs": ["entity"],
        "etype_fixed": "cards",
        "axis": {"x": "Copies in final deck", "y": "Win %"},
        "desc": "Win rate by how many copies of one card the final deck held. All ascensions and modes.",
    },
    "enchant-winrate": {
        "label": "Win rate by enchantment",
        "group": "Cards and relics",
        "kind": "blob",
        "bars": True,
        "horizontal": True,
        "axis": {"x": "Enchantment", "y": "Win % of runs holding it"},
        "desc": "Win rate of runs whose final deck carried each enchantment. All ascensions and modes.",
    },
    # ── Volume / distributions (frame) ──
    "runs-over-time": {
        "label": "Runs submitted over time",
        "group": "Volume",
        "kind": "frame",
        "splits": _ALL_SPLITS,
        "axis": {"x": "Week", "y": "Runs"},
        "desc": "Weekly submission volume.",
    },
    "stat-histogram": {
        "label": "Run stat distribution",
        "group": "Distributions",
        "kind": "frame",
        "needs": ["stat"],
        "splits": _ALL_SPLITS,
        "axis": {"x": "stat", "y": "% of runs"},
        "desc": "How a run stat is distributed across the filtered runs.",
    },
    "stat-scatter": {
        "label": "Stat vs stat scatter",
        "group": "Distributions",
        "kind": "frame",
        "needs": ["x", "y"],
        "scatter": True,
        "splits": _ALL_SPLITS,
        "axis": {"x": "x stat", "y": "y stat"},
        "desc": "Sampled runs plotted stat-vs-stat.",
    },
}


@router.get("/meta")
@limiter.limit("120/minute")
def charts_meta(request: Request):
    """Everything the explorer UI needs to draw its controls, including the
    event list (events actually present in the data) for the outcome chart."""
    chars = cs._official_characters()
    return {
        "charts": [
            {
                "key": key,
                "label": c["label"],
                "group": c["group"],
                "kind": c["kind"],
                "needs": c.get("needs", []),
                "splits": c.get("splits", []),
                "scatter": c.get("scatter", False),
                "bars": c.get("bars", False),
                "horizontal": c.get("horizontal", False),
                "daily": c.get("daily", False),
                "etype_fixed": c.get("etype_fixed"),
                "axis": c["axis"],
                "desc": c["desc"],
            }
            for key, c in CHARTS.items()
        ],
        "stats": [{"key": k, "label": v["label"]} for k, v in cs.STATS.items()],
        "characters": [{"id": cid, "name": name} for cid, name in chars.items()],
        "events": cs.event_list(get_charts_blob_stats()),
    }


def _build_frame_chart(
    key: str,
    rows: list[tuple],
    stat: str | None,
    x: str | None,
    y: str | None,
    split: str,
):
    if key == "winrate-by-floor":
        return cs.winrate_by_floor(rows, split)
    if key == "winrate-over-time":
        return cs.winrate_over_time(rows, split)
    if key == "runs-over-time":
        return cs.runs_over_time(rows, split)
    if key == "deaths-by-floor":
        return cs.deaths_by_floor(rows, split)
    if key == "winrate-by-ascension":
        return cs.winrate_by_stat(rows, "ascension", split)
    if key == "winrate-by-stat":
        return cs.winrate_by_stat(rows, stat or "deck_size", split)
    if key == "stat-histogram":
        return cs.stat_histogram(rows, stat or "floors_reached", split)
    if key == "stat-scatter":
        return cs.stat_scatter(rows, x or "floors_reached", y or "deck_size", split)
    if key == "acts-funnel":
        return cs.acts_funnel(rows, split)
    if key == "hardest-dailies":
        return cs.hardest_dailies(rows)
    raise HTTPException(status_code=404, detail="Unknown chart")


def _build_blob_chart(
    key: str,
    stats: dict,
    spec: dict,
    players: int | None,
    encounter: str | None,
    event: str | None,
    etype: str | None,
    entity: str | None,
):
    if key in ("hp-trajectory", "gold-curve", "deck-growth"):
        return cs.run_trajectory(stats, players, spec["metric"])
    if key == "hp-loss-by-floor":
        return cs.hp_loss_by_floor(stats, players)
    if key == "encounter-damage":
        return cs.encounter_ranking(stats, players, "damage")
    if key == "encounter-turns":
        return cs.encounter_ranking(stats, players, "turns")
    if key == "encounter-histogram":
        if not encounter:
            raise HTTPException(status_code=400, detail="encounter required")
        return cs.encounter_histogram(stats, players, encounter.upper())
    if key == "deaths-by-room":
        return cs.deaths_by_room(stats, players)
    if key == "elites-vs-winrate":
        return cs.elites_vs_winrate(stats, players)
    if key == "smiths-vs-winrate":
        return cs.smiths_vs_winrate(stats, players)
    if key == "event-outcomes":
        if not event:
            raise HTTPException(status_code=400, detail="event required")
        return cs.event_outcomes(stats, event.upper())
    if key == "entity-over-time":
        if not entity:
            raise HTTPException(status_code=400, detail="entity required")
        et = etype if etype in ("cards", "relics", "potions") else "cards"
        return cs.entity_over_time(stats, et, entity.upper())
    if key == "entity-copies":
        if not entity:
            raise HTTPException(status_code=400, detail="entity required")
        return cs.entity_copies(stats, entity.upper())
    if key == "enchant-winrate":
        return cs.enchant_winrate(stats)
    raise HTTPException(status_code=404, detail="Unknown chart")


def _chart_cache_key(
    chart_key,
    players,
    ascension,
    game_mode,
    username,
    split,
    stat,
    x,
    y,
    encounter,
    event,
    etype,
    entity,
    bracket=None,
    build_id=None,
) -> str:
    """Redis key for one chart + filter combo. Shared by the live endpoint and
    the prewarmer so a warmed entry is a byte-for-byte hit on a real request."""
    return (
        f"charts:{chart_key}:{players or ''}:{ascension if ascension is not None else ''}:"
        f"{game_mode or ''}:{(username or '').lower()}:{split}:{stat or ''}:{x or ''}:{y or ''}:"
        f"{(encounter or '').lower()}:{(event or '').lower()}:{etype or ''}:{(entity or '').lower()}:"
        f"{bracket or ''}:{build_id or ''}"
    )


def _compute_chart(
    chart_key,
    spec,
    players,
    ascension,
    game_mode,
    username,
    split,
    stat,
    x,
    y,
    encounter,
    event,
    etype,
    entity,
    bracket=None,
    build_id=None,
) -> dict:
    """Build one chart payload (no caching). Raises HTTPException for invalid
    blob filters, same as the endpoint."""
    building = False
    if spec["kind"] == "frame":
        mode = "daily" if spec.get("daily") else game_mode
        frame = cs.get_frame()
        rows = cs.filter_rows(
            frame, players, ascension, mode, username, bracket, build_id
        )
        series = _build_frame_chart(chart_key, rows, stat, x, y, split)
        total = len(rows)
        # A cold worker's frame is still loading in the background; say so
        # instead of caching a bogus empty chart for the full TTL.
        if not frame and cs.frame_loading():
            building = True
    else:
        # Blob charts: snapshot rollup (sliced to the requested content bracket
        # and/or game version — the v20 blob keeps bracket x version buckets),
        # or a per-user walk when username set (username is the filter; the
        # bracket doesn't apply there).
        if ascension is not None or game_mode:
            raise HTTPException(
                status_code=400,
                detail="This chart covers all ascensions and modes; drop those filters.",
            )
        if username:
            stats = cs.build_user_blob_stats(username)
        else:
            blob = get_charts_blob_stats()
            if bracket and build_id:
                bkey = f"{bracket}:{build_id}"
            else:
                bkey = build_id or bracket or "all"
            if bkey == "all":
                stats = blob.get("all") or cs.empty_one()
            else:
                # A requested slice the snapshot hasn't materialized yet
                # serves the empty shape, never a silent all-runs fallback.
                stats = blob.get(bkey) or cs.empty_one()
        series = _build_blob_chart(
            chart_key, stats, spec, players, encounter, event, etype, entity
        )
        total = sum(n for _wk, n, _w in stats.get("week_totals") or [])
        # Blob stats land with the first snapshot rebuild after a deploy;
        # until then the cells are missing entirely, which is different from
        # a filter matching nothing. Surface that so the page can say so.
        if not username and not stats.get("week_totals"):
            building = True

    return {
        "chart": chart_key,
        "label": spec["label"],
        "axis": spec["axis"],
        "desc": spec["desc"],
        "params": {
            "players": players,
            "ascension": ascension,
            "game_mode": game_mode,
            "username": username,
            "split": split,
            "stat": stat,
            "x": x,
            "y": y,
            "encounter": encounter,
            "event": event,
            "etype": etype,
            "entity": entity,
        },
        "series": series,
        "total_runs": total,
        "building": building,
    }


def prewarm_charts(budget_s: float | None = None) -> int:
    """Precompute chart payloads into the shared cache so filter clicks on
    /charts serve from Redis instead of aggregating live.

    Greedy with a time budget: the slice list covers EVERY combination the
    UI can request — the unfiltered default, each bracket (plain and
    player:skill composites), each game version, and every bracket x version
    composite — ordered so the highest-traffic slices warm first and older
    versions' composites warm last. Warming stops when the budget runs out
    and logs how many slices didn't make it, so coverage is visible, not
    assumed. CHART_PREWARM_BUDGET_S tunes the budget (default 900s); the
    long tail that misses the cut computes on demand and _CACHE_TTL keeps
    its repeat views cheap.

    Charts that wait on a user-picked entity, encounter, or event are
    skipped — they have no default worth warming.

    Called from the stats refresher cycle right after each snapshot rebuild,
    so every cycle overwrites the warm set with fresh data. Returns how many
    payloads were warmed."""
    if budget_s is None:
        try:
            budget_s = float(os.environ.get("CHART_PREWARM_BUDGET_S", "") or 900)
        except ValueError:
            budget_s = 900.0
    # Block until the frame is actually loaded: warming every frame chart
    # from an empty frame would fill Redis with empty payloads for hours.
    # If it still isn't ready at the deadline, warm blob charts only.
    cs.get_frame(wait=True)
    frame_missing = cs.frame_loading()
    if frame_missing:
        logger.warning("chart prewarm: charts frame unavailable; skipping frame charts")
    plain_brackets = [b for b in _BRACKET_KEYS if ":" not in b]
    versions = get_recent_stat_versions()  # newest first
    slices: list[tuple[str | None, str | None]] = [(None, None)]
    slices += [(b, None) for b in plain_brackets]
    slices += [(None, v) for v in versions]
    slices += [(b, None) for b in _BRACKET_KEYS if ":" in b]
    # Full composite grid, newest versions first so a tight budget drops the
    # oldest (least-visited) slices.
    slices += [(b, v) for v in versions for b in _BRACKET_KEYS]

    eligible: list[tuple[str, dict]] = [
        (chart_key, spec)
        for chart_key, spec in CHARTS.items()
        if not any(n in ("entity", "encounter", "event") for n in spec.get("needs", []))
    ]
    warmed = 0
    started = time.monotonic()
    out_of_budget = False
    for si, (bracket, build_id) in enumerate(slices):
        if time.monotonic() - started > budget_s:
            skipped = (len(slices) - si) * len(eligible)
            logger.info(
                "chart prewarm: budget (%.0fs) exhausted at slice %d/%d; "
                "~%d payloads left on-demand",
                budget_s,
                si,
                len(slices),
                skipped,
            )
            out_of_budget = True
            break
        for chart_key, spec in eligible:
            if frame_missing and spec["kind"] == "frame":
                continue
            needs = spec.get("needs", [])
            stat = "deck_size" if "stat" in needs else None
            x = "floors_reached" if "x" in needs else None
            y = "deck_size" if "x" in needs else None
            split = "character"
            try:
                payload = _compute_chart(
                    chart_key,
                    spec,
                    None,
                    None,
                    None,
                    None,
                    split,
                    stat,
                    x,
                    y,
                    None,
                    None,
                    None,
                    None,
                    bracket=bracket,
                    build_id=build_id,
                )
            except Exception:
                logger.warning(
                    "chart prewarm failed for %s (bracket=%s build=%s)",
                    chart_key,
                    bracket,
                    build_id,
                    exc_info=True,
                )
                continue
            key = _chart_cache_key(
                chart_key,
                None,
                None,
                None,
                None,
                split,
                stat,
                x,
                y,
                None,
                None,
                None,
                None,
                bracket=bracket,
                build_id=build_id,
            )
            # Mirror the endpoint: a still-building blob chart caches briefly
            # so it re-warms once the snapshot lands, not for the full TTL.
            app_cache.set_json(key, payload, 30 if payload["building"] else _WARM_TTL)
            warmed += 1
    logger.info(
        "chart prewarm: %d payloads (%d/%d slices%s) in %.1fs",
        warmed,
        min(si + (0 if out_of_budget else 1), len(slices)) if slices else 0,
        len(slices),
        ", budget hit" if out_of_budget else "",
        time.monotonic() - started,
    )
    return warmed


@router.get("/{chart_key}")
@limiter.limit("120/minute")
def get_chart(
    request: Request,
    chart_key: str,
    players: int | None = Query(None, ge=1, le=4, description="Player count filter"),
    ascension: int | None = Query(
        None, ge=0, le=10, description="Exact ascension (A10 is the cap)"
    ),
    game_mode: str | None = Query(
        None, description="standard | daily | custom (omit for all)"
    ),
    username: str | None = Query(
        None, max_length=64, description="One submitter's runs"
    ),
    split: str | None = Query(
        None, description="Series split: character | players | outcome | ascension"
    ),
    stat: str | None = Query(None, description="Run stat for stat-driven charts"),
    x: str | None = Query(None, description="X stat for the scatter"),
    y: str | None = Query(None, description="Y stat for the scatter"),
    encounter: str | None = Query(None, max_length=80, description="Encounter id"),
    event: str | None = Query(None, max_length=80, description="Event id"),
    etype: str | None = Query(None, description="cards | relics | potions"),
    entity: str | None = Query(None, max_length=80, description="Entity id"),
    bracket: str | None = Query(
        None,
        description="Content bracket: a10 | wr30 | wr50 | wr75",
    ),
    build_id: str | None = Query(
        None,
        max_length=32,
        description="Game version (e.g. v0.107.1); combines with every other filter",
    ),
):
    """One pre-aggregated chart. See /api/charts/meta for the available
    charts, their filters, splits, and the run stats usable for stat/x/y."""
    spec = CHARTS.get(chart_key)
    if not spec:
        raise HTTPException(status_code=404, detail=f"Unknown chart '{chart_key}'")
    # Brackets now apply to both frame and blob charts (the blob is accumulated
    # per bracket in the snapshot).
    if bracket is not None and bracket not in ("a10", "wr30", "wr50", "wr75"):
        raise HTTPException(status_code=400, detail="bad bracket")
    if build_id is not None and not re.fullmatch(r"v[\d.]+", build_id):
        raise HTTPException(status_code=400, detail="bad build_id")
    if game_mode and game_mode not in ("standard", "daily", "custom"):
        raise HTTPException(status_code=400, detail="bad game_mode")
    for name, value in (("stat", stat), ("x", x), ("y", y)):
        if value and value not in cs.STATS:
            raise HTTPException(status_code=400, detail=f"unknown {name} '{value}'")
    allowed_splits = spec.get("splits", [])
    if split and split not in allowed_splits:
        raise HTTPException(
            status_code=400, detail=f"split must be one of {allowed_splits or 'none'}"
        )
    username = (username or "").strip() or None
    split = split or "character"

    cache_key = _chart_cache_key(
        chart_key,
        players,
        ascension,
        game_mode,
        username,
        split,
        stat,
        x,
        y,
        encounter,
        event,
        etype,
        entity,
        bracket,
        build_id,
    )
    cached = app_cache.get_json(cache_key)
    if cached is not None:
        return cached

    payload = _compute_chart(
        chart_key,
        spec,
        players,
        ascension,
        game_mode,
        username,
        split,
        stat,
        x,
        y,
        encounter,
        event,
        etype,
        entity,
        bracket,
        build_id,
    )
    # A still-building snapshot resolves within minutes; don't pin the empty
    # answer for the full TTL.
    app_cache.set_json(cache_key, payload, 30 if payload["building"] else _CACHE_TTL)
    return payload
