"""Admin API for the mentions inbox: triage, volume summary, watch settings
and manual polling. Gated by the same require_admin dependency as the rest
of the admin surface."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from ..services import mention_sources, mentions
from ..services.auth_jwt import require_admin
from .admin import _audit

router = APIRouter(
    prefix="/api/admin/mentions",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)

_STATUS_FILTERS = {"new", "seen", "replied", "ignored", "open", "all"}
_MAX_NOTE = 2000


def _parse_before(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="before: expected an ISO timestamp")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _out(doc: dict) -> dict:
    return {
        **mentions.item_out(doc),
        "source_label": mention_sources.source_label(doc.get("source", "")),
    }


async def _json(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="body: expected a JSON object")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="body: expected a JSON object")
    return body


@router.get("")
def list_mentions(
    request: Request,
    status: str = "open",
    source: str | None = None,
    group: str | None = None,
    q: str | None = None,
    days: int = 30,
    limit: int = 50,
    before: str | None = None,
):
    _audit(request)
    if status not in _STATUS_FILTERS:
        raise HTTPException(status_code=400, detail="status: unknown status filter")
    if group is not None and group not in mentions.GROUPS:
        raise HTTPException(status_code=400, detail="group: unknown group")
    if not 1 <= days <= 365:
        raise HTTPException(status_code=400, detail="days: expected 1 to 365")
    if not 1 <= limit <= 200:
        raise HTTPException(status_code=400, detail="limit: expected 1 to 200")
    docs, next_before = mentions.list_items(
        status=status,
        source=source,
        group=group,
        q=q,
        days=days,
        limit=limit,
        before=_parse_before(before),
    )
    return {"items": [_out(d) for d in docs], "next_before": next_before}


@router.get("/summary")
def summary(request: Request, days: int = 30):
    _audit(request)
    if not 1 <= days <= 365:
        raise HTTPException(status_code=400, detail="days: expected 1 to 365")
    return mentions.summary(days)


@router.patch("/{mention_id}")
async def patch_mention(request: Request, mention_id: str):
    _audit(request)
    body = await _json(request)
    fields = {}
    if "status" in body:
        if body["status"] not in mentions.STATUSES:
            raise HTTPException(status_code=400, detail="status: unknown status")
        fields["status"] = body["status"]
    if "note" in body:
        note = body["note"]
        if not isinstance(note, str) or len(note) > _MAX_NOTE:
            raise HTTPException(
                status_code=400, detail=f"note: up to {_MAX_NOTE} characters"
            )
        fields["note"] = note
    if not fields:
        raise HTTPException(status_code=400, detail="body: expected status or note")
    doc = mentions.set_item(mention_id, fields)
    if doc is None:
        raise HTTPException(status_code=404, detail="Mention not found")
    return _out(doc)


@router.post("/bulk")
async def bulk(request: Request):
    _audit(request)
    body = await _json(request)
    ids = body.get("ids")
    status = body.get("status")
    if not isinstance(ids, list) or not ids or len(ids) > 500:
        raise HTTPException(
            status_code=400, detail="ids: a list of 1 to 500 mention ids"
        )
    if status not in mentions.STATUSES:
        raise HTTPException(status_code=400, detail="status: unknown status")
    result = mentions._col().update_many(
        {"_id": {"$in": ids}},
        {"$set": {"status": status, "updated_at": mentions._utcnow()}},
    )
    return {"updated": int(getattr(result, "modified_count", 0))}


@router.get("/settings")
def get_settings(request: Request):
    _audit(request)
    return mentions.get_settings()


@router.put("/settings")
async def put_settings(request: Request):
    _audit(request)
    body = await _json(request)
    try:
        return mentions.save_settings(body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/poll")
async def poll(request: Request):
    _audit(request)
    body = await _json(request)
    source = body.get("source")
    if source is not None and source not in mention_sources.source_names():
        raise HTTPException(status_code=400, detail="source: unknown source")
    if not mentions.try_manual_poll(source):
        raise HTTPException(
            status_code=409,
            detail="A manual poll is already running or the poll lease is held",
        )
    return {"started": True}
