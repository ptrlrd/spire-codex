#!/bin/bash
set -e

git pull

if [ "$1" = "--beta" ]; then
    # Start both prod and beta
    docker compose -f docker-compose.prod.yml pull
    docker compose -f docker-compose.prod.yml down
    docker compose -f docker-compose.prod.yml up -d

    docker compose -f docker-compose.beta.yml pull
    docker compose -f docker-compose.beta.yml down
    docker compose -f docker-compose.beta.yml up -d
elif [ "$1" = "--beta-only" ]; then
    # Start only beta
    docker compose -f docker-compose.beta.yml pull
    docker compose -f docker-compose.beta.yml down
    docker compose -f docker-compose.beta.yml up -d
else
    # Start only prod (default)
    docker compose -f docker-compose.prod.yml pull
    docker compose -f docker-compose.prod.yml down
    docker compose -f docker-compose.prod.yml up -d
fi

# Recreated containers get new IPs on the shared docker network, but nginx
# resolves upstream hostnames once at startup, so without a reload it keeps
# proxying to the old addresses (beta 502'd this way on 2026-06-11). Reload is
# zero-downtime and re-resolves every upstream. Best-effort: skip quietly when
# the web-server container isn't on this host.
docker exec web-server nginx -s reload 2>/dev/null \
    && echo "nginx reloaded" \
    || echo "nginx reload skipped (web-server not running here)"
