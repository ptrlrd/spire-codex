"""Service layer that loads and serves parsed game data from JSON files."""

import json
import os
import re
from pathlib import Path
from functools import lru_cache
from contextvars import ContextVar

DATA_DIR = Path(
    os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data")
)
DEFAULT_LANG = "eng"

# ContextVar set by VersionMiddleware — allows version-aware loading without changing router signatures
current_version: ContextVar[str | None] = ContextVar("current_version", default=None)


def _resolve_base(version: str | None = None) -> Path:
    """Resolve the base data directory for a given version.

    - version="v0.103.0" → DATA_DIR/v0.103.0/
    - version=None → DATA_DIR/latest/ (if symlink exists) or DATA_DIR/ (flat, stable site)
    """
    if version:
        return DATA_DIR / version
    latest = DATA_DIR / "latest"
    if latest.exists():
        return latest
    return DATA_DIR


def _get_version() -> str | None:
    return current_version.get(None)


@lru_cache(maxsize=2048)
def _load_json_versioned(lang: str, entity: str, version: str | None) -> list[dict]:
    """Load a parsed JSON data file, keyed by (lang, entity, version) for caching."""
    base = _resolve_base(version)
    filepath = base / lang / f"{entity}.json"
    if not filepath.exists():
        filepath = base / DEFAULT_LANG / f"{entity}.json"
    if not filepath.exists():
        return []
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def _load_json(lang: str, entity: str) -> list[dict]:
    """Load JSON using the version from the current request context."""
    return _load_json_versioned(lang, entity, _get_version())


def load_cards(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "cards")


def load_characters(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "characters")


def load_relics(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "relics")


def load_monsters(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "monsters")


def load_potions(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "potions")


def load_enchantments(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "enchantments")


def load_encounters(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "encounters")


def load_events(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "events")


def load_powers(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "powers")


def load_keywords(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "keywords")


def load_intents(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "intents")


def load_orbs(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "orbs")


def load_afflictions(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "afflictions")


def load_modifiers(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "modifiers")


def load_achievements(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "achievements")


def load_badges(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "badges")


def load_glossary(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "glossary")


def load_epochs(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "epochs")


def load_stories(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "stories")


def load_acts(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "acts")


def load_ascensions(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "ascensions")


@lru_cache(maxsize=4)
def _load_news_index(version: str | None) -> list[dict]:
    """Load the news/index.json built by news_parser. The index is
    language-agnostic — Steam news isn't translated."""
    base = _resolve_base(version)
    filepath = base / "news" / "index.json"
    if not filepath.exists():
        return []
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def load_news_index() -> list[dict]:
    return _load_news_index(_get_version())


@lru_cache(maxsize=512)
def _load_news_item(gid: str, version: str | None) -> dict | None:
    """Load a single archived Steam news item by Steam `gid`."""
    base = _resolve_base(version)
    filepath = base / "news" / f"{gid}.json"
    if not filepath.exists():
        return None
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def load_news_item(gid: str) -> dict | None:
    return _load_news_item(gid, _get_version())


@lru_cache(maxsize=16)
def _load_guides_versioned(version: str | None) -> list[dict]:
    base = _resolve_base(version)
    filepath = base / "guides.json"
    if not filepath.exists():
        return []
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def load_guides() -> list[dict]:
    return _load_guides_versioned(_get_version())


@lru_cache(maxsize=128)
def _load_translation_maps_versioned(lang: str, version: str | None) -> dict:
    """Load translation maps for filter values (English -> localized)."""
    base = _resolve_base(version)
    filepath = base / lang / "translations.json"
    if not filepath.exists():
        filepath = base / DEFAULT_LANG / "translations.json"
    if not filepath.exists():
        return {
            "card_types": {},
            "card_rarities": {},
            "relic_rarities": {},
            "potion_rarities": {},
            "keywords": {},
        }
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def load_translation_maps(lang: str = DEFAULT_LANG) -> dict:
    return _load_translation_maps_versioned(lang, _get_version())


@lru_cache(maxsize=1)
def count_images() -> int:
    images_dir = (
        Path(
            os.environ.get("STATIC_DIR", Path(__file__).resolve().parents[2] / "static")
        )
        / "images"
    )
    if not images_dir.exists():
        return 0
    return sum(1 for _ in images_dir.rglob("*.png"))


def get_available_versions() -> list[dict]:
    """Scan DATA_DIR for versioned subdirectories (v0.102.0, v0.103.0, etc.)."""
    versions = []
    latest_target = None
    latest_link = DATA_DIR / "latest"
    if latest_link.is_symlink():
        latest_target = Path(os.readlink(latest_link)).name

    def _version_key(d: Path) -> tuple:
        """Parse version string into tuple for proper numeric sorting."""
        m = re.match(r"^v?(\d+)\.(\d+)(?:\.(\d+))?", d.name)
        if m:
            return (int(m.group(1)), int(m.group(2)), int(m.group(3) or 0))
        return (0, 0, 0)

    for d in sorted(DATA_DIR.iterdir(), key=_version_key, reverse=True):
        if d.is_dir() and re.match(r"^v?\d+\.\d+", d.name):
            # Verify it has at least an eng/ subdirectory
            if (d / "eng").is_dir():
                versions.append(
                    {
                        "version": d.name,
                        "is_latest": d.name == latest_target,
                    }
                )
    return versions


def get_stats(lang: str = DEFAULT_LANG) -> dict:
    return {
        "cards": len(load_cards(lang)),
        "characters": len(load_characters(lang)),
        "relics": len(load_relics(lang)),
        "monsters": len(load_monsters(lang)),
        "potions": len(load_potions(lang)),
        "enchantments": len(load_enchantments(lang)),
        "encounters": len(load_encounters(lang)),
        "events": len(load_events(lang)),
        "powers": len(load_powers(lang)),
        "keywords": len(load_keywords(lang)),
        "intents": len(load_intents(lang)),
        "orbs": len(load_orbs(lang)),
        "afflictions": len(load_afflictions(lang)),
        "modifiers": len(load_modifiers(lang)),
        "achievements": len(load_achievements(lang)),
        "badges": len(load_badges(lang)),
        "glossary": len(load_glossary(lang)),
        "epochs": len(load_epochs(lang)),
        "acts": len(load_acts(lang)),
        "ascensions": len(load_ascensions(lang)),
        "images": count_images(),
    }
