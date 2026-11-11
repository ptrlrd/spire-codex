"""Ids the game itself ships, read from the catalogs.

Run stats only count official content. The cast and the card and relic sets
change with every patch and beta, so they are read from the game data
instead of being listed in code: the current main catalog, the current
beta, and every archived version, so content the game shipped and later
removed still counts as official.
"""

import json
import logging
from functools import lru_cache
from pathlib import Path

from . import data_service

logger = logging.getLogger(__name__)

LAUNCH_CAST = ("IRONCLAD", "SILENT", "DEFECT", "NECROBINDER", "REGENT")
FALLBACK_CHARACTERS = frozenset(LAUNCH_CAST)


def _ids(base: Path, entity: str) -> set[str]:
    path = base / data_service.DEFAULT_LANG / f"{entity}.json"
    try:
        with open(path, "r", encoding="utf-8") as f:
            rows = json.load(f)
    except (OSError, ValueError):
        return set()
    return {str(r["id"]).upper() for r in rows if isinstance(r, dict) and r.get("id")}


def archived_versions() -> list[str]:
    try:
        return data_service.list_data_versions()
    except Exception:
        logger.warning("catalog archive listing failed", exc_info=True)
        return []


@lru_cache(maxsize=None)
def official_ids(entity: str) -> frozenset[str]:
    """Uppercase ids of one catalog file (cards, relics, characters...)
    across main, the current beta and every archived version. Empty when
    the main catalog cannot be read, which callers treat as "don't filter"."""
    ids = _ids(data_service._resolve_base(None), entity)
    if not ids:
        return frozenset()
    beta = data_service.get_beta_version()
    if beta:
        ids |= _ids(data_service.BETA_DATA_DIR / beta, entity)
    for version in archived_versions():
        ids |= _ids(data_service._resolve_base(version), entity)
    return frozenset(ids)


def official_characters() -> frozenset[str]:
    """The playable cast, main plus beta. Falls back to the launch cast when
    the catalog cannot be read, so a bad read never empties every stat."""
    return official_ids("characters") or FALLBACK_CHARACTERS


def official_characters_ordered() -> tuple[str, ...]:
    """The cast in the site's display order: the launch five first, then
    any later character by id."""
    cast = official_characters()
    first = [c for c in LAUNCH_CAST if c in cast]
    return tuple(first + sorted(cast - set(first)))


def official_characters_sql() -> str:
    """The cast as a SQL list literal for an IN clause."""
    names = sorted(c for c in official_characters() if c.replace("_", "").isalnum())
    return "(" + ", ".join(f"'{c}'" for c in names) + ")"
