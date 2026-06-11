"""Charts API: pre-aggregated run data for the /charts explorer page.

Every endpoint returns a small, ready-to-plot payload:
{ chart, params, series: [{id, label, points: [{x, y, n?}]}], total_runs }

Metadata charts aggregate the in-memory run frame per request (fast) and the
results are cached. Blob charts (per-floor damage, encounter damage, death
rooms) read the snapshot accumulated during the regular stats walk, or walk a
single user's blobs on demand when `username` is set.
"""

from fastapi import APIRouter, HTTPException, Query, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..services import cache as app_cache
from ..services import charts_stats as cs
from ..services.run_entity_stats import get_charts_blob_stats

router = APIRouter(prefix="/api/charts", tags=["Charts"])
limiter = Limiter(key_func=get_remote_address)

_CACHE_TTL = 300

# Registry: which charts exist, how they're built, and which filters apply.
# kind "frame" charts support every filter; "blob" charts support players and
# username (ascension/mode splits would blow up the snapshot, so they're
# all-ascensions by design and the UI says so).
CHARTS: dict[str, dict] = {
    "winrate-by-floor": {
        "label": "Win rate by floor reached",
        "group": "Win rates",
        "kind": "frame",
        "axis": {"x": "Floor reached", "y": "Eventual win %"},
        "desc": "Of the runs that made it to floor X, how many went on to win the run.",
    },
    "winrate-over-time": {
        "label": "Win rate over time",
        "group": "Win rates",
        "kind": "frame",
        "axis": {"x": "Week", "y": "Win %"},
        "desc": "Weekly community win rate from submitted runs.",
    },
    "winrate-by-stat": {
        "label": "Win rate vs run stat",
        "group": "Win rates",
        "kind": "frame",
        "needs": ["stat"],
        "axis": {"x": "stat", "y": "Win %"},
        "desc": "Win rate of runs bucketed by a run stat (deck size, relics, length, ...).",
    },
    "winrate-by-ascension": {
        "label": "Win rate by ascension",
        "group": "Win rates",
        "kind": "frame",
        "axis": {"x": "Ascension", "y": "Win %"},
        "desc": "Win rate at each ascension level.",
    },
    "deaths-by-floor": {
        "label": "Deaths by floor",
        "group": "Survival",
        "kind": "frame",
        "axis": {"x": "Floor", "y": "% of losses"},
        "desc": "Where losses end. Abandoned runs are excluded.",
    },
    "runs-over-time": {
        "label": "Runs submitted over time",
        "group": "Volume",
        "kind": "frame",
        "axis": {"x": "Week", "y": "Runs"},
        "desc": "Weekly submission volume.",
    },
    "stat-histogram": {
        "label": "Run stat distribution",
        "group": "Distributions",
        "kind": "frame",
        "needs": ["stat"],
        "axis": {"x": "stat", "y": "% of runs"},
        "desc": "How a run stat is distributed across the filtered runs.",
    },
    "stat-scatter": {
        "label": "Stat vs stat scatter",
        "group": "Distributions",
        "kind": "frame",
        "needs": ["x", "y"],
        "scatter": True,
        "axis": {"x": "x stat", "y": "y stat"},
        "desc": "Sampled runs plotted stat-vs-stat, colored by character.",
    },
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
        "axis": {"x": "Encounter", "y": "Avg % max HP lost"},
        "desc": "Encounters ranked by the average share of max HP they take per fight. All ascensions and modes.",
    },
    "deaths-by-room": {
        "label": "Deaths by room type",
        "group": "Survival",
        "kind": "blob",
        "bars": True,
        "axis": {"x": "Room type", "y": "% of deaths"},
        "desc": "What kind of room runs die in. All ascensions and modes.",
    },
}


@router.get("/meta")
@limiter.limit("120/minute")
def charts_meta(request: Request):
    """Everything the explorer UI needs to draw its controls."""
    chars = cs._official_characters()
    return {
        "charts": [
            {
                "key": key,
                "label": c["label"],
                "group": c["group"],
                "kind": c["kind"],
                "needs": c.get("needs", []),
                "scatter": c.get("scatter", False),
                "bars": c.get("bars", False),
                "axis": c["axis"],
                "desc": c["desc"],
            }
            for key, c in CHARTS.items()
        ],
        "stats": [{"key": k, "label": v["label"]} for k, v in cs.STATS.items()],
        "characters": [{"id": cid, "name": name} for cid, name in chars.items()],
    }


def _build_frame_chart(
    key: str, rows: list[tuple], stat: str | None, x: str | None, y: str | None
):
    if key == "winrate-by-floor":
        return cs.winrate_by_floor(rows)
    if key == "winrate-over-time":
        return cs.winrate_over_time(rows)
    if key == "runs-over-time":
        return cs.runs_over_time(rows)
    if key == "deaths-by-floor":
        return cs.deaths_by_floor(rows)
    if key == "winrate-by-ascension":
        return cs.winrate_by_stat(rows, "ascension")
    if key == "winrate-by-stat":
        return cs.winrate_by_stat(rows, stat or "deck_size")
    if key == "stat-histogram":
        return cs.stat_histogram(rows, stat or "floors_reached")
    if key == "stat-scatter":
        return cs.stat_scatter(rows, x or "floors_reached", y or "deck_size")
    raise HTTPException(status_code=404, detail="Unknown chart")


@router.get("/{chart_key}")
@limiter.limit("120/minute")
def get_chart(
    request: Request,
    chart_key: str,
    players: int | None = Query(None, ge=1, le=4, description="Player count filter"),
    ascension: int | None = Query(None, ge=0, le=20, description="Exact ascension"),
    game_mode: str | None = Query(
        None, description="standard | daily | custom (omit for all)"
    ),
    username: str | None = Query(
        None, max_length=64, description="One submitter's runs"
    ),
    stat: str | None = Query(None, description="Run stat for stat-driven charts"),
    x: str | None = Query(None, description="X stat for the scatter"),
    y: str | None = Query(None, description="Y stat for the scatter"),
):
    """One pre-aggregated chart. See /api/charts/meta for the available
    charts, their filters, and the run stats usable for stat/x/y."""
    spec = CHARTS.get(chart_key)
    if not spec:
        raise HTTPException(status_code=404, detail=f"Unknown chart '{chart_key}'")
    if game_mode and game_mode not in ("standard", "daily", "custom"):
        raise HTTPException(status_code=400, detail="bad game_mode")
    for name, value in (("stat", stat), ("x", x), ("y", y)):
        if value and value not in cs.STATS:
            raise HTTPException(status_code=400, detail=f"unknown {name} '{value}'")
    username = (username or "").strip() or None

    cache_key = (
        f"charts:{chart_key}:{players or ''}:{ascension if ascension is not None else ''}:"
        f"{game_mode or ''}:{(username or '').lower()}:{stat or ''}:{x or ''}:{y or ''}"
    )
    cached = app_cache.get_json(cache_key)
    if cached is not None:
        return cached

    if spec["kind"] == "frame":
        rows = cs.filter_rows(cs.get_frame(), players, ascension, game_mode, username)
        series = _build_frame_chart(chart_key, rows, stat, x, y)
        total = len(rows)
    else:
        # Blob charts: snapshot rollup, or a per-user walk when username set.
        if ascension is not None or game_mode:
            raise HTTPException(
                status_code=400,
                detail="This chart covers all ascensions and modes; drop those filters.",
            )
        stats = (
            cs.build_user_blob_stats(username) if username else get_charts_blob_stats()
        )
        if chart_key == "hp-loss-by-floor":
            series = cs.hp_loss_by_floor(stats, players)
        elif chart_key == "encounter-damage":
            series = cs.encounter_damage(stats, players)
        elif chart_key == "deaths-by-room":
            series = cs.deaths_by_room(stats, players)
        else:
            raise HTTPException(status_code=404, detail="Unknown chart")
        total = sum(n for *_rest, n in (stats.get("hp_floor") or [[0, 0, 0, 0, 0]]))

    payload = {
        "chart": chart_key,
        "label": spec["label"],
        "axis": spec["axis"],
        "desc": spec["desc"],
        "params": {
            "players": players,
            "ascension": ascension,
            "game_mode": game_mode,
            "username": username,
            "stat": stat,
            "x": x,
            "y": y,
        },
        "series": series,
        "total_runs": total,
    }
    app_cache.set_json(cache_key, payload, _CACHE_TTL)
    return payload
