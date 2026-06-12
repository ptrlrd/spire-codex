"""Stable-vs-beta diff index: which entities the current beta adds, changes,
or removes. One computation per beta version, cached in-process; this single
index powers every beta label on the site (BETA badges, "changed in beta"
cross-links, the /beta what's-new page).

Comparison runs on the English catalogs (ids and gameplay fields are
language-independent) with presentation-only keys excluded, so an art or
ordering touch doesn't flag a card as changed.
"""

from __future__ import annotations

import logging
import threading
from typing import Any, Callable

from . import data_service

logger = logging.getLogger(__name__)

# Entity types worth diffing (the gameplay catalogs).
_ENTITY_LOADERS: dict[str, Callable[..., list[dict]]] = {
    "cards": data_service.load_cards,
    "relics": data_service.load_relics,
    "potions": data_service.load_potions,
    "enchantments": data_service.load_enchantments,
    "encounters": data_service.load_encounters,
    "events": data_service.load_events,
    "powers": data_service.load_powers,
    "keywords": data_service.load_keywords,
    "monsters": data_service.load_monsters,
    "orbs": data_service.load_orbs,
}

# Presentation/ordering keys that change without any gameplay difference.
_NOISE_KEYS = frozenset(
    {
        "image_url",
        "beta_image_url",
        "image_variants",
        "image_url_card",
        "image_url_card_upg",
        "compendium_order",
        "name_variants",
        "notes",
    }
)

_lock = threading.Lock()
_cached: dict[str, Any] | None = None
_cached_version: str | None = None


def _normalize(entry: dict) -> dict:
    return {k: v for k, v in entry.items() if k not in _NOISE_KEYS}


def _diff_type(stable: list[dict], beta: list[dict]) -> dict[str, Any]:
    s_by_id = {e["id"]: e for e in stable if isinstance(e, dict) and e.get("id")}
    b_by_id = {e["id"]: e for e in beta if isinstance(e, dict) and e.get("id")}
    added = sorted(set(b_by_id) - set(s_by_id))
    removed = sorted(set(s_by_id) - set(b_by_id))
    changed: dict[str, list[str]] = {}
    for eid in set(s_by_id) & set(b_by_id):
        s_norm = _normalize(s_by_id[eid])
        b_norm = _normalize(b_by_id[eid])
        if s_norm != b_norm:
            fields = sorted(
                k for k in set(s_norm) | set(b_norm) if s_norm.get(k) != b_norm.get(k)
            )
            changed[eid] = fields
    return {"added": added, "changed": changed, "removed": removed}


def _load_channel(loader: Callable[..., list[dict]], channel: str) -> list[dict]:
    """Run a data_service loader pinned to one channel, regardless of the
    calling request's own channel context."""
    token = data_service.current_channel.set(channel)
    try:
        return loader(data_service.DEFAULT_LANG)
    finally:
        data_service.current_channel.reset(token)


def get_beta_diff() -> dict[str, Any]:
    """The diff index for the current beta version. Cached until the beta
    `latest` pointer moves; empty-shaped when no beta data exists."""
    global _cached, _cached_version
    beta_version = data_service.get_beta_version()
    if not beta_version:
        return {"beta_version": None, "types": {}}
    if _cached is not None and _cached_version == beta_version:
        return _cached
    with _lock:
        if _cached is not None and _cached_version == beta_version:
            return _cached
        types: dict[str, Any] = {}
        for etype, loader in _ENTITY_LOADERS.items():
            try:
                stable = _load_channel(loader, "stable")
                beta = _load_channel(loader, "beta")
                types[etype] = _diff_type(stable, beta)
            except Exception:
                logger.warning("beta diff failed for %s", etype, exc_info=True)
                types[etype] = {"added": [], "changed": {}, "removed": []}
        result = {"beta_version": beta_version, "types": types}
        _cached = result
        _cached_version = beta_version
        return result
