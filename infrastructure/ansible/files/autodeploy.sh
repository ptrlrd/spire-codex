#!/usr/bin/env bash
# Hourly auto-deploy for spire-codex prod. Polls origin/main; if HEAD
# advanced, pulls Docker images and recreates the backend+frontend
# containers. After a clean restart, purges Cloudflare cache so /news,
# /api/news, sitemap.xml, etc. immediately reflect the new build. Code
# deploys purge the whole zone and then re-warm the hot pages;
# news-data-only commits purge just the news URLs (see the purge block).
#
# Installed by playbooks/install-autodeploy.yml. Triggered by
# /etc/cron.d/spire-codex-autodeploy. Manual run: just exec this script.
#
# Idempotent: same-HEAD ticks no-op and don't log unless DEBUG=1.
# `--force` overrides that: full deploy (pull, prewarm, recreate, nginx
# reload, CF purge) even with no new commit. Used for manual releases
# right after a merge (./tools/startup.sh release) and for re-pulling a
# rebuilt image on the same commit.

set -euo pipefail

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

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

if [ "$BEFORE" = "$AFTER" ] && [ "$FORCE" != "1" ]; then
  [ "${DEBUG:-0}" = "1" ] && log "no change ($AFTER)"
  exit 0
fi

if [ "$FORCE" = "1" ]; then
  log "==== forced deploy at ${AFTER:0:8} ===="
  RECREATE=1
else
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
fi

if [ "$RECREATE" = "1" ]; then
  # `--force-recreate` ensures the container picks up the new image even
  # if compose thinks the config is unchanged. The beta site merged into
  # this stack (served at /beta from the same containers), so the old
  # second pass over docker-compose.beta.yml is gone.
  log "  deploying $COMPOSE_FILE"
  docker compose -f "$COMPOSE_FILE" pull backend frontend >> "$LOG" 2>&1

  # Pre-warm the stats snapshot with the NEW image before swapping
  # containers. If the new code bumped SNAPSHOT_VERSION, this runs the
  # full walk while the old containers keep serving the old snapshot, so
  # the new workers boot with their snapshot already in Mongo and the
  # stats surfaces never go empty during a deploy. When the version did
  # not change, refresh_entity_stats_snapshot() sees a fresh same-version
  # snapshot and returns immediately, so routine deploys pay one cheap
  # find_one. Failures are non-fatal: serve-stale on the new code covers
  # the gap.
  RUNNING_IMG=$(docker inspect --format '{{.Image}}' spire-codex-backend 2>/dev/null || true)
  PULLED_IMG=$(docker image inspect --format '{{.Id}}' ptrlrd/spire-codex-backend:latest 2>/dev/null || true)
  if [ -n "$PULLED_IMG" ] && [ "$RUNNING_IMG" != "$PULLED_IMG" ]; then
    log "  backend image changed; pre-warming stats snapshot with the new code"
    if timeout 30m docker compose -f "$COMPOSE_FILE" run --rm --no-deps --entrypoint python backend -c \
        "from app.services.run_entity_stats import refresh_entity_stats_snapshot as r; print('prewarm entities:', r())" >> "$LOG" 2>&1; then
      log "  ✓ snapshot prewarm done"
    else
      log "  ⚠ snapshot prewarm failed or timed out; continuing (serve-stale covers the gap)"
    fi
  fi

  docker compose -f "$COMPOSE_FILE" up -d --force-recreate backend frontend >> "$LOG" 2>&1

  # Settle. 5s is enough for FastAPI startup; longer waits don't help.
  sleep 5

  # Recreated containers get new IPs on the shared docker network, and
  # nginx resolves upstream container names once at startup, so without
  # a reload it keeps proxying to the dead addresses and the whole site
  # 502s (bit us on 2026-06-11 and again on 2026-06-12). Reload is
  # zero-downtime and re-resolves every upstream.
  if docker exec web-server nginx -s reload >> "$LOG" 2>&1; then
    log "✓ nginx reloaded"
  else
    log "⚠ nginx reload failed or web-server not on this host"
  fi

  if docker compose -f "$COMPOSE_FILE" logs --tail 50 backend 2>/dev/null | grep -q "Spire Codex API ready"; then
    log "✓ backend ready"
  else
    log "✗ backend did NOT log 'Spire Codex API ready', manual check required"
  fi
fi

# Purge Cloudflare cache. Without this, /news + /api/news + sitemap.xml
# keep serving the pre-deploy HTML (CF s-maxage is up to 1 year for some
# routes). Scope depends on what changed:
#
#   RECREATE=1 : real code deploy — page HTML can change on every route,
#                so purge everything (a prefix purge needs a paid CF
#                plan). Overpurging here costs a brief cold cache;
#                underpurging is invisible stale data.
#   RECREATE=0 : news/beta-data-only commit (the hourly news workflow,
#                several per day). Only the news surfaces changed, so a
#                targeted `files` purge keeps /static/* (1y immutable),
#                the R2 images, and every other cached API response warm
#                instead of going cold zone-wide every hour.
if [ "$RECREATE" = "1" ]; then
  PURGE_BODY='{"purge_everything":true}'
  PURGE_WHAT="everything"
else
  # The URLs whose content moves when a news commit lands:
  #   /            homepage embeds the latest 3 announcements (HomeNewsSection)
  #   /news        list page, plus its tab views (?tab=press, ?tab=all)
  #   /api/news    the list endpoint clients hit through CF
  #   sitemap.xml  in case lastmod moved
  # Not purged, on purpose: /news/<slug> detail pages — a NEW article is a
  # never-cached URL, and enumerating existing slugs isn't cheap here.
  # /api/news query-string variants we can't enumerate expire on their own
  # within s-maxage=3600. Localized /<lang>/news is force-dynamic (uncached).
  PURGE_BODY='{"files":["https://spire-codex.com/","https://spire-codex.com/news","https://spire-codex.com/news?tab=press","https://spire-codex.com/news?tab=all","https://spire-codex.com/api/news","https://spire-codex.com/sitemap.xml"]}'
  PURGE_WHAT="news URLs only"
fi

PURGED=0
if [ -f "$CF_ENV" ]; then
  # shellcheck source=/dev/null
  source "$CF_ENV"
  if [ -n "${CF_TOKEN:-}" ] && [ -n "${CF_ZONE:-}" ]; then
    HTTP=$(curl -s -o /tmp/cf-purge.out -w '%{http_code}' \
      -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/purge_cache" \
      -H "Authorization: Bearer ${CF_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$PURGE_BODY")
    if [ "$HTTP" = "200" ]; then
      log "✓ CF cache purged ($PURGE_WHAT)"
      PURGED=1
    else
      log "✗ CF purge returned $HTTP: $(cat /tmp/cf-purge.out)"
    fi
  else
    log "⚠ $CF_ENV missing CF_TOKEN or CF_ZONE — skipping cache purge"
  fi
else
  log "⚠ $CF_ENV not found — skipping cache purge"
fi

# A full purge leaves the whole edge cold, so the next visitor to every
# page pays origin latency (and the origin pays the fan-in). Re-warm the
# hot landing pages right away; entity detail pages re-warm via the
# startup.sh --full crawl or organically. Best-effort: warming is an
# optimization and must never fail the deploy. Skipped when the purge was
# skipped or failed — nothing went cold.
if [ "$RECREATE" = "1" ] && [ "$PURGED" = "1" ]; then
  log "  re-warming hot pages after full purge"
  if timeout 10m python3 "$REPO/tools/warm_cache.py" --hot >> "$LOG" 2>&1; then
    log "✓ warm crawl done (hot pages)"
  else
    log "⚠ warm crawl failed or timed out; continuing (pages warm on first visit)"
  fi
fi

log "==== deploy done ===="
