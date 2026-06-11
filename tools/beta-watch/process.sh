#!/usr/bin/env bash
# Pipeline: takes a freshly-downloaded StS2 beta install, extracts assets,
# decompiles the DLL, parses data, generates a changelog, commits to a
# new branch, and opens a PR. Stateless — every input comes from env vars
# so this can be called by watch.sh or invoked manually.
#
# Required env vars (passed by watch.sh):
#   BUILDID        — Steam buildid of the new beta (used in the branch name)
#   DOWNLOAD_DIR   — where SteamCMD wrote the install (contains the .pck/.dll)
#   REPO           — absolute path to the spire-codex working tree
#
# Outputs (state files in $STATE_DIR for watch.sh to pick up):
#   $STATE_DIR/last-pr-url   — URL of the opened PR
#   $STATE_DIR/last-version  — game version string (e.g. v0.105.0)

set -euo pipefail

: "${BUILDID:?BUILDID env var required}"
: "${DOWNLOAD_DIR:?DOWNLOAD_DIR env var required}"
: "${REPO:?REPO env var required}"

STATE_DIR="${SPIRE_STATE_DIR:-$HOME/.spire-codex/beta-watch}"
mkdir -p "$STATE_DIR"

cd "$REPO"

# --- 1. Locate the game's .pck and .dll inside the SteamCMD download ---
# On macOS the Godot project is bundled inside the .app; on Linux/Windows
# it's a sibling file. Probe both.
APP_DIR=$(find "$DOWNLOAD_DIR" -maxdepth 3 -name "*.app" -type d | head -1)
if [ -n "$APP_DIR" ]; then
  PCK=$(find "$APP_DIR/Contents/Resources" -maxdepth 2 -name "*.pck" 2>/dev/null | head -1)
  DLL=$(find "$APP_DIR/Contents/Resources" -maxdepth 3 -name "sts2.dll" 2>/dev/null | head -1)
else
  PCK=$(find "$DOWNLOAD_DIR" -maxdepth 3 -name "*.pck" 2>/dev/null | head -1)
  DLL=$(find "$DOWNLOAD_DIR" -maxdepth 5 -name "sts2.dll" 2>/dev/null | head -1)
fi

[ -f "$PCK" ] || { echo "could not locate .pck under $DOWNLOAD_DIR"; exit 1; }
[ -f "$DLL" ] || { echo "could not locate sts2.dll under $DOWNLOAD_DIR"; exit 1; }
echo "found pck=$PCK"
echo "found dll=$DLL"

# --- 2. Run Godot RE Tools to extract assets ---
GDRE="/Applications/Godot RE Tools.app/Contents/MacOS/Godot RE Tools"
[ -x "$GDRE" ] || { echo "Godot RE Tools not at $GDRE"; exit 1; }

rm -rf "$REPO/extraction/beta/raw"
mkdir -p "$REPO/extraction/beta/raw" "$REPO/extraction/beta/archives"
"$GDRE" --headless "--recover=$PCK" "--output=$REPO/extraction/beta/raw" >/dev/null

# --- 3. Decompile the DLL ---
rm -rf "$REPO/extraction/beta/decompiled"
mkdir -p "$REPO/extraction/beta/decompiled"
~/.dotnet/tools/ilspycmd -p -o "$REPO/extraction/beta/decompiled" "$DLL"

# --- 4. Detect the game version string ---
# The version lives in either Project Settings or a constant in the DLL.
# Simplest path: grep the decompiled C# for a version literal. Falls back
# to the buildid if that pattern moves.
VERSION=$(grep -hroE '"[vV]?[0-9]+\.[0-9]+\.[0-9]+"' \
             "$REPO/extraction/beta/decompiled" 2>/dev/null \
          | tr -d '"' | sort -u | head -1)
[ -z "$VERSION" ] && VERSION="b$BUILDID"
[[ "$VERSION" != v* ]] && VERSION="v$VERSION"
echo "detected version: $VERSION"
echo "$VERSION" > "$STATE_DIR/last-version"

DATA_OUT="$REPO/data-beta/$VERSION"
if [ -d "$DATA_OUT" ]; then
  echo "data-beta/$VERSION already exists — was the buildid mismatched?"
  exit 1
fi

# --- 5. Archive the raw .dll + .pck so we can DepotDownload this build later ---
cp "$DLL" "$REPO/extraction/beta/archives/sts2-$VERSION.dll"
cp "$PCK" "$REPO/extraction/beta/archives/sts2-$VERSION.pck"

# --- 6. Sync new images into backend/static/images/beta/. The /images
# page is a monetization surface, so dragging stale assets between
# patches costs traffic + trust. sync-images mirrors every image
# category and prunes anything Mega Crit cut.
#
# This MUST run before parse_all: resolve_image_url checks the
# per-version beta tree first, so parsing against an empty tree made
# beta-only entities (Aeonglass) fall through to main-tree image paths
# that don't exist on the CDN until the beta promotes.
"$REPO/tools/beta-watch/sync-images.sh"

# The previous beta version, used for the R2 copy-forward below, the
# changelog diff, and the render list.
PREV=$(ls -1d "$REPO/data-beta"/v*/ 2>/dev/null | grep -v "/$VERSION/" \
       | sort -V | tail -1 | sed 's:/$::' | xargs -n1 basename || true)

# --- 6a. Push the per-version image tree to R2 so beta art serves from
# the CDN (images don't belong in static; the catalogs' /static/images/
# paths are rewritten to cdn.spire-codex.com by the frontend). Only the
# .webp files upload - that's the format every served URL points at.
# Uses the same aws r2 profile as GENERATING_CARD_RENDERS.md; skipped
# loudly if it isn't configured so a local run still works end to end.
#
# Cost control: most art is identical between betas, so the previous
# version's prefix is copied forward SERVER-SIDE first (no local
# bandwidth), then the local sync uploads only real deltas. --size-only
# because the freshly rsync'd local mtimes always look newer than the
# copied objects, which would otherwise re-upload the whole tree every
# beta; a changed webp with a byte-identical size is vanishingly rare.
R2_ENDPOINT="${R2_ENDPOINT:-https://468b7c5ddc132dda4c2ac43391f06dfb.r2.cloudflarestorage.com}"
if command -v aws >/dev/null 2>&1 && aws configure list --profile r2 >/dev/null 2>&1; then
  if [ -n "$PREV" ]; then
    echo "==> R2: copying beta/$PREV/ forward to beta/$VERSION/ (server-side)"
    aws --profile r2 s3 sync "s3://spire-codex/beta/$PREV/" "s3://spire-codex/beta/$VERSION/" \
      --endpoint-url "$R2_ENDPOINT" >/dev/null
  fi
  echo "==> R2: uploading the delta for beta/$VERSION/"
  aws --profile r2 s3 sync "$REPO/backend/static/images/beta/$VERSION/" \
    "s3://spire-codex/beta/$VERSION/" \
    --endpoint-url "$R2_ENDPOINT" \
    --exclude "*" --include "*.webp" \
    --content-type image/webp \
    --size-only --delete
else
  echo "WARN: aws r2 profile not configured; beta images NOT pushed to the CDN" >&2
fi

# --- 6b. Parse all 14 languages into data-beta/$VERSION/ ---
(cd "$REPO/backend/app/parsers" && \
  EXTRACTION_DIR="$REPO/extraction/beta" \
  DATA_DIR="$DATA_OUT" \
  python3 parse_all.py)

# --- 7. Diff against the previous beta to make a changelog ---
if [ -n "$PREV" ]; then
  python3 "$REPO/tools/diff_data.py" \
    "$REPO/data-beta/$PREV/eng" \
    "$DATA_OUT/eng" \
    --format json \
    --output-dir "$DATA_OUT/changelogs" \
    --game-version "${VERSION#v}" \
    --title "Beta $VERSION"
fi

# --- 7a. List the cards whose renders need regenerating (added or changed
# vs the previous beta, ignoring image/url fields that move every version).
# The injection export trigger (GENERATING_CARD_RENDERS.md) accepts this
# list, so a render pass only redoes these instead of the full catalog x
# 14 languages x enchant matrix. Unchanged renders copy forward on R2:
#   aws --profile r2 s3 sync s3://spire-codex/cards-full/beta/<prev>/ \
#     s3://spire-codex/cards-full/beta/<new>/ --endpoint-url "$R2_ENDPOINT"
if [ -n "$PREV" ] && [ -f "$REPO/data-beta/$PREV/eng/cards.json" ]; then
  python3 - "$REPO/data-beta/$PREV/eng/cards.json" "$DATA_OUT/eng/cards.json" \
    > "$DATA_OUT/render-cards.txt" <<'PY'
import json, re, sys

NOISE = re.compile(r"image|url", re.I)

def strip(card):
    return {k: v for k, v in card.items() if not NOISE.search(k)}

prev = {c["id"]: strip(c) for c in json.load(open(sys.argv[1]))}
new = {c["id"]: strip(c) for c in json.load(open(sys.argv[2]))}
ids = sorted(cid.lower() for cid, c in new.items() if prev.get(cid) != c)
print(",".join(ids))
PY
  echo "==> cards needing new renders: $(cat "$DATA_OUT/render-cards.txt" | tr ',' '\n' | grep -c . || true) (list in data-beta/$VERSION/render-cards.txt)"
fi

# --- 8. Repoint the `latest` symlink ---
(cd "$REPO/data-beta" && rm -f latest && ln -sf "$VERSION" latest)

# --- 9. Branch, commit, push, open PR ---
BRANCH="auto/beta-$VERSION"
cd "$REPO"
git fetch origin main --quiet
git checkout -B "$BRANCH" origin/main

git add data-beta/ extraction/beta/archives/ 2>/dev/null || true
git commit -m "Auto: ingest beta $VERSION (buildid $BUILDID)" || {
  echo "nothing to commit (data-beta already up to date?)"; exit 1;
}
git push -u origin "$BRANCH" --quiet

PR_URL=$(gh pr create \
  --title "Auto: ingest beta $VERSION" \
  --body "Detected new Steam beta build \`$BUILDID\` and parsed it into \`data-beta/$VERSION/\`.

**Source manifest:** $BUILDID
**Game version:** $VERSION
**Diff base:** \`$PREV\`

This PR was opened by \`tools/beta-watch/watch.sh\`. Smoke-check the changelog files under \`data-beta/$VERSION/changelogs/\` before merging — a game schema change can sometimes produce empty or malformed diffs that need a parser fix first." \
  2>&1 | tail -1)

echo "$PR_URL" > "$STATE_DIR/last-pr-url"
echo "opened $PR_URL"
