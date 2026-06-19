#!/usr/bin/env bash
# convert-cards.sh <png-dir> <webp-out-dir>
# Walks the whole tree recursively, preserving relative paths, so language
# subdirs (jpn/, zhs/, ...) AND enchanted subdirs (ench/<ench>/, and
# <lang>/ench/<ench>/) all convert without per-layout special-casing.
# (Verbatim from GENERATING_CARD_RENDERS.md section 5.)
set -euo pipefail
SRC="${1:?usage: convert-cards.sh <png-dir> <webp-out-dir>}"
OUT="${2:?}"
SRC="${SRC%/}"; OUT="${OUT%/}"

# Animated ancients: any <rel>.f0.png -> assemble all its frames into one webp.
find "$SRC" -type f -name '*.f0.png' | while read -r f0; do
  rel="${f0#"$SRC"/}"; base="${rel%.f0.png}"
  mkdir -p "$OUT/$(dirname "$base")"
  mapfile -t frames < <(ls "$SRC/$base".f*.png | sort -t. -k2.2 -n)
  img2webp -loop 0 -lossy -q 90 -d 100 "${frames[@]}" -o "$OUT/$base.webp" >/dev/null
done

# Static cards: every <rel>.png that isn't an animation frame.
find "$SRC" -type f -name '*.png' ! -name '*.f[0-9]*.png' | while read -r f; do
  rel="${f#"$SRC"/}"; base="${rel%.png}"
  mkdir -p "$OUT/$(dirname "$base")"
  cwebp -q 90 -alpha_q 100 "$f" -o "$OUT/$base.webp" >/dev/null
done
echo "converted -> $OUT"
