#!/bin/bash
# Manual deploy entrypoint.
#
#   ./tools/startup.sh             defer to the installed autodeploy script
#                                  (deploy no-ops when there's no new commit
#                                  on main)
#   ./tools/startup.sh release     force a full deploy NOW via autodeploy:
#                                  pull images, snapshot prewarm, recreate
#                                  backend+frontend, wait for health, nginx
#                                  reload - even when the commit didn't change.
#                                  No Cloudflare purge and no warm crawl:
#                                  the edge stays warm across deploys.
#   ./tools/startup.sh rollback    put the previous images back (the ones
#                                  running before the last deploy) without
#                                  touching git
#   ./tools/startup.sh --bypass    release entirely by hand: skip the
#                                  autodeploy script, leave git alone, and
#                                  just pull images + recreate backend and
#                                  frontend in place + reload nginx. No
#                                  reset to origin/main, no prewarm, no CF
#                                  purge - nothing automated touches the box
#                                  beyond the three deploy steps.
#
# The autodeploy script (installed via
# infrastructure/ansible/playbooks/install-autodeploy.yml) is the single
# implementation of the automated path; this wrapper only picks the mode.
set -e

MODE=""
BYPASS=0
for arg in "$@"; do
    case "$arg" in
        --bypass) BYPASS=1 ;;
        release) MODE="release" ;;
        rollback) MODE="rollback" ;;
    esac
done

if [ "$BYPASS" != "1" ] && [ -x /usr/local/bin/spire-codex-autodeploy ]; then
    if [ "$MODE" = "release" ]; then
        echo "forcing a full deploy via spire-codex-autodeploy --force"
        sudo /usr/local/bin/spire-codex-autodeploy --force
    elif [ "$MODE" = "rollback" ]; then
        echo "rolling back to the previous images via spire-codex-autodeploy --rollback"
        sudo /usr/local/bin/spire-codex-autodeploy --rollback
    else
        echo "delegating to spire-codex-autodeploy"
        sudo /usr/local/bin/spire-codex-autodeploy
    fi
    exit 0
fi

# Bypass mode, or the autodeploy script isn't installed: the raw deploy.
# In bypass the checkout is deliberately untouched - whatever you have
# checked out stays checked out; only the images and containers move.
if [ "$BYPASS" != "1" ]; then
    git pull
fi

# pull + force-recreate, never `down && up`: down removes every container
# including Redis, which wipes the response cache and serves a hard 502
# window while nothing is running. force-recreate swaps backend and
# frontend in place and leaves Redis (and its cache) untouched.
docker compose -f docker-compose.prod.yml pull backend frontend
docker compose -f docker-compose.prod.yml up -d --force-recreate backend frontend

# The rebuilder is RETIRED (2026-08-26): the lake ingest computes and
# serves everything it used to. Deploys must not resurrect it - its walks
# are exactly the multi-hour cost the lake replaced. Stop it if a manual
# start left it running; delete this block when the service leaves compose.
docker stop spire-codex-rebuilder 2>/dev/null || true

# Recreated containers get new IPs on the shared docker network, but nginx
# resolves upstream hostnames once at startup, so without a reload it keeps
# proxying to the old addresses and the whole site 502s (2026-06-11, and
# again 2026-06-12). Reload is zero-downtime and re-resolves every
# upstream. Best-effort: skip quietly when the web-server container isn't
# on this host.
docker exec web-server nginx -s reload 2>/dev/null \
    && echo "nginx reloaded" \
    || echo "nginx reload skipped (web-server not running here)"

# Warm every page in the background so the first visitor after this deploy
# never pays the first-render cost. The script waits for the site to come
# healthy, then crawls the sitemap plus every entity detail page (the
# on-demand ISR pages a deploy resets). Fire-and-forget on purpose: the
# deploy is done regardless of how the crawl goes; check the log if pages
# feel cold.
nohup python3 "$(dirname "$0")/warm_cache.py" --full \
    >/tmp/spire-warm-cache.log 2>&1 &
echo "cache warm crawl started in the background (log: /tmp/spire-warm-cache.log)"

if [ "$BYPASS" = "1" ]; then
    echo "bypass deploy done: images pulled, containers recreated, nginx reloaded."
    echo "skipped on purpose: git changes, snapshot prewarm, Cloudflare purge."
    echo "if pages look stale, purge from /admin -> Cache or the CF dashboard."
fi
