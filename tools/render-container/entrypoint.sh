#!/usr/bin/env bash
# Headless StS2 mod-card render pipeline entrypoint.
#
# 1. steamcmd installs the native Linux game.
# 2. Stage BaseLib + the content mod + the RenderExporter mod into <game>/mods.
# 3. Launch the game under Xvfb + software GL; the exporter renders cards to /out.
# 4. Wait for the _all_done.txt sentinel, then stop the game.
# 5. Convert PNG -> webp and (optionally) upload to R2 at cards-full/mods/<MOD_ID>/.
set -euo pipefail

# ---- config (env) -----------------------------------------------------------
: "${STEAM_USER:?set STEAM_USER (an account that owns app 2868840)}"
: "${STEAM_PASS:?set STEAM_PASS}"
: "${MOD_ID:?set MOD_ID (the content mod id, e.g. watcher; also the CDN prefix)}"
STEAM_GUARD="${STEAM_GUARD:-}"
STEAM_BETA="${STEAM_BETA:-public-beta}"          # branch to install; "" for default
RENDER_PREFIX="${RENDER_PREFIX:-}"               # e.g. WATCHER- to render ONLY the mod's cards
RENDER_CARDS="${RENDER_CARDS:-all}"
RENDER_LANGS="${RENDER_LANGS:-}"                 # empty = English only
RENDER_ENCH="${RENDER_ENCH:-0}"
RENDER_TIMEOUT="${RENDER_TIMEOUT:-3600}"         # seconds to wait for the render
DO_UPLOAD="${DO_UPLOAD:-0}"
R2_ENDPOINT="${R2_ENDPOINT:-https://468b7c5ddc132dda4c2ac43391f06dfb.r2.cloudflarestorage.com}"
R2_BUCKET="${R2_BUCKET:-spire-codex}"
AWS_PROFILE_NAME="${AWS_PROFILE_NAME:-r2}"

APP_ID=2868840
GAME=/game
OUT=/out
OUT_WEBP=/out_webp
MODS_IN="${MODS_IN:-/mods}"                       # mounted dir of prebuilt content mods (incl BaseLib)
mkdir -p "$OUT" "$OUT_WEBP"

# ---- 1. install the native Linux game ---------------------------------------
echo "==> steamcmd: installing app $APP_ID (linux depot) into $GAME"
guard_args=()
[ -n "$STEAM_GUARD" ] && guard_args=("$STEAM_GUARD")
beta_args=()
[ -n "$STEAM_BETA" ] && beta_args=(-beta "$STEAM_BETA")
steamcmd.sh \
  +@ShutdownOnFailedCommand 1 \
  +@NoPromptForPassword 1 \
  +@sSteamCmdForcePlatformType linux \
  +force_install_dir "$GAME" \
  +login "$STEAM_USER" "$STEAM_PASS" "${guard_args[@]}" \
  +app_update "$APP_ID" "${beta_args[@]}" validate \
  +quit

# ---- 2. locate the game binary + stage mods ---------------------------------
GAME_BIN="$(find "$GAME" -maxdepth 1 -type f \( -name '*.x86_64' -o -name 'SlayTheSpire2*' \) ! -name '*.pck' | head -1)"
[ -n "$GAME_BIN" ] || { echo "ERROR: game binary not found in $GAME"; ls -la "$GAME"; exit 1; }
chmod +x "$GAME_BIN"
echo "==> game binary: $GAME_BIN"

# Steamworks DRM: a steam_appid.txt lets the build init without a running client.
echo "$APP_ID" > "$(dirname "$GAME_BIN")/steam_appid.txt"

MODS_DIR="$GAME/mods"
mkdir -p "$MODS_DIR"
# Content mods (BaseLib + e.g. WatcherMod) come from the mounted MODS_IN.
if [ -d "$MODS_IN" ]; then
  echo "==> staging mods from $MODS_IN"
  cp -r "$MODS_IN"/. "$MODS_DIR"/
fi
# The exporter mod (built into this image).
cp -r /home/steam/render-exporter-mod "$MODS_DIR/RenderExporter"
echo "==> mods present:"; ls -1 "$MODS_DIR"
[ -d "$MODS_DIR/BaseLib" ] || echo "WARN: BaseLib not found in $MODS_DIR; mods will not load. Mount it via $MODS_IN/BaseLib."

# ---- 3. launch under Xvfb; the exporter reads STS2_RENDER_* from env ---------
export STS2_RENDER_OUT="$OUT"
export STS2_RENDER_CARDS="$RENDER_CARDS"
export STS2_RENDER_PREFIX="$RENDER_PREFIX"
export STS2_RENDER_LANGS="$RENDER_LANGS"
export STS2_RENDER_ENCH="$RENDER_ENCH"

echo "==> launching game (opengl3 + llvmpipe) under Xvfb"
rm -f "$OUT/_all_done.txt"
xvfb-run -a -s "-screen 0 1920x1080x24" \
  "$GAME_BIN" --rendering-driver opengl3 >"$OUT/game.log" 2>&1 &
GAME_PID=$!

# ---- 4. wait for the sentinel, then stop the game ---------------------------
echo "==> waiting up to ${RENDER_TIMEOUT}s for $OUT/_all_done.txt"
waited=0
while [ ! -f "$OUT/_all_done.txt" ]; do
  if ! kill -0 "$GAME_PID" 2>/dev/null; then
    echo "ERROR: game exited before finishing. Tail of game.log:"; tail -40 "$OUT/game.log" || true; exit 1
  fi
  if [ "$waited" -ge "$RENDER_TIMEOUT" ]; then
    echo "ERROR: timed out after ${RENDER_TIMEOUT}s. Tail of game.log:"; tail -40 "$OUT/game.log" || true
    kill "$GAME_PID" 2>/dev/null || true; exit 1
  fi
  sleep 5; waited=$((waited + 5))
done
echo "==> render complete: $(cat "$OUT/_all_done.txt")"
kill "$GAME_PID" 2>/dev/null || true
wait "$GAME_PID" 2>/dev/null || true

# Sanity: fail loudly if nothing was actually drawn (Godot --headless trap, etc.).
png_count="$(find "$OUT" -name '*.png' | wc -l)"
echo "==> $png_count PNG(s) rendered"
[ "$png_count" -gt 0 ] || { echo "ERROR: no PNGs produced (blank render?)."; exit 1; }

# ---- 5. convert + upload ----------------------------------------------------
echo "==> converting PNG -> webp"
/home/steam/convert-cards.sh "$OUT" "$OUT_WEBP"

if [ "$DO_UPLOAD" = "1" ]; then
  DEST="s3://$R2_BUCKET/cards-full/mods/$MOD_ID/"
  echo "==> uploading $OUT_WEBP -> $DEST"
  aws --profile "$AWS_PROFILE_NAME" s3 sync "$OUT_WEBP/" "$DEST" \
    --endpoint-url "$R2_ENDPOINT" --content-type image/webp
  echo "==> uploaded. Verify: https://cdn.spire-codex.com/cards-full/mods/$MOD_ID/<id>.webp"
else
  echo "==> DO_UPLOAD!=1; skipping R2 sync. webp tree is in $OUT_WEBP"
fi
echo "==> done."
