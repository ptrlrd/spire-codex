#!/usr/bin/env bash
# Build (if needed) and run one render pass.
#
# Steam credentials and run config come from .env (copy .env.example to .env).
# docker compose auto-loads it. Inline env still overrides for one-offs, e.g.:
#   RENDER_LANGS="eng,deu,jpn" DO_UPLOAD=1 ./run.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "ERROR: no .env here. Copy .env.example to .env and set STEAM_USER / STEAM_PASS."
  exit 1
fi

mkdir -p mods out out_webp
if [ ! -d mods/BaseLib ]; then
  echo "NOTE: ./mods/BaseLib not found. Stage BaseLib/ and the content mod (e.g. Watcher/) into ./mods/."
fi

docker compose run --build --rm render
echo "Output: ./out (png) and ./out_webp (webp)."
