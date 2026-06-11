"""Admin API. Same container as everything else; isolation comes from layers:

1. `require_admin` at the *router* level, so every route here is guarded by
   construction and a forgotten decorator can't open a hole. The allowlist
   is the ADMIN_IDS env var (site user ids, Steam64 ids, or Discord ids),
   checked per request so removals apply instantly. Fails closed when unset.
2. Non-admins get a 404, never a 403: the code is public, no need to confirm
   to a probe that it found something real.
3. Cloudflare Access fronts /admin and /api/admin at the edge (configured in
   the Zero Trust dashboard, not in this repo), so unauthenticated traffic
   never reaches the app in production.

Every hit is audit-logged with the admin's identity.
"""

import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request

from ..services import cache as app_cache
from ..services.auth_jwt import require_admin

logger = logging.getLogger("spire-codex.admin")

router = APIRouter(
    prefix="/api/admin",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


def _audit(request: Request) -> None:
    user = getattr(request.state, "admin_user", None) or {}
    logger.info(
        "admin %s %s by user=%s",
        request.method,
        request.url.path,
        user.get("_id") or "?",
    )


def _runs_info() -> dict:
    out: dict = {}
    try:
        if os.environ.get("MONGO_URL", "").strip():
            from ..services.runs_db_mongo import _get_collection

            coll = _get_collection()
            out["total"] = coll.estimated_document_count()
            cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
            out["last_24h"] = coll.count_documents({"submitted_at": {"$gte": cutoff}})
            latest = coll.find_one({}, {"submitted_at": 1}, sort=[("submitted_at", -1)])
            sub = (latest or {}).get("submitted_at")
            out["last_submission"] = sub.isoformat() if sub else None
        else:
            from ..services.runs_db import get_conn

            with get_conn() as conn:
                out["total"] = conn.execute("SELECT COUNT(*) FROM runs").fetchone()[0]
                out["last_24h"] = conn.execute(
                    "SELECT COUNT(*) FROM runs WHERE submitted_at >= datetime('now', '-1 day')"
                ).fetchone()[0]
                row = conn.execute("SELECT MAX(submitted_at) FROM runs").fetchone()
                out["last_submission"] = row[0]
    except Exception:
        logger.warning("admin runs info failed", exc_info=True)
    return out


def _users_info() -> dict:
    try:
        from ..services.users_db import _get_collection

        return {"total": _get_collection().estimated_document_count()}
    except Exception:
        return {}


def _snapshot_info() -> dict:
    """The persisted snapshot's vitals (the shared truth all workers serve
    from), falling back to this worker's in-process cache on SQLite."""
    try:
        if os.environ.get("MONGO_URL", "").strip():
            from ..services.run_entity_stats import SNAPSHOT_COLLECTION_NAME
            from ..services.runs_db_mongo import _get_collection

            db = _get_collection().database
            meta = db[SNAPSHOT_COLLECTION_NAME].find_one({"_id": "__meta__"}) or {}
            built = meta.get("built_at")
            built_iso = built.isoformat() if hasattr(built, "isoformat") else built
            age = None
            if hasattr(built, "timestamp"):
                if built.tzinfo is None:
                    built = built.replace(tzinfo=timezone.utc)
                age = int(datetime.now(timezone.utc).timestamp() - built.timestamp())
            return {
                "built_at": built_iso,
                "age_seconds": age,
                "version": meta.get("snapshot_version"),
                "total_runs": (meta.get("global_totals") or {}).get("total_runs"),
                "has_charts": bool(meta.get("charts")),
            }
        from ..services import run_entity_stats as res

        return {
            "built_at": res._cache_built_at or None,
            "version": res.SNAPSHOT_VERSION,
            "total_runs": (res._global_totals or {}).get("total_runs"),
        }
    except Exception:
        logger.warning("admin snapshot info failed", exc_info=True)
        return {}


@router.get("/overview")
def overview(request: Request):
    """Operational vitals: run volume, users, snapshot freshness, Redis."""
    _audit(request)
    return {
        "runs": _runs_info(),
        "users": _users_info(),
        "snapshot": _snapshot_info(),
        "redis": app_cache.info(),
        "environment": os.environ.get("ENVIRONMENT", "development"),
    }
