#!/usr/bin/env bash
set -euo pipefail

image="$1"
path="$2"

git fetch --no-tags --quiet --depth=200 origin main
for newer in $(git log --format=%H "$GITHUB_SHA..FETCH_HEAD" -- "$path"); do
  if docker buildx imagetools inspect "$image:$newer" >/dev/null 2>&1; then
    echo "::notice::$image:${newer:0:8} is newer and already pushed, leaving $image:latest alone"
    exit 0
  fi
done
docker buildx imagetools create -t "$image:latest" "$image:$GITHUB_SHA"
echo "$image:latest -> ${GITHUB_SHA:0:8}"
