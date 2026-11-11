"""Prometheus metrics for Spire Codex."""

import os
import time

from prometheus_client import Counter, Gauge, Histogram, multiprocess

# ── HTTP / Traffic ────────────────────────────────────────────
# multiprocess_mode='livesum': under uvicorn --workers N, every worker
# tracks its own in-flight gauge value. We want the fleet total, so
# the multiproc collector sums each worker's value at scrape time.
# "live" only excludes a dead worker once mark_process_dead() removes
# its gauge files — uvicorn has no gunicorn-style child_exit hook, so
# sweep_dead_worker_gauges() below does that cleanup on scrape.
# Without an explicit mode, the prometheus_client multiproc collector
# refuses to register the gauge at all.
requests_in_flight = Gauge(
    "spire_codex_requests_in_flight",
    "Number of requests currently being processed",
    multiprocess_mode="livesum",
)

_SWEEP_INTERVAL = 60.0
_last_sweep = 0.0


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def sweep_dead_worker_gauges() -> None:
    """Drop gauge files left behind by dead uvicorn workers.

    A worker that dies mid-request (recycle, OOM kill) leaves its last
    in-flight value in the multiproc dir, and 'livesum' keeps summing it
    forever — the fleet gauge only ever climbs (854 -> 1746 within a day
    on 2026-08-11 while the box held ~240 real connections). Called from
    the /metrics scrape path, at most once per _SWEEP_INTERVAL."""
    global _last_sweep
    now = time.monotonic()
    if now - _last_sweep < _SWEEP_INTERVAL:
        return
    _last_sweep = now
    mp_dir = os.environ.get("PROMETHEUS_MULTIPROC_DIR") or os.environ.get(
        "prometheus_multiproc_dir"
    )
    if not mp_dir or not os.path.isdir(mp_dir):
        return
    me = os.getpid()
    dead: set[int] = set()
    for fname in os.listdir(mp_dir):
        stem = fname.rsplit(".", 1)[0]
        pid_part = stem.rsplit("_", 1)[-1]
        if pid_part.isdigit():
            pid = int(pid_part)
            if pid != me and not _pid_alive(pid):
                dead.add(pid)
    for pid in dead:
        try:
            multiprocess.mark_process_dead(pid, mp_dir)
        except OSError:
            pass  # another worker swept it concurrently


response_size = Histogram(
    "spire_codex_response_size_bytes",
    "Response body size in bytes",
    ["method", "endpoint"],
    buckets=[100, 500, 1_000, 5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000],
)

# ── API errors ───────────────────────────────────────────────
api_errors = Counter(
    "spire_codex_api_errors_total",
    "API errors by status code, method, and endpoint",
    ["status_code", "method", "path"],
)

# ── API-key tier usage ───────────────────────────────────────
requests_by_tier = Counter(
    "spire_codex_requests_by_tier_total",
    "API requests by rate-limit tier (browse = no key) and status class, "
    "so per-tier volume and 429 pressure are graphable",
    [
        "tier",
        "status",
    ],  # tier: browse/general/registered/academia/paid; status: 2xx..5xx
)

# ── Entity views ─────────────────────────────────────────────
entity_views = Counter(
    "spire_codex_entity_views_total",
    "Entity detail page views via API",
    ["entity_type"],  # cards, relics, monsters, potions, etc.
)

entity_list_views = Counter(
    "spire_codex_entity_list_views_total",
    "Entity list/search views via API",
    ["entity_type"],
)

# ── Search ───────────────────────────────────────────────────
search_queries = Counter(
    "spire_codex_search_queries_total",
    "Search queries by entity type",
    ["entity_type"],
)

# ── Language usage ───────────────────────────────────────────
language_usage = Counter(
    "spire_codex_language_requests_total",
    "API requests by language",
    ["lang"],
)

# ── Beta version usage ───────────────────────────────────────
version_usage = Counter(
    "spire_codex_version_requests_total",
    "Beta version browsing requests",
    ["version"],
)

# ── Widget loads ─────────────────────────────────────────────
widget_loads = Counter(
    "spire_codex_widget_loads_total",
    "External widget script loads",
    ["widget_type"],  # tooltip, changelog
)

# ── Run submissions ──────────────────────────────────────────
run_submissions = Counter(
    "spire_codex_run_submissions_total",
    "Total run submissions",
    ["status"],  # success, duplicate, error
)

run_character = Counter(
    "spire_codex_run_character_total",
    "Runs submitted by character",
    ["character"],
)

run_outcome = Counter(
    "spire_codex_run_outcome_total",
    "Run outcomes",
    ["outcome"],  # win, loss, abandoned
)

run_errors = Counter(
    "spire_codex_run_errors_total",
    "Run submission errors by reason",
    ["reason"],  # invalid_json, too_large, missing_fields, disabled
)

run_ascension = Counter(
    "spire_codex_run_ascension_total",
    "Runs submitted by ascension level",
    ["ascension"],
)

run_duration = Histogram(
    "spire_codex_run_duration_seconds",
    "Duration of submitted runs",
    buckets=[300, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200, 10800],
)

# ── Guide submissions ───────────────────────────────────────
guide_submissions = Counter(
    "spire_codex_guide_submissions_total",
    "Total guide submissions",
    ["status"],  # success, error
)

# ── Feedback ─────────────────────────────────────────────────
feedback_submissions = Counter(
    "spire_codex_feedback_total",
    "Feedback submissions",
    ["type"],  # Bug, Feature, etc.
)

# ── Data exports ─────────────────────────────────────────────
data_exports = Counter(
    "spire_codex_exports_total",
    "Data export downloads",
    ["lang"],
)

run_exports = Counter(
    "spire_codex_run_exports_total",
    "Bulk run data export downloads (unbounded full dumps)",
)

run_export_pages = Counter(
    "spire_codex_run_export_pages_total",
    "Paginated run export page fetches (a bounded ?limit= request)",
)

# ── Compare pages ───────────────────────────────────────────
compare_views = Counter(
    "spire_codex_compare_views_total",
    "Character comparison page views",
    ["pair"],
)

# ── Data loading ─────────────────────────────────────────────
data_load_duration = Histogram(
    "spire_codex_data_load_seconds",
    "Time to load JSON data files",
    ["entity_type"],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
)

# ── Database ─────────────────────────────────────────────────
db_operations = Counter(
    "spire_codex_db_operations_total",
    "SQLite operations",
    ["operation", "table"],  # insert/select, runs/run_cards/etc.
)

db_operation_duration = Histogram(
    "spire_codex_db_operation_seconds",
    "SQLite operation duration",
    ["operation"],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0],
)

count_budget_timeouts = Counter(
    "spire_codex_count_budget_timeouts_total",
    "Run counts that hit their server-side time limit",
    ["stage"],
)

# ── Application cache (Redis) ────────────────────────────────
# Labeled by key namespace (the part before the first ":"), e.g. stats,
# leaderboard, run, entity_scores. Errors cover Redis being unreachable or
# slow; the cache layer is fail-safe so an error is a miss, never a 500.
cache_hits = Counter(
    "spire_codex_cache_hits_total",
    "Application cache hits",
    ["namespace"],
)

cache_misses = Counter(
    "spire_codex_cache_misses_total",
    "Application cache misses",
    ["namespace"],
)

cache_errors = Counter(
    "spire_codex_cache_errors_total",
    "Application cache errors (treated as misses)",
    ["namespace", "operation"],
)
