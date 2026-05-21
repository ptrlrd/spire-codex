#!/usr/bin/env bash
# Beta-watch: poll Steam for a new StS2 beta build. On detection, run the
# extraction + parse + diff pipeline, push a branch, open a PR, and ping
# Discord. Idempotent — runs every 30 min via launchd, no-op when up to date.
#
# Setup is documented in README.md. State (last-seen buildid, logs) lives
# at $STATE_DIR. The script must be runnable without an interactive TTY,
# so Steam Guard credentials need to be cached (steamcmd remembers after
# the first login — keep your credential file warm).
#
# Exit codes:
#   0   No new build, or new build fully processed.
#   2   SteamCMD failed (network, auth, Steam down).
#   3   New build detected but extraction/parse pipeline failed.
#   4   Pipeline succeeded but git/gh/Discord step failed.

set -euo pipefail

# --- Config (override via env or edit) ---
APP_ID="${SPIRE_APP_ID:-2868840}"           # StS2
BETA_BRANCH="${SPIRE_BETA_BRANCH:-public-beta}"  # Steam beta branch name
STATE_DIR="${SPIRE_STATE_DIR:-$HOME/.spire-codex/beta-watch}"
REPO="${SPIRE_REPO:-$HOME/Documents/Projects/spire-codex}"
STEAMCMD="${SPIRE_STEAMCMD:-$HOME/Steam/steamcmd.sh}"
DOWNLOAD_DIR="$STATE_DIR/download"

mkdir -p "$STATE_DIR" "$DOWNLOAD_DIR"
LOG="$STATE_DIR/watch.log"
LAST_BUILDID_FILE="$STATE_DIR/last-buildid"

# --- Logging helper ---
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$LOG"; }
fail() { log "FATAL: $*"; exit "${2:-1}"; }

log "==== beta-watch tick ===="

# --- 1. Pull credentials from 1Password ---
# Stored at:
#   op://Spire Codex/Steam/username
#   op://Spire Codex/Steam/password
#   op://Spire Codex/Discord Webhooks/beta-watch  (Discord notify URL)
if ! command -v op >/dev/null; then fail "op CLI not on PATH" 2; fi
STEAM_USER=$(op read "op://Spire Codex/Steam/username" 2>>"$LOG") || fail "op read steam user" 2
STEAM_PASS=$(op read "op://Spire Codex/Steam/password" 2>>"$LOG") || fail "op read steam pass" 2
DISCORD_URL=$(op read "op://Spire Codex/Discord Webhooks/beta-watch" 2>>"$LOG" || echo "")

# --- 2. Have SteamCMD sync the beta branch ---
# `validate` ensures partial downloads from the prior run get fixed.
# +force_install_dir keeps the cached install isolated from the user's
# regular Steam library, so a watcher download doesn't clobber the GUI
# Steam playing-build.
log "running steamcmd app_update for app $APP_ID beta=$BETA_BRANCH"
if ! "$STEAMCMD" \
    +force_install_dir "$DOWNLOAD_DIR" \
    +login "$STEAM_USER" "$STEAM_PASS" \
    +app_update "$APP_ID" -beta "$BETA_BRANCH" validate \
    +quit >> "$LOG" 2>&1; then
  fail "steamcmd failed (see $LOG)" 2
fi

# --- 3. Read the new buildid from appmanifest ---
ACF="$DOWNLOAD_DIR/steamapps/appmanifest_$APP_ID.acf"
[ -f "$ACF" ] || fail "appmanifest missing after steamcmd run: $ACF" 2
NEW_BUILDID=$(awk -F'"' '/^[[:space:]]*"buildid"/{print $4; exit}' "$ACF")
[ -n "$NEW_BUILDID" ] || fail "could not parse buildid from $ACF" 2
log "current beta buildid: $NEW_BUILDID"

OLD_BUILDID=""
[ -f "$LAST_BUILDID_FILE" ] && OLD_BUILDID=$(cat "$LAST_BUILDID_FILE")

if [ "$NEW_BUILDID" = "$OLD_BUILDID" ]; then
  log "no change (still $NEW_BUILDID), exiting"
  exit 0
fi

log "NEW BUILD: $OLD_BUILDID -> $NEW_BUILDID"

# --- 4. Run the extraction + parse + changelog pipeline ---
# Delegates to a sibling script so this watcher stays small and the
# pipeline can be invoked manually too (e.g. you ran SteamCMD by hand
# and just want to rebuild data-beta/).
PIPELINE="$REPO/tools/beta-watch/process.sh"
[ -x "$PIPELINE" ] || fail "pipeline script missing or not executable: $PIPELINE" 3

if ! BUILDID="$NEW_BUILDID" \
      DOWNLOAD_DIR="$DOWNLOAD_DIR" \
      REPO="$REPO" \
      "$PIPELINE" >> "$LOG" 2>&1; then
  fail "pipeline failed (see $LOG)" 3
fi

# --- 5. Notify Discord ---
if [ -n "$DISCORD_URL" ]; then
  PR_URL=$(cat "$STATE_DIR/last-pr-url" 2>/dev/null || echo "(no PR opened)")
  VERSION=$(cat "$STATE_DIR/last-version" 2>/dev/null || echo "$NEW_BUILDID")
  # <@99656376954916864> = peter — explicit mention so the message escalates
  # to a phone push notification, not just a passive channel message.
  MSG="<@99656376954916864> **New StS2 beta detected**: \`$VERSION\` (buildid $NEW_BUILDID)\nPR: $PR_URL"
  # allowed_mentions.parse=["users"] is what actually causes Discord to ring
  # the user — without it, the <@id> renders as text and skips the ping.
  curl -s -X POST -H "Content-Type: application/json" \
    -d "$(printf '{"content":"%s","allowed_mentions":{"parse":["users"]}}' "${MSG//\"/\\\"}")" \
    "$DISCORD_URL" >> "$LOG" 2>&1 || log "discord notify failed (non-fatal)"
fi

# --- 6. Commit the new state only on full success ---
echo "$NEW_BUILDID" > "$LAST_BUILDID_FILE"
log "==== beta-watch done ===="
