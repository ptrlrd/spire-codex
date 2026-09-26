#!/bin/sh
set -e
STATIC=/app/.next/static
BUILD=/app/static-build
if [ -d "$BUILD" ]; then
  mkdir -p "$STATIC"
  cp -R "$BUILD"/. "$STATIC"/
  find "$STATIC" -mindepth 1 -type f -mtime +30 -delete
  find "$STATIC" -mindepth 1 -type d -empty -delete
fi
exec "$@"
