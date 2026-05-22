#!/usr/bin/env bash
# Mirror extraction/beta/raw/images/ -> backend/static/images/beta/ so the
# /images page surfaces every art asset in the current beta cycle. Run
# as part of process.sh for every ingest, and once manually after a long
# stretch of missed syncs.
#
# Layout matches the CATEGORIES dict in backend/app/routers/images.py:
#   backend/static/images/beta/cards/       <- flattened card_portraits
#   backend/static/images/beta/monsters/    <- monsters/
#   backend/static/images/beta/misc/        <- ancients + backgrounds
#   backend/static/images/beta/ui/          <- ui/ (recursive)
#   backend/static/images/beta/vfx/         <- vfx/ (recursive)
#
# Idempotent — rsync handles updates, deletes Mac dupes, and removes
# files the new patch cut. --delete is critical: if Mega Crit removed
# Doormaker portrait, this clears the stale file.

set -euo pipefail

REPO="${SPIRE_REPO:-$(cd "$(dirname "$0")/../.." && pwd)}"
EXTRACT="$REPO/extraction/beta/raw/images"
DEST="$REPO/backend/static/images/beta"

if [ ! -d "$EXTRACT" ]; then
  echo "extraction missing at $EXTRACT — run process.sh first"
  exit 1
fi

# rsync filter: include images, exclude Godot import metadata + Mac dupes.
RSYNC_FILTER=(
  --include='*.png'
  --include='*.webp'
  --include='*.jpg'
  --include='*.gif'
  --include='*/'                # follow directories
  --exclude='*.png.import'
  --exclude='*.import'
  --exclude='*.tpsheet'
  --exclude='* [0-9].png'       # Mac Finder dupes: "abrasive 2.png"
  --exclude='* [0-9].webp'
  --exclude='* [0-9]'           # Mac Finder dupe dirs: "cards 2"
  --exclude='*'                  # exclude everything else
)

echo "==> cleaning Mac Finder dupes in destination"
find "$DEST" \( -name '* [0-9].png' -o -name '* [0-9].webp' -o -name '* [0-9]' \) -print -delete 2>/dev/null | head -20 || true

echo "==> cards: flattening card_portraits/**/*.png into beta/cards/"
mkdir -p "$DEST/cards"
# Cards are organized by character subdir in extraction; flatten to <name>.png
find "$EXTRACT/packed/card_portraits" -name '*.png' ! -name '*.import' -type f 2>/dev/null | while IFS= read -r src; do
  name=$(basename "$src")
  # Skip ancient/colorless container art that isn't a real card portrait
  case "$name" in
    beta.png|ancient_beta.png) continue ;;
  esac
  cp "$src" "$DEST/cards/$name"
done
echo "    cards: $(find "$DEST/cards" -name '*.png' | wc -l | tr -d ' ') files"

echo "==> monsters: copying monsters/ to beta/monsters/"
mkdir -p "$DEST/monsters"
rsync -a --delete "${RSYNC_FILTER[@]}" "$EXTRACT/monsters/" "$DEST/monsters/"
echo "    monsters: $(find "$DEST/monsters" -name '*.png' | wc -l | tr -d ' ') files"

echo "==> misc: copying ancients/ + selected backgrounds to beta/misc/"
mkdir -p "$DEST/misc"
# Ancients
rsync -a "${RSYNC_FILTER[@]}" "$EXTRACT/ancients/" "$DEST/misc/" 2>/dev/null || true
# Static room backgrounds
if [ -d "$EXTRACT/map" ]; then
  rsync -a "${RSYNC_FILTER[@]}" "$EXTRACT/map/" "$DEST/misc/" 2>/dev/null || true
fi
echo "    misc: $(find "$DEST/misc" -name '*.png' | wc -l | tr -d ' ') files"

echo "==> ui: copying ui/ tree to beta/ui/ (recursive)"
mkdir -p "$DEST/ui"
rsync -a --delete "${RSYNC_FILTER[@]}" "$EXTRACT/ui/" "$DEST/ui/"
echo "    ui: $(find "$DEST/ui" -name '*.png' | wc -l | tr -d ' ') files"

echo "==> vfx: copying vfx/ tree to beta/vfx/ (recursive)"
mkdir -p "$DEST/vfx"
rsync -a --delete "${RSYNC_FILTER[@]}" "$EXTRACT/vfx/" "$DEST/vfx/"
echo "    vfx: $(find "$DEST/vfx" -name '*.png' | wc -l | tr -d ' ') files"

echo "==> done"
