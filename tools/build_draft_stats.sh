#!/bin/bash
# Rebuild the "often drafted with" (item pairings) and "drafted next"
# (draft recs) caches from the current run data. Run this on the prod box
# every once in a while — ideally after a game patch, since that's when
# draft patterns actually shift. Each job streams every run from Mongo,
# so expect a few minutes per job with Mongo CPU elevated while it runs.
#
#   ./tools/build_draft_stats.sh
set -e

# Prefer the rebuilder so the web workers don't share the load; fall back
# to the web backend when the rebuilder isn't running on this host.
CONTAINER=spire-codex-rebuilder
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    CONTAINER=spire-codex-backend
fi

echo "building draft stats in $CONTAINER"
docker exec "$CONTAINER" python -m scripts.build_pairings
docker exec "$CONTAINER" python -m scripts.build_draft_recs
echo "done: pairings + draft recs rebuilt"
