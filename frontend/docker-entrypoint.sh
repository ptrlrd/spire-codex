#!/bin/sh
set -e
STATIC=/app/.next/static
BUILD=/app/static-build
if [ -d "$BUILD" ]; then
  mkdir -p "$STATIC"
  cp -R "$BUILD"/. "$STATIC"/
  find "$STATIC" -type f -mtime +30 -delete 2>/dev/null || true
  find "$STATIC" -type d -empty -delete 2>/dev/null || true
fi
exec node server.js
