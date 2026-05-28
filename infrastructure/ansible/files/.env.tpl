# Spire Codex prod .env template — rendered by `op inject` at deploy time.
#
# Lines using a 1Password secret reference (vault/item/field path) are
# resolved at render time. Plain values are kept as-is. Update the
# field names below to match your actual 1Password item layout
# (right-click any field in the 1Password app and "Copy Secret
# Reference" to get the exact path).
#
# NOTE: don't put a literal "op:" + "//" sequence in any comment in this
# file — op-inject parses every occurrence and bails on malformed ones.
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
RESEND_API_KEY=op://Spire Codex/Resend/api-key
UNINSTALL_FORWARD_TO=op://Spire Codex/Resend/forward-to
UNINSTALL_FORWARD_FROM=op://Spire Codex/Resend/forward-from

# Admin endpoints token (gates /api/admin/*)
ADMIN_TOKEN=op://Spire Codex/Admin Token/value

# MongoDB — runs database. Hosted on the secondary Lightsail box as a
# single-node replica set. Primary app box reaches it over the private
# Lightsail network; firewall rule restricts port 27017 to primary's
# IP only. When MONGO_URL is unset, backend falls through to the
# legacy local SQLite path at /data/runs.db.
MONGO_URL=op://Spire Codex/MongoDB/connection-string

# Turso (libSQL) — retired after the Overwolf launch revealed
# multi-second tail latency under burst. Keep the secret refs around
# so we can re-enable later if architecture shifts; passthroughs in
# docker-compose.prod.yml are hardcoded empty for now.
# TURSO_URL=op://Spire Codex/Turso/url
# TURSO_AUTH_TOKEN=op://Spire Codex/Turso/token
# TURSO_LOCAL_REPLICA=/data/runs-replica.db

# Umami self-hosted analytics. UMAMI_SRC + UMAMI_WEBSITE_ID are
# hardcoded as public constants in frontend/app/layout.tsx (they're
# embedded in the SSR'd HTML anyway — no secret to keep), so they
# don't need to be threaded through here. The two below are
# consumed by docker-compose.umami.yml only.
UMAMI_DB_PASSWORD=op://Spire Codex/Umami/db_password
UMAMI_APP_SECRET=op://Spire Codex/Umami/app_secret

# User accounts (Steam + Discord OAuth, JWT sessions)
JWT_SECRET=op://Spire Codex/Auth/jwt-secret
DISCORD_CLIENT_ID=op://Spire Codex/Discord OAuth/client-id
DISCORD_CLIENT_SECRET=op://Spire Codex/Discord OAuth/client-secret
