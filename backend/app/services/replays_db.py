"""Run replays: the gzipped NDJSON journal the mod records during a run.

Stored byte-identically in a separate Mongo database (REPLAY_DB_NAME),
one document per run slot keyed by run_hash, with the scalars an
analytics job needs to pick a population without touching the blob.
The upload is validated by streaming the gzip with bounded decompression
(size and line caps enforced on what actually comes out, never on
declared counts) and by checking line 0 against the run it claims to
belong to. First upload wins for good: a different file for the same run
is a 409, and a delete only hides the replay (soft delete) so the same
bytes can come back but nothing else can take the hash. That keeps the
exploder's publication identity (run_hash + sha256) stable.
"""

import hashlib
import json
import os
import logging
import zlib
from datetime import datetime, timezone

from bson import Binary
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError, PyMongoError

logger = logging.getLogger(__name__)

REPLAY_DB_NAME = os.environ.get("REPLAY_DB_NAME", "spire_replays")
MAX_GZ_BYTES = int(os.environ.get("REPLAY_MAX_GZ_BYTES", "") or 2 * 1024 * 1024)
MAX_RAW_BYTES = int(os.environ.get("REPLAY_MAX_RAW_BYTES", "") or 16 * 1024 * 1024)
MAX_LINES = int(os.environ.get("REPLAY_MAX_LINES", "") or 200_000)
KNOWN_REPLAY_VERSIONS = frozenset({1})
GZIP_MAGIC = b"\x1f\x8b"

_coll_cache = None
_RUN_FIELDS = {
    "steam_id": 1,
    "user_id": 1,
    "hidden": 1,
    "deleted_at": 1,
    "character": 1,
    "win": 1,
    "ascension": 1,
    "build_id": 1,
    "game_mode": 1,
    "player_count": 1,
    "played_at": 1,
    "has_replay": 1,
}


class ReplayRejected(Exception):
    def __init__(self, status: int, detail: str, code: str = "rejected"):
        super().__init__(detail)
        self.status = status
        self.detail = detail
        self.code = code


def _runs():
    from .runs_db_mongo import _get_collection

    return _get_collection()


def _coll():
    global _coll_cache
    if _coll_cache is None:
        coll = _runs().database.client[REPLAY_DB_NAME].replays
        try:
            coll.create_index(
                [("ingest_state", ASCENDING), ("submitted_at", ASCENDING)],
                name="ingest_queue",
            )
            coll.create_index(
                [("ingest_state", ASCENDING), ("lease_expires_at", ASCENDING)],
                name="ingest_lease",
            )
            coll.create_index(
                [("user_id", ASCENDING), ("played_at", DESCENDING)], name="owner"
            )
        except Exception:
            pass
        _coll_cache = coll
    return _coll_cache


def inspect_gzip(gz: bytes) -> dict:
    """Stream-decompress the upload, counting lines and bytes as they come
    out, and parse line 0. Every cap is checked on the decompressed output
    as it is produced (the flush included), never on declared counts."""
    if len(gz) > MAX_GZ_BYTES:
        raise ReplayRejected(
            413, f"replay over {MAX_GZ_BYTES // 1024} KB compressed", "too_large"
        )
    if not gz.startswith(GZIP_MAGIC):
        raise ReplayRejected(415, "replay must be gzip", "not_gzip")
    d = zlib.decompressobj(16 + zlib.MAX_WBITS)
    state = {"raw": 0, "lines": 0, "header": None, "buf": b"", "last": b""}

    def account(out: bytes) -> None:
        if not out:
            return
        state["raw"] += len(out)
        if state["raw"] > MAX_RAW_BYTES:
            raise ReplayRejected(
                413, "replay over the decompressed size cap", "too_large"
            )
        state["lines"] += out.count(b"\n")
        if state["lines"] > MAX_LINES:
            raise ReplayRejected(413, "replay over the line cap", "too_large")
        if state["header"] is None:
            state["buf"] += out
            nl = state["buf"].find(b"\n")
            if nl >= 0:
                state["header"] = _parse_header(state["buf"][:nl])
                state["buf"] = b""
            elif len(state["buf"]) > 64 * 1024:
                raise ReplayRejected(400, "line 0 is too long", "bad_header")
        state["last"] = out[-1:]

    pos = 0
    step = 64 * 1024
    try:
        while True:
            if d.unconsumed_tail:
                src = d.unconsumed_tail
            elif pos < len(gz):
                src = gz[pos : pos + step]
                pos += step
            else:
                break
            account(d.decompress(src, 1 << 20))
            if d.eof:
                break
        account(d.flush())
    except zlib.error:
        raise ReplayRejected(400, "replay is not valid gzip", "not_gzip")
    if not d.eof:
        raise ReplayRejected(400, "replay gzip is truncated", "not_gzip")
    if d.unused_data or pos < len(gz):
        raise ReplayRejected(400, "replay has trailing data after the gzip", "not_gzip")
    if state["header"] is None:
        if not state["buf"]:
            raise ReplayRejected(400, "replay is empty", "bad_header")
        state["header"] = _parse_header(state["buf"])
    lines = state["lines"] + (1 if state["last"] and state["last"] != b"\n" else 0)
    if lines > MAX_LINES:
        raise ReplayRejected(413, "replay over the line cap", "too_large")
    if state["raw"] == 0 or lines == 0:
        raise ReplayRejected(400, "replay is empty", "bad_header")
    return {
        "header": state["header"],
        "lines": lines,
        "raw_bytes": state["raw"],
        "sha256": hashlib.sha256(gz).hexdigest(),
    }


def _parse_header(line: bytes) -> dict:
    try:
        header = json.loads(line.decode("utf-8"))
    except Exception:
        raise ReplayRejected(400, "line 0 is not JSON", "bad_header")
    if not isinstance(header, dict) or header.get("t") != "header":
        raise ReplayRejected(400, "line 0 must be the header", "bad_header")
    if header.get("replay_version") not in KNOWN_REPLAY_VERSIONS:
        raise ReplayRejected(400, "unknown replay_version", "bad_header")
    return header


def check_header(header: dict, run_doc: dict, blob: dict | None, run_hash: str) -> int:
    """The header must describe the run it is posted against: same seed,
    same start_time, and the slot's character. Returns the slot index."""
    from .runs_db_mongo import clean_id, player_index_for_hash

    if blob is None:
        raise ReplayRejected(
            409, "run has no stored data to match against", "header_mismatch"
        )
    if str(header.get("seed") or "") != str(blob.get("seed") or ""):
        raise ReplayRejected(
            409, "replay seed does not match the run", "header_mismatch"
        )
    try:
        same_start = int(header.get("start_time") or 0) == int(
            blob.get("start_time") or 0
        )
    except (TypeError, ValueError):
        same_start = False
    if not same_start:
        raise ReplayRejected(
            409, "replay start_time does not match the run", "header_mismatch"
        )
    idx = player_index_for_hash(blob, run_hash)
    if idx is None:
        if len(blob.get("players") or []) > 1:
            raise ReplayRejected(
                409, "replay slot could not be matched to the run", "header_mismatch"
            )
        idx = 0
    want = clean_id(str(run_doc.get("character") or "")).upper()
    got = clean_id(str(header.get("character") or "")).upper()
    if want and got != want:
        raise ReplayRejected(
            409, "replay character does not match the run", "header_mismatch"
        )
    return idx


def owns_run(run_doc: dict, user: dict) -> bool:
    sid = str(user.get("steam_id") or "")
    if sid and str(run_doc.get("steam_id") or "") == sid:
        return True
    owner = run_doc.get("user_id")
    return bool(owner) and str(owner) == str(user.get("_id"))


def accept_upload(run_hash: str, gz: bytes, user: dict) -> dict:
    run_doc = _runs().find_one({"_id": run_hash}, _RUN_FIELDS)
    if run_doc is None or run_doc.get("deleted_at"):
        raise ReplayRejected(404, "run not found; upload the run first", "not_found")
    if not owns_run(run_doc, user):
        raise ReplayRejected(403, "this run belongs to another player", "not_owner")
    info = inspect_gzip(gz)
    from .runs_db_mongo import get_run_blob

    player_idx = check_header(info["header"], run_doc, get_run_blob(run_hash), run_hash)
    try:
        return store_replay(run_hash, gz, info, run_doc, user, player_idx)
    except PyMongoError as e:
        logger.error("replay storage failed for %s: %s", run_hash, str(e)[:300])
        raise ReplayRejected(503, "replay storage is unavailable", "storage")


def store_replay(
    run_hash: str, gz: bytes, info: dict, run_doc: dict, user: dict, player_idx: int
) -> dict:
    header = info["header"]
    now = datetime.now(timezone.utc)
    doc = {
        "_id": run_hash,
        "blob": Binary(gz),
        "sha256": info["sha256"],
        "gz_bytes": len(gz),
        "raw_bytes": info["raw_bytes"],
        "lines": info["lines"],
        "replay_version": header.get("replay_version"),
        "mod_version": header.get("mod_version"),
        "character": run_doc.get("character"),
        "ascension": run_doc.get("ascension"),
        "win": run_doc.get("win"),
        "game_mode": run_doc.get("game_mode"),
        "build_id": run_doc.get("build_id") or header.get("build_id"),
        "player_count": run_doc.get("player_count"),
        "player_idx": player_idx,
        "seed": header.get("seed"),
        "start_time": header.get("start_time"),
        "played_at": run_doc.get("played_at"),
        "steam_id": str(user.get("steam_id") or "") or None,
        "user_id": user.get("_id"),
        "submitted_at": now,
        "deleted_at": None,
        "ingest_state": None,
        "attempts": 0,
        "lease_expires_at": None,
        "batch_id": None,
        "ingested_at": None,
        "exploder_version": None,
        "published": {},
    }
    coll = _coll()
    try:
        coll.insert_one(doc)
    except DuplicateKeyError:
        existing = coll.find_one({"_id": run_hash}, {"sha256": 1, "deleted_at": 1})
        if existing and existing.get("sha256") == info["sha256"]:
            if existing.get("deleted_at"):
                coll.update_one({"_id": run_hash}, {"$set": {"deleted_at": None}})
            _runs().update_one({"_id": run_hash}, {"$set": {"has_replay": True}})
            return {"success": True, "duplicate": True, "run_hash": run_hash}
        raise ReplayRejected(
            409, "a different replay is already stored for this run", "replay_exists"
        )
    _runs().update_one({"_id": run_hash}, {"$set": {"has_replay": True}})
    return {"success": True, "run_hash": run_hash, "lines": info["lines"]}


def replay_visible(run_hash: str) -> bool:
    doc = _runs().find_one({"_id": run_hash}, {"hidden": 1, "deleted_at": 1})
    if doc is None or doc.get("hidden") or doc.get("deleted_at"):
        return False
    return True


def replay_sha(run_hash: str) -> str | None:
    doc = _coll().find_one({"_id": run_hash, "deleted_at": None}, {"sha256": 1})
    return (doc or {}).get("sha256") or None


def get_replay_bytes(run_hash: str) -> tuple[bytes, str] | None:
    doc = _coll().find_one(
        {"_id": run_hash, "deleted_at": None}, {"blob": 1, "sha256": 1}
    )
    if not doc:
        return None
    return bytes(doc["blob"]), doc.get("sha256") or ""


def delete_replay(run_hash: str, user: dict) -> bool:
    run_doc = _runs().find_one({"_id": run_hash}, _RUN_FIELDS)
    if run_doc is None:
        raise ReplayRejected(404, "run not found", "not_found")
    if not owns_run(run_doc, user):
        raise ReplayRejected(403, "this run belongs to another player", "not_owner")
    now = datetime.now(timezone.utc)
    removed = (
        _coll()
        .update_one(
            {"_id": run_hash, "deleted_at": None}, {"$set": {"deleted_at": now}}
        )
        .modified_count
        > 0
    )
    _runs().update_one({"_id": run_hash}, {"$unset": {"has_replay": ""}})
    return removed
