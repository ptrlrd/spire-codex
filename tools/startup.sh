#!/bin/bash
# Manual deploy entrypoint.
#
#   ./tools/startup.sh           defer to the installed autodeploy script
#                                (no-op when there's no new commit on main)
#   ./tools/startup.sh release   force a full deploy NOW: pull images,
#                                snapshot prewarm, recreate backend+frontend,
#                                nginx reload, Cloudflare purge - even when
#                                the commit didn't change (rebuilt image,
#                                post-incident recovery, ...)
#
# The autodeploy script (installed via
# infrastructure/ansible/playbooks/install-autodeploy.yml) is the single
# implementation; this wrapper only picks the mode. The fallback below is
# the bare-minimum safe sequence for a box where it isn't installed yet.
set -e

MODE="${1:-}"

if [ -x /usr/local/bin/spire-codex-autodeploy ]; then
    if [ "$MODE" = "release" ]; then
        echo "forcing a full deploy via spire-codex-autodeploy --force"
        exec sudo /usr/local/bin/spire-codex-autodeploy --force
    fi
    echo "delegating to spire-codex-autodeploy"
    exec sudo /usr/local/bin/spire-codex-autodeploy
fi

# Fallback (autodeploy not installed): always a full deploy.
git pull

# pull + force-recreate, never `down && up`: down removes every container
# including Redis, which wipes the response cache and serves a hard 502
# window while nothing is running. force-recreate swaps backend and
# frontend in place and leaves Redis (and its cache) untouched.
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --force-recreate backend frontend

# Recreated containers get new IPs on the shared docker network, but nginx
# resolves upstream hostnames once at startup, so without a reload it keeps
# proxying to the old addresses and the whole site 502s (2026-06-11, and
# again 2026-06-12). Reload is zero-downtime and re-resolves every
# upstream. Best-effort: skip quietly when the web-server container isn't
# on this host.
docker exec web-server nginx -s reload 2>/dev/null \
    && echo "nginx reloaded" \
    || echo "nginx reload skipped (web-server not running here)"
