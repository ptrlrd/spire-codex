#!/usr/bin/env bash
# Thin wrapper: build (if needed) and run one render pass.
#
#   STEAM_USER=... STEAM_PASS=... MOD_ID=watcher RENDER_PREFIX=WATCHER- ./run.sh
#
# First run is interactive for Steam Guard: add STEAM_GUARD=XXXXX. The auth is
# cached in the steam-data volume, so later runs don't need it.
# Add DO_UPLOAD=1 (with an [r2] aws profile in ~/.aws) to push to the CDN.
set -euo pipefail
cd "$(dirname "$0")"

: "${STEAM_USER:?set STEAM_USER}"
: "${STEAM_PASS:?set STEAM_PASS}"
export MOD_ID="${MOD_ID:-watcher}"
export RENDER_PREFIX="${RENDER_PREFIX:-WATCHER-}"

mkdir -p mods out out_webp
if [ ! -d mods/BaseLib ]; then
  echo "NOTE: ./mods/BaseLib not found. Place BaseLib/ and the content mod (e.g. WatcherMod/)"
  echo "      into ./mods/ before running, e.g. copy them from the game's mods folder."
fi

docker compose run --rm render
echo "Output: ./out (png) and ./out_webp (webp)."
