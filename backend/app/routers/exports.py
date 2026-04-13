import io
import zipfile

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from ..dependencies import VALID_LANGUAGES
from ..metrics import data_exports
from ..services.data_service import DATA_DIR

router = APIRouter(prefix="/api/exports", tags=["Exports"])

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


@router.get("/{lang}")
def export_language(lang: str):
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
