"""Replay upload, playback, and removal. See services/replays_db.py."""

import os
import re

from fastapi import APIRouter, HTTPException, Request, Response
from starlette.concurrency import run_in_threadpool

from ..dependencies import shared_limiter
from ..services import rate_limit_config
from ..services import replays_db
from ..services.auth_jwt import require_user
from ..services.replays_db import MAX_GZ_BYTES, ReplayRejected

router = APIRouter(prefix="/api/runs", tags=["Runs"])
limiter = shared_limiter
CACHE_CONTROL = "public, no-cache"


_ENTITY_TAG = r'(?:W/)?"[^"]*"'
_ENTITY_TAG_LIST = re.compile(rf"\s*{_ENTITY_TAG}(?:\s*,\s*{_ENTITY_TAG})*\s*")
_ENTITY_TAG_VALUE = re.compile(r'(?:W/)?"([^"]*)"')


def _etag_matches(header: str | None, etag: str) -> bool:
    """RFC 9110 If-None-Match for GET: a list of quoted entity tags (commas
    are legal inside a tag, so parse tags rather than split), weak
    comparison, and the * wildcard. A malformed header never matches."""
    if not header:
        return False
    if header.strip() == "*":
        return True
    if not _ENTITY_TAG_LIST.fullmatch(header):
        return False
    bare = etag.strip('"')
    return any(tag == bare for tag in _ENTITY_TAG_VALUE.findall(header))


async def _read_capped(request: Request, cap: int) -> bytes:
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > cap:
        raise HTTPException(status_code=413, detail=f"Replay over {cap // 1024} KB")
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > cap:
            raise HTTPException(status_code=413, detail=f"Replay over {cap // 1024} KB")
        chunks.append(chunk)
    return b"".join(chunks)


def _raise(e: ReplayRejected) -> None:
    raise HTTPException(
        status_code=e.status, detail={"code": e.code, "message": e.detail}
    )


@router.post("/{run_hash}/replay", tags=["Runs"])
@limiter.limit(rate_limit_config.endpoint_limit("replays.upload", "30/minute"))
async def upload_replay(run_hash: str, request: Request):
    """Store the gzipped NDJSON replay for a run you own. Upload the .run
    first; the replay is matched against it and rejected on mismatch."""
    user = require_user(request)
    body = await _read_capped(request, MAX_GZ_BYTES)
    encoding = request.headers.get("content-encoding", "").lower()
    if encoding not in ("", "gzip") or not body.startswith(replays_db.GZIP_MAGIC):
        raise HTTPException(status_code=415, detail="Body must be gzip NDJSON")
    try:
        result = await run_in_threadpool(replays_db.accept_upload, run_hash, body, user)
    except ReplayRejected as e:
        _raise(e)
    site_base = os.environ.get("PUBLIC_SITE_BASE", "https://spire-codex.com").rstrip(
        "/"
    )
    result["url"] = f"{site_base}/runs/{run_hash}/replay"
    return result


@router.get("/{run_hash}/replay", tags=["Runs"])
@limiter.limit(rate_limit_config.endpoint_limit("replays.get", "120/minute"))
async def get_replay(run_hash: str, request: Request):
    """The stored replay, served as the original gzip bytes."""
    visible = await run_in_threadpool(replays_db.replay_visible, run_hash)
    if not visible:
        raise HTTPException(status_code=404, detail="Replay not found")
    sha = await run_in_threadpool(replays_db.replay_sha, run_hash)
    if sha is None:
        raise HTTPException(status_code=404, detail="Replay not found")
    etag = f'"{sha}"'
    cache = {"ETag": etag, "Cache-Control": CACHE_CONTROL, "Vary": "Accept-Encoding"}
    if _etag_matches(request.headers.get("if-none-match"), etag):
        return Response(status_code=304, headers=cache)
    found = await run_in_threadpool(replays_db.get_replay_bytes, run_hash)
    if found is None:
        raise HTTPException(status_code=404, detail="Replay not found")
    data, sha = found
    return Response(
        content=data,
        media_type="application/x-ndjson",
        headers={**cache, "Content-Encoding": "gzip"},
    )


@router.delete("/{run_hash}/replay", tags=["Runs"])
@limiter.limit(rate_limit_config.endpoint_limit("replays.delete", "30/minute"))
async def delete_replay(run_hash: str, request: Request):
    user = require_user(request)
    try:
        removed = await run_in_threadpool(replays_db.delete_replay, run_hash, user)
    except ReplayRejected as e:
        _raise(e)
    return {"success": True, "removed": removed}
