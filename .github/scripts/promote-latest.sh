#!/usr/bin/env bash
# Usage: promote-latest.sh <image> <path>
# Points <image>:latest at <image>:$GITHUB_SHA unless main already has a
# newer commit touching <path>, so a slow build of an older commit can't
# overwrite :latest after a newer one pushed it.
set -euo pipefail

image="$1"
path="$2"

git fetch --no-tags --quiet --depth=200 origin main
newer=$(git log -1 --format=%H "$GITHUB_SHA..FETCH_HEAD" -- "$path")
if [ -n "$newer" ]; then
  echo "main has a newer $path commit (${newer:0:8}), leaving $image:latest to its build"
  exit 0
fi
docker buildx imagetools create -t "$image:latest" "$image:$GITHUB_SHA"
echo "$image:latest -> ${GITHUB_SHA:0:8}"
