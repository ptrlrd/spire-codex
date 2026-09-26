#!/usr/bin/env bash
# Hourly auto-deploy for spire-codex prod. Polls origin/main; if HEAD
# advanced, pulls Docker images and recreates the backend+frontend
# containers, waits for their healthchecks, and reloads nginx. Code
# deploys purge nothing at Cloudflare (see the purge block for why);
# news-data-only commits purge just the news URLs.
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
PURGE_ALL=0
ROLLBACK=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --purge-all) PURGE_ALL=1 ;;
    --rollback) ROLLBACK=1 ;;
    *) echo "unknown option: $arg (use --force, --purge-all or --rollback)" >&2; exit 2 ;;
  esac
done
exec 9>/var/lock/spire-codex-autodeploy.lock
if ! flock -n 9; then
  echo "another deploy is running" >&2
  exit 0
fi

REPO="${SPIRE_REPO:-/var/www/spire-codex}"
LOG="${SPIRE_AUTODEPLOY_LOG:-/var/log/spire-codex-autodeploy.log}"
CF_ENV="${SPIRE_CF_ENV:-/etc/spire-codex/cf-purge.env}"
COMPOSE_FILE="${SPIRE_COMPOSE_FILE:-docker-compose.prod.yml}"

# Self-installing log file (cron runs as root the first time, so this
# creates a root-owned file — subsequent appends just work).
touch "$LOG"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$LOG"; }

cd "$REPO"

# Every deploy tags the images it is about to replace as :previous, so a bad
# release is one command away from being undone without touching git or
# waiting for CI: spire-codex-autodeploy --rollback (or
# ./tools/startup.sh rollback). The next deploy overwrites :previous again.
IMAGES="ptrlrd/spire-codex-backend ptrlrd/spire-codex-frontend"
keep_previous() {
  for img in $IMAGES; do
    id=$(docker image inspect --format '{{.Id}}' "$img:latest" 2>/dev/null || true)
    [ -n "$id" ] && docker tag "$id" "$img:previous" >> "$LOG" 2>&1 || true
  done
}
if [ "$ROLLBACK" = "1" ]; then
  log "==== rollback to :previous images ===="
  for img in $IMAGES; do
    if ! docker image inspect "$img:previous" >/dev/null 2>&1; then
      log "✗ no $img:previous image on this box, nothing to roll back to"
      exit 1
    fi
    docker tag "$img:previous" "$img:latest" >> "$LOG" 2>&1
  done
  docker compose -f "$COMPOSE_FILE" up -d --force-recreate --no-build --pull never backend frontend rebuilder >> "$LOG" 2>&1
  for name in spire-codex-backend spire-codex-frontend; do
    for i in $(seq 1 60); do
      st=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name" 2>/dev/null)
      [ "$st" = "healthy" ] && break
      sleep 2
    done
    log "  $name: ${st:-missing}"
  done
  docker exec web-server sh -c 'rm -rf /var/cache/nginx/pages/* 2>/dev/null' >> "$LOG" 2>&1 || true
  docker exec web-server nginx -s reload >> "$LOG" 2>&1 && log "✓ nginx reloaded"
  log "==== rollback done (the next deploy will pull :latest again) ===="
  exit 0
fi

BEFORE=$(git rev-parse HEAD)
# Force-align with origin/main. Anyone hand-editing on the box should
# commit to a branch first; this is documented behavior of deploy.yml too.
git fetch origin main --quiet
git reset --hard origin/main >> "$LOG" 2>&1
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ] && [ "$FORCE" != "1" ]; then
  if [ "$PURGE_ALL" = "1" ]; then
    echo "nothing to deploy; pass --force with --purge-all to purge anyway" >&2
    exit 2
  fi
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
  # The rebuilder MUST ride along: it holds the stats-refresher lease, so
  # leaving it on an old image keeps the fleet pinned to the old snapshot
  # version forever (no v22 ever built after the 2026-08-11 deploy).
  keep_previous
  docker compose -f "$COMPOSE_FILE" pull backend frontend rebuilder >> "$LOG" 2>&1

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

  docker compose -f "$COMPOSE_FILE" up -d --force-recreate backend frontend rebuilder >> "$LOG" 2>&1

  # Wait for the recreated containers to answer before touching nginx:
  # a fixed sleep either overshoots or reloads onto containers that are
  # still booting. Health comes from the compose healthchecks; a container
  # without one is polled directly.
  wait_ready() {
    local name="$1" url="$2" deadline=$(( $(date +%s) + 120 ))
    while [ "$(date +%s)" -lt "$deadline" ]; do
      case "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name" 2>/dev/null)" in
        healthy) return 0 ;;
        unhealthy) return 1 ;;
        none)
          if docker exec "$name" sh -c "node -e \"fetch('$url').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\" || python -c \"import urllib.request;urllib.request.urlopen('$url',timeout=3)\"" >/dev/null 2>&1; then
            return 0
          fi ;;
      esac
      sleep 2
    done
    return 1
  }
  for pair in "spire-codex-backend|http://127.0.0.1:8000/health" "spire-codex-frontend|http://127.0.0.1:3000/robots.txt"; do
    name="${pair%%|*}"; url="${pair##*|}"
    if wait_ready "$name" "$url"; then
      log "✓ $name ready"
    else
      log "✗ $name not healthy, aborting before the nginx reload; check docker logs $name"
      exit 1
    fi
  done

  # nginx keeps its own small page cache (tier-list HTML) that a reload
  # never clears; drop it so no pre-deploy HTML outlives the swap there.
  docker exec web-server sh -c 'rm -rf /var/cache/nginx/pages/* 2>/dev/null' >> "$LOG" 2>&1 || true

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

# Cloudflare purge policy. Most page HTML is never edge-cached (private,
# no-store); entity detail pages are edge-cached with s-maxage=300 and a
# long stale-while-revalidate, so Cloudflare keeps serving them after a
# deploy and refreshes each within 5 minutes of its next visit. That is
# safe because every build's /_next/static chunks stay in the shared
# next-static volume and the Next deploymentId makes a client that crosses
# builds hard-reload. API JSON expires within its own s-maxage. So a code
# deploy purges nothing by default and nothing goes cold.
#
#   RECREATE=0 : news/beta-data-only commit — purge the handful of news
#                URLs whose content moved.
#   RECREATE=1 : code deploy — no purge, unless SPIRE_DEPLOY_PURGE=all is
#                set (or --purge-all is passed) for a deliberate full
#                purge, e.g. after an API response shape change.
PURGE_BODY=""
PURGE_WHAT=""
if [ "$RECREATE" = "1" ]; then
  if [ "${SPIRE_DEPLOY_PURGE:-}" = "all" ] || [ "${PURGE_ALL:-0}" = "1" ]; then
    PURGE_BODY='{"purge_everything":true}'
    PURGE_WHAT="everything (requested)"
  else
    log "  no CF purge: code deploy, edge stays warm (SPIRE_DEPLOY_PURGE=all to force)"
  fi
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
if [ -z "$PURGE_BODY" ]; then
  :
elif [ -f "$CF_ENV" ]; then
  # shellcheck source=/dev/null
  source "$CF_ENV"
  if [ -n "${CF_TOKEN:-}" ] && [ -n "${CF_ZONE:-}" ]; then
    PURGE_OUT=$(mktemp)
    HTTP=$(curl -s -o "$PURGE_OUT" -w '%{http_code}' \
      -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/purge_cache" \
      -H "Authorization: Bearer ${CF_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$PURGE_BODY")
    if [ "$HTTP" = "200" ] && grep -q '"success": *true' "$PURGE_OUT"; then
      log "✓ CF cache purged ($PURGE_WHAT)"
      PURGED=1
    else
      log "✗ CF purge returned $HTTP: $(cat "$PURGE_OUT")"
    fi
    rm -f "$PURGE_OUT"
  else
    log "⚠ $CF_ENV missing CF_TOKEN or CF_ZONE — skipping cache purge"
  fi
else
  log "⚠ $CF_ENV not found — skipping cache purge"
fi

# Only a deliberate full purge leaves the edge cold; re-warm the hot
# landing pages after one. Best-effort: warming is an optimization and
# must never fail the deploy. A normal code deploy purges nothing, so
# nothing needs warming and the frontend keeps its CPU for visitors.
if [ "$RECREATE" = "1" ] && [ "$PURGED" = "1" ] && [ "$PURGE_WHAT" != "news URLs only" ]; then
  log "  re-warming hot pages after full purge"
  if timeout 10m python3 "$REPO/tools/warm_cache.py" --hot >> "$LOG" 2>&1; then
    log "✓ warm crawl done (hot pages)"
  else
    log "⚠ warm crawl failed or timed out; continuing (pages warm on first visit)"
  fi
fi

log "==== deploy done ===="
