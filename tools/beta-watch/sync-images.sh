#!/usr/bin/env bash
# Mirror an extracted beta image tree into backend/static/images/beta/<VERSION>/
# so /images can show every art asset per-beta-version. Run as part of
# process.sh for every ingest, and once manually after a long stretch of
# missed syncs.
#
# Layout matches the per-version CATEGORIES dict in backend/app/routers/images.py:
#   backend/static/images/beta/<VERSION>/cards/      <- flattened card_portraits
#   backend/static/images/beta/<VERSION>/monsters/   <- monsters/
#   backend/static/images/beta/<VERSION>/misc/       <- ancients + backgrounds
#   backend/static/images/beta/<VERSION>/ui/         <- ui/ (recursive)
#   backend/static/images/beta/<VERSION>/vfx/        <- vfx/ (recursive)
#   backend/static/images/beta/latest -> v<VERSION>  (symlink, updated atomically)
#
# Usage:
#   VERSION=v0.106.0 ./sync-images.sh                            # default extraction dir
#   VERSION=v0.105.1 EXTRACT_DIR=/tmp/scratch/images ./sync-images.sh
#
# Idempotent — rsync --delete prunes anything Mega Crit cut between
# extractions, so beta/v0.106.0/cards/ never carries v0.105.x relic
# portraits that v0.106 removed.

set -euo pipefail

REPO="${SPIRE_REPO:-$(cd "$(dirname "$0")/../.." && pwd)}"
VERSION="${VERSION:-}"
EXTRACT="${EXTRACT_DIR:-$REPO/extraction/beta/raw/images}"

if [ -z "$VERSION" ]; then
  echo "VERSION env var required (e.g. v0.106.0)"
  exit 1
fi
case "$VERSION" in
  v*) ;;
  *) echo "VERSION must start with 'v' (got: $VERSION)"; exit 1 ;;
esac

if [ ! -d "$EXTRACT" ]; then
  echo "extraction missing at $EXTRACT — run process.sh first"
  exit 1
fi

DEST="$REPO/backend/static/images/beta/$VERSION"
LATEST_LINK="$REPO/backend/static/images/beta/latest"
mkdir -p "$DEST"

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

echo "==> syncing $VERSION into $DEST"

echo "==> cards: flattening card_portraits/**/*.png into $VERSION/cards/"
rm -rf "$DEST/cards" && mkdir -p "$DEST/cards"
find "$EXTRACT/packed/card_portraits" -name '*.png' ! -name '*.import' -type f 2>/dev/null | while IFS= read -r src; do
  name=$(basename "$src")
  case "$name" in
    beta.png|ancient_beta.png) continue ;;
  esac
  cp "$src" "$DEST/cards/$name"
done
echo "    cards: $(find "$DEST/cards" -name '*.png' | wc -l | tr -d ' ') files"

echo "==> monsters: copying monsters/ into $VERSION/monsters/"
mkdir -p "$DEST/monsters"
rsync -a --delete "${RSYNC_FILTER[@]}" "$EXTRACT/monsters/" "$DEST/monsters/"
echo "    monsters: $(find "$DEST/monsters" -name '*.png' | wc -l | tr -d ' ') files"

echo "==> misc: copying ancients/ + map/ + run_history/ into $VERSION/misc/"
rm -rf "$DEST/misc" && mkdir -p "$DEST/misc"
rsync -a "${RSYNC_FILTER[@]}" "$EXTRACT/ancients/" "$DEST/misc/" 2>/dev/null || true
if [ -d "$EXTRACT/map" ]; then
  rsync -a "${RSYNC_FILTER[@]}" "$EXTRACT/map/" "$DEST/misc/" 2>/dev/null || true
fi
# Ancient portraits (Neow, Darv, Orobas, Vakuu, etc.) live under
# `ui/run_history/` rather than `ancients/` — copy_images.py knows
# this; we used to miss it, which is how vakuu disappeared from
# /images after each sync.
if [ -d "$EXTRACT/ui/run_history" ]; then
  rsync -a "${RSYNC_FILTER[@]}" "$EXTRACT/ui/run_history/" "$DEST/misc/" 2>/dev/null || true
fi
echo "    misc: $(find "$DEST/misc" -name '*.png' | wc -l | tr -d ' ') files"

echo "==> ui: copying ui/ tree into $VERSION/ui/"
mkdir -p "$DEST/ui"
rsync -a --delete "${RSYNC_FILTER[@]}" "$EXTRACT/ui/" "$DEST/ui/"
echo "    ui: $(find "$DEST/ui" -name '*.png' | wc -l | tr -d ' ') files"

echo "==> vfx: copying vfx/ tree into $VERSION/vfx/"
mkdir -p "$DEST/vfx"
rsync -a --delete "${RSYNC_FILTER[@]}" "$EXTRACT/vfx/" "$DEST/vfx/"
echo "    vfx: $(find "$DEST/vfx" -name '*.png' | wc -l | tr -d ' ') files"

# Generate WebP siblings for every PNG. The parser's resolve_image_url
# checks for PNGs on disk but returns WebP URLs (frontend serves WebP
# for performance), so without this step the parser produces URLs that
# 404 in the browser. Quality 95 / method 6 matches copy_images.py.
gen_webps() {
  # Prefer cwebp (libwebp) — it's a small native tool that's reliable on
  # both arm64 macs (where Pillow's wheels frequently arch-mismatch) and
  # the linux backend container. Falls back to a Pillow one-liner if
  # cwebp is unavailable. quality=95 / method=6 mirrors copy_images.py.
  local dir="$1"
  if command -v cwebp >/dev/null 2>&1; then
    # Parallel: cwebp is single-threaded and each call has ~50ms of bash
    # overhead. xargs -P 8 brings 2,000-file syncs from ~5 minutes down
    # to under a minute. Prune Mac Finder duplicate directories
    # (`relics 2`, `cards 3`, …) and skip duplicate filenames (`foo
    # 2.png`) — they explode work without producing anything the parser
    # would look up. The inner shell skips files that already have a
    # fresh sibling webp.
    local pre=$(find "$dir" -type d -name '* [0-9]' -prune -o \
                            -type f -name '*.webp' ! -name '* [0-9].webp' -print | wc -l | tr -d ' ')
    find "$dir" -type d -name '* [0-9]' -prune -o \
                -type f -name '*.png' ! -name '* [0-9].png' -print0 \
    | xargs -0 -n 1 -P 8 sh -c '
        png="$0"
        webp="${png%.png}.webp"
        if [ -f "$webp" ] && [ "$webp" -nt "$png" ]; then exit 0; fi
        cwebp -q 95 -m 6 -quiet "$png" -o "$webp" 2>/dev/null
      '
    local post=$(find "$dir" -type d -name '* [0-9]' -prune -o \
                             -type f -name '*.webp' ! -name '* [0-9].webp' -print | wc -l | tr -d ' ')
    echo "    webp generated: $((post-pre)) (total: $post)"
    return
  fi
  echo "    cwebp unavailable, falling back to Pillow"
  python3 - "$dir" <<'PY'
import sys
from pathlib import Path
try:
    from PIL import Image
except ImportError as e:
    print(f"  ! Pillow not available: {e}")
    sys.exit(0)
root = Path(sys.argv[1])
made = 0
for png in root.rglob("*.png"):
    webp = png.with_suffix(".webp")
    try:
        if webp.exists() and webp.stat().st_mtime >= png.stat().st_mtime:
            continue
        with Image.open(png) as img:
            img.convert("RGBA").save(webp, "WEBP", quality=95, method=6)
        made += 1
    except Exception as e:
        print(f"  ! webp fail {png.name}: {e}")
print(f"    webp generated: {made}")
PY
}

# Entity types whose images parser_paths.resolve_image_url looks for at
# `backend/static/images/beta/<VERSION>/<type>/<name>.png`. Each extracts
# from a top-level subdir of EXTRACT plus an optional `beta/` subfolder
# (Mega Crit stages newly-introduced art there for the duration of a
# Steam beta). We flatten both into one per-version dir so the parser's
# stem-based lookup finds them without any path tricks.
for type in relics potions powers enchantments; do
  if [ ! -d "$EXTRACT/$type" ]; then
    echo "==> $type: skipping (no $EXTRACT/$type)"
    continue
  fi
  echo "==> $type: flattening $EXTRACT/$type into $VERSION/$type/"
  rm -rf "$DEST/$type" && mkdir -p "$DEST/$type"
  find "$EXTRACT/$type" -maxdepth 2 -name '*.png' -type f \
    ! -name '* [0-9].png' ! -name '*.import.png' 2>/dev/null \
    | while IFS= read -r src; do
        cp "$src" "$DEST/$type/$(basename "$src")"
      done
  echo "    $type: $(find "$DEST/$type" -name '*.png' | wc -l | tr -d ' ') files"
done

echo "==> generating WebP companions across all types"
gen_webps "$DEST"

# Atomically swing the `latest` symlink to this version. ln -sfn replaces
# an existing symlink without leaving a window where it points at nothing.
echo "==> updating latest -> $VERSION"
ln -sfn "$VERSION" "$LATEST_LINK"

echo "==> done"
