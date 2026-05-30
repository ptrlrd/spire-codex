"""Append-only audit log for every admin action.

Single Mongo collection (`admin_audit`) with one document per
operator action. Append-only by convention — the write path here is
the only thing that writes, and only the GET endpoint in
`admin_audit.py` reads.

## Document shape

  {
    "_id": ObjectId(...),         # natural ordering by insertion time
    "ts": ISODate(...),
    "actor": "peter@ptrlrd.com",  # from CF Access JWT once wired; today
                                  # we tag with "admin" since
                                  # X-Admin-Token doesn't carry identity
    "action": "rate_limits.set",  # dotted slug: <surface>.<verb>
    "target": "submit_run",       # human-readable, varies per action
    "before": "600/hour",         # nullable
    "after":  "3000/hour",        # nullable
    "request_id": "...",          # request_id middleware tag (TBD)
    "ip": "1.2.3.4",              # caller IP via client_ip()
  }

## Why a separate collection

- Independent retention. Run docs are forever; audit entries can age
  out after 1y to keep the working set lean.
- Independent indexes. Audit reads are always recent-N or by-actor,
  not by run-hash, so the index shape diverges from the runs
  collection.
- One write per admin action — cheap.

## Read patterns

- "Show me the last 100 admin actions"
- "Show me what `peter` did in the last 24h"
- "Show me every change to rate-limit `submit_run`"
"""

from __future__ import annotations

from typing import Any


def record(
    actor: str,
    action: str,
    target: str | None = None,
    before: Any = None,
    after: Any = None,
    ip: str | None = None,
) -> None:
    """Append one entry to the audit log. Best-effort — if Mongo is
    unreachable we log the failure but DON'T fail the calling admin
    action. Better to apply a config change and lose the audit
    record than block the operator from acting during an outage.

    TODO: implement. Sketch:
        coll = _get_db().admin_audit
        coll.insert_one({
            "ts": datetime.utcnow(),
            "actor": actor, "action": action, "target": target,
            "before": before, "after": after, "ip": ip,
        })
    """
    raise NotImplementedError("Audit write path lands with the first admin endpoint.")


def list_recent(limit: int = 100, since_iso: str | None = None) -> list[dict]:
    """Return the most recent `limit` entries, newest first.

    TODO: implement once the writer exists. Sketch:
        coll = _get_db().admin_audit
        q = {}
        if since_iso: q["ts"] = {"$gte": datetime.fromisoformat(since_iso)}
        return list(coll.find(q).sort("ts", -1).limit(limit))
    """
    raise NotImplementedError
