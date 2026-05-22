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

# --- 6. Parse all 14 languages into data-beta/$VERSION/ ---
(cd "$REPO/backend/app/parsers" && \
  EXTRACTION_DIR="$REPO/extraction/beta" \
  DATA_DIR="$DATA_OUT" \
  python3 parse_all.py)

# --- 6a. Sync new images into backend/static/images/beta/. The /images
# page is a monetization surface, so dragging stale assets between
# patches costs traffic + trust. sync-images mirrors every image
# category and prunes anything Mega Crit cut.
"$REPO/tools/beta-watch/sync-images.sh"

# --- 7. Diff against the previous beta to make a changelog ---
PREV=$(ls -1d "$REPO/data-beta"/v*/ 2>/dev/null | grep -v "/$VERSION/" \
       | sort -V | tail -1 | sed 's:/$::' | xargs -n1 basename || true)
if [ -n "$PREV" ]; then
  python3 "$REPO/tools/diff_data.py" \
    "$REPO/data-beta/$PREV/eng" \
    "$DATA_OUT/eng" \
    --format json \
    --output-dir "$DATA_OUT/changelogs" \
    --game-version "$VERSION" \
    --title "Beta $VERSION"
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
