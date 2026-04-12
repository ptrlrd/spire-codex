"""Shared FastAPI dependencies."""

from fastapi import Query

VALID_LANGUAGES = {
    "deu",
    "eng",
    "esp",
    "fra",
    "ita",
    "jpn",
    "kor",
    "pol",
    "ptb",
    "rus",
    "spa",
    "tha",
    "tur",
    "zhs",
}

LANGUAGE_NAMES = {
    "deu": "Deutsch",
    "eng": "English",
    "esp": "Español (ES)",
    "fra": "Français",
    "ita": "Italiano",
    "jpn": "日本語",
    "kor": "한국어",
    "pol": "Polski",
    "ptb": "Português (BR)",
    "rus": "Русский",
    "spa": "Español (LA)",
    "tha": "ไทย",
    "tur": "Türkçe",
    "zhs": "简体中文",
}

DEFAULT_LANG = "eng"


def get_lang(lang: str = Query("eng", description="Language code")) -> str:
    """Validate and return language code, falling back to English."""
    return lang if lang in VALID_LANGUAGES else DEFAULT_LANG


def matches_search(entity: dict, search: str, fields: list[str]) -> bool:
    """Check if ALL words in the search query match across any of the entity's fields.

    Supports multi-word queries: "rare ironclad" matches entities where
    one field contains "rare" AND another (or same) contains "ironclad".
    """
    words = search.lower().split()
    # Build a combined searchable text from all specified fields
    searchable_parts: list[str] = []
    for field in fields:
        val = entity.get(field)
        if isinstance(val, str):
            searchable_parts.append(val.lower())
        elif isinstance(val, list):
            searchable_parts.extend(str(v).lower() for v in val)
    searchable = " ".join(searchable_parts)
    return all(word in searchable for word in words)
