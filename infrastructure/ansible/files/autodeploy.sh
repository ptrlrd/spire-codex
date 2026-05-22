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
BETA_COMPOSE_FILE="${SPIRE_BETA_COMPOSE_FILE:-docker-compose.beta.yml}"

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

# Detect whether this is a news-only update. The compose file mounts
# ./data:/data into the backend, so the news API reads directly from the
# host's data/news/*.json on each request — no rebuild, no restart
# needed. Skipping the container recreate here saves ~30s of downtime
# for a class of updates (Steam news mirror refreshes, beta-watch
# ingests where only the news file changed) that happen frequently.
#
# Anything outside data/news/ — code, other data files, images,
# frontend, infra — still needs the full recreate to take effect.
CHANGED=$(git diff --name-only "$BEFORE..$AFTER")
NON_NEWS=$(echo "$CHANGED" | grep -v '^data/news/' | grep -v '^$' || true)

if [ -z "$NON_NEWS" ]; then
  log "news-only update ($(echo "$CHANGED" | wc -l | tr -d ' ') file(s)) — skipping container recreate"
  RECREATE=0
else
  log "full deploy ($(echo "$NON_NEWS" | wc -l | tr -d ' ') non-news file(s))"
  RECREATE=1
fi

if [ "$RECREATE" = "1" ]; then
  # Pull + restart both stable AND beta. `--force-recreate` ensures the
  # container picks up the new image even if compose thinks the config
  # is unchanged. Beta runs on the same box (separate containers via
  # docker-compose.beta.yml) so a missed beta deploy was a recurring
  # operational gap — folding it into autodeploy closes that loop.
  for f in "$COMPOSE_FILE" "$BETA_COMPOSE_FILE"; do
    [ -f "$REPO/$f" ] || { log "compose file $f missing, skipping"; continue; }
    log "  deploying $f"
    docker compose -f "$f" pull backend frontend >> "$LOG" 2>&1
    docker compose -f "$f" up -d --force-recreate backend frontend >> "$LOG" 2>&1
  done

  # Settle. 5s is enough for FastAPI startup; longer waits don't help.
  sleep 5

  if docker compose -f "$COMPOSE_FILE" logs --tail 50 backend 2>/dev/null | grep -q "Spire Codex API ready"; then
    log "✓ stable backend ready"
  else
    log "✗ stable backend did NOT log 'Spire Codex API ready' — manual check required"
  fi
  if docker compose -f "$BETA_COMPOSE_FILE" logs --tail 50 backend 2>/dev/null | grep -q "Spire Codex API ready"; then
    log "✓ beta backend ready"
  else
    log "✗ beta backend did NOT log 'Spire Codex API ready' — manual check required"
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
