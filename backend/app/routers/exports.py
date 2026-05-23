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

_MONGO_PROJECTION = {
    "_id": 1,
    "seed": 1,
    "character": 1,
    "win": 1,
    "was_abandoned": 1,
    "ascension": 1,
    "game_mode": 1,
    "player_count": 1,
    "run_time": 1,
    "floors_reached": 1,
    "acts_completed": 1,
    "killed_by": 1,
    "deck_size": 1,
    "relic_count": 1,
    "username": 1,
    "build_id": 1,
    "submitted_at": 1,
    "deck": 1,
    "relics": 1,
    "potions": 1,
    "card_choices": 1,
    "map_point_history": 1,
}


def _iter_runs_mongo():
    from ..services.runs_db_mongo import _get_collection

    coll = _get_collection()
    cursor = coll.find({}, _MONGO_PROJECTION, no_cursor_timeout=True)
    try:
        for doc in cursor:
            doc["run_hash"] = doc.pop("_id", None)
            yield doc
    finally:
        cursor.close()


def _iter_runs_sqlite():
    if not _RUNS_DIR.exists():
        return
    for f in sorted(_RUNS_DIR.glob("*.json")):
        try:
            with open(f, "r", encoding="utf-8") as fh:
                doc = json.load(fh)
            doc.setdefault("run_hash", f.stem)
            yield doc
        except (json.JSONDecodeError, OSError):
            continue


def _stream_runs_jsonl():
    using_mongo = bool(os.environ.get("MONGO_URL", "").strip())
    source = _iter_runs_mongo() if using_mongo else _iter_runs_sqlite()

    buf = io.BytesIO()
    gz = gzip.GzipFile(fileobj=buf, mode="wb")

    for doc in source:
        line = json.dumps(doc, default=str, ensure_ascii=False) + "\n"
        gz.write(line.encode("utf-8"))
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

    Each line is one JSON object with run_hash, character, win,
    map_point_history, deck, relics, card_choices, and other fields.
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
