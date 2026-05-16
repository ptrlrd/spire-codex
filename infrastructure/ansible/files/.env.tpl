# Spire Codex prod .env template — rendered by `op inject` at deploy time.
#
# Lines containing op://<vault>/<item>/<field> are resolved from 1Password.
# Plain values are kept as-is. Update the field names below to match your
# actual 1Password item layout (right-click any field in the 1Password app
# and "Copy Secret Reference" to get the exact path).
#
# This file is safe to commit — only the resolved-at-runtime version
# (written to /tmp during the playbook run, deleted immediately after)
# contains real secrets.

# --- Static / non-secret config -------------------------------------

QA_DIR=/data/qa
DATA_DIR=/data
GITHUB_APP_PRIVATE_KEY_PATH=/secrets/knowledge-demon.private-key.pem

# --- Secrets from 1Password (vault: Spire Codex) --------------------
# One item per service, with one password field per env var. Update
# the field names if yours differ.

# Discord webhooks
FEEDBACK_WEBHOOK_URL=op://Spire Codex/Discord Webhooks/feedback
GUIDE_WEBHOOK_URL=op://Spire Codex/Discord Webhooks/guide

# Resend (email forwarding for uninstall feedback)
RESEND_API_KEY=op://Spire Codex/Resend/api_key
UNINSTALL_FORWARD_TO=op://Spire Codex/Resend/forward_to
UNINSTALL_FORWARD_FROM=op://Spire Codex/Resend/forward_from

# Admin endpoints token (gates /api/admin/*)
ADMIN_TOKEN=op://Spire Codex/Admin Token/value
