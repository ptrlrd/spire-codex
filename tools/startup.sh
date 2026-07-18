#!/bin/bash
# Manual deploy entrypoint.
#
#   ./tools/startup.sh             defer to the installed autodeploy script
#                                  (deploy no-ops when there's no new commit
#                                  on main), then start the full warm crawl
#                                  in the background
#   ./tools/startup.sh release     force a full deploy NOW via autodeploy:
#                                  pull images, snapshot prewarm, recreate
#                                  backend+frontend, nginx reload, Cloudflare
#                                  purge - even when the commit didn't change
#                                  - then the background warm crawl
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
    esac
done

if [ "$BYPASS" != "1" ] && [ -x /usr/local/bin/spire-codex-autodeploy ]; then
    if [ "$MODE" = "release" ]; then
        echo "forcing a full deploy via spire-codex-autodeploy --force"
        sudo /usr/local/bin/spire-codex-autodeploy --force
    else
        echo "delegating to spire-codex-autodeploy"
        sudo /usr/local/bin/spire-codex-autodeploy
    fi
    # set -e: reaching this line means autodeploy exited 0 (a same-commit
    # tick no-ops and still exits 0); on failure we exit with its status
    # and skip the crawl. Historically these were `exec` calls, which
    # replaced the shell and made the warm crawl below unreachable in the
    # automated path. Autodeploy re-warms the hot landing pages itself
    # after a full purge; this --full crawl adds the entity detail pages
    # (the on-demand ISR pages a container recreate resets).
    nohup python3 "$(dirname "$0")/warm_cache.py" --full \
        >/tmp/spire-warm-cache.log 2>&1 &
    echo "cache warm crawl started in the background (log: /tmp/spire-warm-cache.log)"
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

# The rebuilder gets its own `up` WITHOUT --force-recreate: compose then
# only recreates it when the backend image actually changed. A frontend or
# data-only deploy leaves it untouched, so the multi-hour snapshot walk
# survives - recreating it on every deploy is exactly how the snapshot
# sat stale for days. Never drop this line: a rebuilder abandoned on an
# old image would keep writing old-version snapshots forever.
docker compose -f docker-compose.prod.yml up -d rebuilder

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
