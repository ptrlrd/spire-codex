"""Prometheus metrics for Spire Codex."""

from prometheus_client import Counter, Histogram

# ── Run submissions ───────────────────────────────────────────
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

# ── Guide submissions ────────────────────────────────────────
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

# ── API errors ───────────────────────────────────────────────
api_errors = Counter(
    "spire_codex_api_errors_total",
    "API errors by status code",
    ["status_code", "path"],
)

# ── Data loading ─────────────────────────────────────────────
data_load_duration = Histogram(
    "spire_codex_data_load_seconds",
    "Time to load JSON data files",
    ["entity_type"],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
)
