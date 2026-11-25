#!/bin/bash
# Posts to a Discord webhook when a filesystem runs low or a mount is missing.
#
#   */10 * * * * /var/www/spire-codex/tools/disk_alert.sh / /var/www/spire-codex/lake >> /var/log/disk-alert.log 2>&1
#
# DISK_ALERT_WEBHOOK_URL comes from the environment or the repo .env.
# Warns under DISK_ALERT_WARN_GB (25) every 6 hours, and under
# DISK_ALERT_CRIT_GB (10) every hour. Says so once when space is back.

set -u

ENV_FILE="${ENV_FILE:-$(cd "$(dirname "$0")/.." && pwd)/.env}"
WARN_GB="${DISK_ALERT_WARN_GB:-25}"
CRIT_GB="${DISK_ALERT_CRIT_GB:-10}"
STATE_DIR="${DISK_ALERT_STATE_DIR:-/var/tmp/disk-alert}"
HOST="${DISK_ALERT_HOST:-$(hostname)}"

url="${DISK_ALERT_WEBHOOK_URL:-}"
if [ -z "$url" ] && [ -f "$ENV_FILE" ]; then
  url=$(grep -E '^DISK_ALERT_WEBHOOK_URL=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d "\"'")
fi
if [ -z "$url" ]; then
  echo "DISK_ALERT_WEBHOOK_URL is not set"
  exit 1
fi

mkdir -p "$STATE_DIR"
now=$(date +%s)
[ $# -eq 0 ] && set -- /

send() {
  local body
  body=$(printf '{"content":"%s"}' "$1")
  curl -fsS -m 15 -H 'Content-Type: application/json' -d "$body" "$url" >/dev/null
}

for mount in "$@"; do
  state_file="$STATE_DIR/$(printf '%s' "$mount" | tr '/' '_')"
  last_level=ok
  last_sent=0
  [ -f "$state_file" ] && read -r last_level last_sent <"$state_file"

  if ! mountpoint -q "$mount"; then
    level=missing
    text="$HOST: $mount is not mounted"
  else
    free_kb=$(df -Pk "$mount" | awk 'NR==2 {print $4}')
    free_gb=$((free_kb / 1048576))
    used=$(df -Pk "$mount" | awk 'NR==2 {print $5}')
    level=ok
    [ "$free_gb" -lt "$WARN_GB" ] && level=warn
    [ "$free_gb" -lt "$CRIT_GB" ] && level=critical
    text="$HOST: $mount has ${free_gb} GB free (${used} used)"
  fi

  case "$level" in
    ok) every=0 ;;
    warn) every=21600 ;;
    *) every=3600 ;;
  esac

  if [ "$level" = ok ]; then
    if [ "$last_level" != ok ]; then
      send "Recovered. $text" && echo "ok $now" >"$state_file"
    fi
    continue
  fi

  if [ "$level" != "$last_level" ] || [ $((now - last_sent)) -ge "$every" ]; then
    label="Disk space low"
    [ "$level" = critical ] && label="Disk space CRITICAL"
    [ "$level" = missing ] && label="Mount missing"
    if send "$label. $text"; then
      echo "$level $now" >"$state_file"
      echo "$(date -u +%FT%TZ) sent $level for $mount"
    else
      echo "$(date -u +%FT%TZ) webhook failed for $mount"
    fi
  fi
done
