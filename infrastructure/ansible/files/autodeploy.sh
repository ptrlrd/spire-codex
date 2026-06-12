#!/usr/bin/env bash
# Hourly auto-deploy for spire-codex prod. Polls origin/main; if HEAD
# advanced, pulls Docker images and recreates the backend+frontend
# containers. After a clean restart, purges Cloudflare cache so /news,
# /api/news, sitemap.xml, etc. immediately reflect the new build.
#
# Installed by playbooks/install-autodeploy.yml. Triggered by
# /etc/cron.d/spire-codex-autodeploy. Manual run: just exec this script.
#
# Idempotent: same-HEAD ticks no-op and don't log unless DEBUG=1.

set -euo pipefail

REPO="${SPIRE_REPO:-/var/www/spire-codex}"
LOG="${SPIRE_AUTODEPLOY_LOG:-/var/log/spire-codex-autodeploy.log}"
CF_ENV="${SPIRE_CF_ENV:-/etc/spire-codex/cf-purge.env}"
COMPOSE_FILE="${SPIRE_COMPOSE_FILE:-docker-compose.prod.yml}"

# Self-installing log file (cron runs as root the first time, so this
# creates a root-owned file — subsequent appends just work).
touch "$LOG"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$LOG"; }

cd "$REPO"

BEFORE=$(git rev-parse HEAD)
# Force-align with origin/main. Anyone hand-editing on the box should
# commit to a branch first; this is documented behavior of deploy.yml too.
git fetch origin main --quiet
git reset --hard origin/main >> "$LOG" 2>&1
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
  [ "${DEBUG:-0}" = "1" ] && log "no change ($AFTER)"
  exit 0
fi

log "==== change detected: ${BEFORE:0:8} -> ${AFTER:0:8} ===="

# Detect whether this update needs a container recreate at all. Two
# classes don't:
#
#   data/news/*  : the compose file mounts ./data:/data and the news API
#                  re-reads from disk on every request.
#   data-beta/*  : the beta catalogs are cached keyed BY VERSION and the
#                  `latest` pointer is re-read per request, so a new
#                  beta ingest (the beta-watch auto-PR) starts serving
#                  the moment the files land on disk. Exception: a
#                  re-parse of an EXISTING version keeps its cache key;
#                  bounce the backend manually after one of those.
#
# Skipping the recreate saves ~30s of downtime for the two most frequent
# update classes. Anything else (code, stable data files cached
# without a version key so they need the restart, images, frontend,
# infra) still does the full recreate.
CHANGED=$(git diff --name-only "$BEFORE..$AFTER")
NON_HOT=$(echo "$CHANGED" | grep -v '^data/news/' | grep -v '^data-beta/' | grep -v '^$' || true)

if [ -z "$NON_HOT" ]; then
  log "hot-reloadable update ($(echo "$CHANGED" | wc -l | tr -d ' ') file(s), news/beta data only), skipping container recreate"
  RECREATE=0
else
  log "full deploy ($(echo "$NON_HOT" | wc -l | tr -d ' ') file(s) outside the hot-reload classes)"
  RECREATE=1
fi

if [ "$RECREATE" = "1" ]; then
  # `--force-recreate` ensures the container picks up the new image even
  # if compose thinks the config is unchanged. The beta site merged into
  # this stack (served at /beta from the same containers), so the old
  # second pass over docker-compose.beta.yml is gone.
  log "  deploying $COMPOSE_FILE"
  docker compose -f "$COMPOSE_FILE" pull backend frontend >> "$LOG" 2>&1
  docker compose -f "$COMPOSE_FILE" up -d --force-recreate backend frontend >> "$LOG" 2>&1

  # Settle. 5s is enough for FastAPI startup; longer waits don't help.
  sleep 5

  if docker compose -f "$COMPOSE_FILE" logs --tail 50 backend 2>/dev/null | grep -q "Spire Codex API ready"; then
    log "✓ backend ready"
  else
    log "✗ backend did NOT log 'Spire Codex API ready', manual check required"
  fi
fi

# Purge Cloudflare cache. Without this, /news + /api/news + sitemap.xml
# keep serving the pre-deploy HTML (CF s-maxage is up to 1 year for some
# routes). We purge everything because the cost of overpurging is just a
# brief cold cache, while the cost of underpurging is invisible stale data.
if [ -f "$CF_ENV" ]; then
  # shellcheck source=/dev/null
  source "$CF_ENV"
  if [ -n "${CF_TOKEN:-}" ] && [ -n "${CF_ZONE:-}" ]; then
    HTTP=$(curl -s -o /tmp/cf-purge.out -w '%{http_code}' \
      -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/purge_cache" \
      -H "Authorization: Bearer ${CF_TOKEN}" \
      -H "Content-Type: application/json" \
      -d '{"purge_everything":true}')
    if [ "$HTTP" = "200" ]; then
      log "✓ CF cache purged"
    else
      log "✗ CF purge returned $HTTP: $(cat /tmp/cf-purge.out)"
    fi
  else
    log "⚠ $CF_ENV missing CF_TOKEN or CF_ZONE — skipping cache purge"
  fi
else
  log "⚠ $CF_ENV not found — skipping cache purge"
fi

log "==== deploy done ===="
