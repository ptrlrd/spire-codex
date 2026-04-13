"""Prometheus metrics for Spire Codex."""

from prometheus_client import Counter, Gauge, Histogram

# ── HTTP / Traffic ────────────────────────────────────────────
requests_in_flight = Gauge(
    "spire_codex_requests_in_flight",
    "Number of requests currently being processed",
)

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
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0],
)
