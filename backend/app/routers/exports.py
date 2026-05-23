import gzip
import io
import json
import os
import zipfile
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from slowapi import Limiter

from ..dependencies import VALID_LANGUAGES, client_ip
from ..metrics import data_exports, run_exports
from ..services.data_service import DATA_DIR

router = APIRouter(prefix="/api/exports", tags=["Exports"])

limiter = Limiter(key_func=client_ip)

ENTITY_FILES = [
    "cards",
    "relics",
    "potions",
    "characters",
    "monsters",
    "powers",
    "events",
    "encounters",
    "enchantments",
    "keywords",
    "intents",
    "orbs",
    "afflictions",
    "modifiers",
    "achievements",
    "epochs",
]

_RUNS_DIR = (
    Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data"))
    / "runs"
)

OFFICIAL_CHARACTERS = {"IRONCLAD", "SILENT", "DEFECT", "NECROBINDER", "REGENT"}


def _official_run_hashes() -> list[str]:
    """Get hashes of runs with official characters from Mongo."""
    from ..services.runs_db_mongo import _get_collection

    coll = _get_collection()
    cursor = coll.find(
        {"character": {"$in": list(OFFICIAL_CHARACTERS)}},
        {"_id": 1},
        no_cursor_timeout=True,
    )
    try:
        return [doc["_id"] for doc in cursor]
    finally:
        cursor.close()


def _stream_runs_jsonl():
    hashes = _official_run_hashes()

    buf = io.BytesIO()
    gz = gzip.GzipFile(fileobj=buf, mode="wb")

    for run_hash in hashes:
        run_file = _RUNS_DIR / f"{run_hash}.json"
        if not run_file.exists():
            continue
        try:
            raw = run_file.read_text(encoding="utf-8").strip()
            json.loads(raw)
        except (json.JSONDecodeError, OSError):
            continue
        gz.write(raw.encode("utf-8"))
        gz.write(b"\n")
        if buf.tell() > 65536:
            gz.flush()
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate()

    gz.close()
    tail = buf.getvalue()
    if tail:
        yield tail


# Declared BEFORE the /{lang} route so FastAPI matches the literal
# path "runs" instead of treating it as a language code.
@router.get("/runs")
@limiter.limit("2/hour")
def export_runs(request: Request):
    """Bulk export of all submitted runs as gzipped JSONL.

    Each line is the full raw game JSON as submitted by the client,
    including players, map_point_history, acts, deck, relics, and
    card_choices. Only runs with official characters are included.
    """
    run_exports.inc()
    return StreamingResponse(
        _stream_runs_jsonl(),
        media_type="application/gzip",
        headers={
            "Content-Disposition": 'attachment; filename="spire-codex-runs.jsonl.gz"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/{lang}")
@limiter.limit("10/hour")
def export_language(lang: str, request: Request):
    if lang not in VALID_LANGUAGES:
        lang = "eng"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for entity in ENTITY_FILES:
            filepath = DATA_DIR / lang / f"{entity}.json"
            if filepath.exists():
                zf.write(filepath, f"{entity}.json")
    buf.seek(0)
    data_exports.labels(lang=lang).inc()
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="spire-codex-{lang}.zip"'
        },
    )
