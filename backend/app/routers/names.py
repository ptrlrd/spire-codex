"""Cross-language entity name lookup."""

from fastapi import APIRouter

from ..services.data_service import _load_json
from ..dependencies import VALID_LANGUAGES, LANGUAGE_NAMES

router = APIRouter()

ENTITY_MAP = {
    "cards": "cards",
    "relics": "relics",
    "potions": "potions",
    "monsters": "monsters",
    "powers": "powers",
    "events": "events",
    "characters": "characters",
    "enchantments": "enchantments",
}


@router.get("/api/names/{entity_type}/{entity_id}")
def get_localized_names(entity_type: str, entity_id: str) -> dict[str, str]:
    """Return {lang_code: display_name} for an entity across all languages."""
    data_key = ENTITY_MAP.get(entity_type)
    if not data_key:
        return {}

    lookup_id = entity_id.upper()
    names: dict[str, str] = {}

    for lang in sorted(VALID_LANGUAGES):
        items = _load_json(lang, data_key)
        for item in items:
            if item["id"] == lookup_id:
                label = LANGUAGE_NAMES.get(lang, lang)
                names[label] = item.get("name", item["id"])
                break

    return names
