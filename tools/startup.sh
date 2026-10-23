#!/bin/bash
# Manual deploy entrypoint.
#
#   ./tools/startup.sh             defer to the installed autodeploy script
#                                  (deploy no-ops when there's no new commit
#                                  on main)
#   ./tools/startup.sh release     force a full deploy NOW via autodeploy:
#                                  pull images, recreate
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
#                                  frontend in place, wait for their
#                                  healthchecks, reload nginx. No reset to
#                                  origin/main, no CF purge, no
#                                  warm crawl.
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
    LOG=/var/log/spire-codex-autodeploy.log
    SCRIPT_SRC="$(cd "$(dirname "$0")/.." && pwd)/infrastructure/ansible/files/autodeploy.sh"
    if ! cmp -s "$SCRIPT_SRC" /usr/local/bin/spire-codex-autodeploy; then
        echo "installing the checkout's autodeploy script"
        sudo install -m 755 "$SCRIPT_SRC" /usr/local/bin/spire-codex-autodeploy
    fi
    run_and_follow() {
        sudo touch "$LOG"
        sudo tail -n 0 -f "$LOG" &
        local tail_pid=$!
        sudo /usr/local/bin/spire-codex-autodeploy "$@"
        local rc=$?
        sleep 1
        sudo pkill -P "$tail_pid" 2>/dev/null
        sudo kill "$tail_pid" 2>/dev/null
        wait "$tail_pid" 2>/dev/null
        return $rc
    }
    if [ "$MODE" = "release" ]; then
        echo "forcing a full deploy via spire-codex-autodeploy --force"
        run_and_follow --force
    elif [ "$MODE" = "rollback" ]; then
        echo "rolling back to the previous images via spire-codex-autodeploy --rollback"
        run_and_follow --rollback
    else
        echo "delegating to spire-codex-autodeploy"
        run_and_follow
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
for img in ptrlrd/spire-codex-backend ptrlrd/spire-codex-frontend; do
    id=$(docker image inspect --format '{{.Id}}' "$img:latest" 2>/dev/null || true)
    [ -n "$id" ] && docker tag "$id" "$img:previous" || true
done
docker compose -f docker-compose.prod.yml pull backend frontend
docker compose -f docker-compose.prod.yml up -d --force-recreate backend frontend

# Wait for both healthchecks before nginx re-resolves the new container
# addresses; reloading onto a booting container is the 502 window.
for name in spire-codex-backend spire-codex-frontend; do
    for i in $(seq 1 60); do
        st=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name" 2>/dev/null)
        [ "$st" = "healthy" ] && break
        sleep 2
    done
    echo "$name: ${st:-missing}"
done

# Recreated containers get new IPs on the shared docker network; nginx
# re-resolves them on reload. Best-effort: skip quietly when the
# web-server container isn't on this host.
docker exec web-server sh -c 'rm -rf /var/cache/nginx/pages/* 2>/dev/null' 2>/dev/null || true
docker exec web-server nginx -s reload 2>/dev/null \
    && echo "nginx reloaded" \
    || echo "nginx reload skipped (web-server not running here)"
