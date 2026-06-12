#!/bin/bash
# Manual deploy entrypoint. When the autodeploy script is installed (via
# infrastructure/ansible/playbooks/install-autodeploy.yml) this defers to
# it, because that path also has the news/data-beta hot-reload short
# circuit, the stats snapshot prewarm, a post-deploy health check, and the
# Cloudflare cache purge. The fallback below is the bare-minimum safe
# sequence for a box where the cron isn't installed yet.
set -e

if [ -x /usr/local/bin/spire-codex-autodeploy ]; then
    echo "delegating to spire-codex-autodeploy"
    exec sudo /usr/local/bin/spire-codex-autodeploy
fi

git pull

# pull + force-recreate, never `down && up`: down removes every container
# including Redis, which wipes the response cache and serves a hard 502
# window while nothing is running. force-recreate swaps backend and
# frontend in place and leaves Redis (and its cache) untouched.
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --force-recreate backend frontend

# Recreated containers get new IPs on the shared docker network, but nginx
# resolves upstream hostnames once at startup, so without a reload it keeps
# proxying to the old addresses (beta 502'd this way on 2026-06-11). Reload is
# zero-downtime and re-resolves every upstream. Best-effort: skip quietly when
# the web-server container isn't on this host.
docker exec web-server nginx -s reload 2>/dev/null \
    && echo "nginx reloaded" \
    || echo "nginx reload skipped (web-server not running here)"
