#!/usr/bin/env bash
# Daily mongodump of the live runs store, run ON the box by cron (installed
# via playbooks/install-backup.yml). Same dump/verify/rotate logic the old
# GHA workflow used, minus the GHA->prod SSH dependency that kept breaking.
#
# When /etc/spire-codex/backup-r2.env exists (rendered by the playbook), the
# verified archive is also offloaded to a private R2 bucket, which removes
# the single-host risk and gives the SSH-free freshness check in
# .github/workflows/runs-db-backup.yml something to look at.
set -euo pipefail

BACKUP_DIR="/data/backups/spire-codex-mongo"
STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
DEST="$BACKUP_DIR/mongo-${STAMP}.archive.gz"
R2_ENV="/etc/spire-codex/backup-r2.env"

mkdir -p "$BACKUP_DIR"

MONGO_URL=$(grep -E '^MONGO_URL=' /var/www/spire-codex/.env | head -1 | cut -d= -f2-)
if [ -z "$MONGO_URL" ]; then
  echo "ERROR: MONGO_URL not found in /var/www/spire-codex/.env" >&2
  exit 1
fi

TMP=$(mktemp "$BACKUP_DIR/.mongo.XXXXXX")
trap 'rm -f "$TMP"' EXIT

# --network host so localhost and public-IP URIs both work.
docker run --rm --network host mongo:7.0 \
  mongodump --uri="$MONGO_URL" --archive --gzip --quiet > "$TMP"

if [ ! -s "$TMP" ]; then
  echo "ERROR: mongodump produced an empty archive" >&2
  exit 1
fi

# Verify the archive actually restores before retaining it.
docker run --rm -i --network none mongo:7.0 \
  mongorestore --archive --gzip --dryRun --quiet < "$TMP" \
  || { echo "ERROR: archive failed dry-run restore" >&2; exit 1; }

mv "$TMP" "$DEST"
trap - EXIT
echo "$(date -u +%FT%TZ) wrote $DEST ($(du -h "$DEST" | cut -f1))"

# Retention — keep the last 14 daily archives locally.
find "$BACKUP_DIR" -maxdepth 1 -name 'mongo-*.archive.gz' -mtime +14 -print -delete

# Optional R2 offload. The env file provides R2_ENDPOINT, R2_BUCKET,
# AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY. Offload failures are loud but
# don't fail the run — the local archive already exists and rotates.
if [ -f "$R2_ENV" ]; then
  set -a; . "$R2_ENV"; set +a
  if docker run --rm --network host \
      -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
      -v "$BACKUP_DIR:/backups:ro" \
      amazon/aws-cli s3 cp "/backups/$(basename "$DEST")" \
      "s3://$R2_BUCKET/mongo/$(basename "$DEST")" \
      --endpoint-url "$R2_ENDPOINT" --only-show-errors; then
    echo "$(date -u +%FT%TZ) offloaded to r2://$R2_BUCKET/mongo/"
    # Remote retention mirrors local: prune R2 copies older than 14 days.
    CUTOFF=$(date -u -d '14 days ago' +%Y-%m-%dT%H-%M-%SZ)
    docker run --rm --network host \
      -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
      amazon/aws-cli s3 ls "s3://$R2_BUCKET/mongo/" --endpoint-url "$R2_ENDPOINT" \
      | awk '{print $4}' | while read -r key; do
        [ -n "$key" ] || continue
        stamp="${key#mongo-}"; stamp="${stamp%.archive.gz}"
        if [[ "$stamp" < "$CUTOFF" ]]; then
          docker run --rm --network host \
            -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
            amazon/aws-cli s3 rm "s3://$R2_BUCKET/mongo/$key" \
            --endpoint-url "$R2_ENDPOINT" --only-show-errors
        fi
      done
  else
    echo "WARNING: R2 offload failed; local archive retained" >&2
  fi
fi

echo "retained locally:"
ls -1h "$BACKUP_DIR" | tail -10
