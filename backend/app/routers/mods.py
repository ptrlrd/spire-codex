"""Mod asset directory.

Curated list of community mods whose image repos supply entity art as the third
fallback after main and beta on the run and live pages. Each mod's images are
named by the in-game entity id (lowercased), so the frontend builds
`<raw_base>/<paths[type]>/<id>.<ext>` for an id that resolves in neither the
main nor beta catalog, and shows modded card/relic/potion art with no per-mod
code. The directory lives in data/mods.json; only vetted repos go in.
"""

import json
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..services.data_service import DEFAULT_LANG, load_mod_entities

router = APIRouter(prefix="/api/mods", tags=["Mods"])
limiter = Limiter(key_func=get_remote_address)

# Entity catalogs a mod can supply (parsed into data-mod/<key>/<lang>/).
_MOD_ENTITIES = {"cards", "relics", "potions"}

_DATA_DIR = Path(
    os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data")
)


def _load_mods() -> list[dict]:
    """The vetted mod entries from data/mods.json, or [] if absent/unreadable."""
    path = _DATA_DIR / "mods.json"
    if not path.exists():
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f).get("mods", [])
    except Exception:
        return []


@router.get("", tags=["Mods"])
@limiter.limit("120/minute")
def list_mods(request: Request):
    """The curated mod directory: each mod's repo art base and per-type
    subpaths, so clients can fall back to modded entity art by id."""
    return {"mods": _load_mods()}


@router.get("/{key}/{entity}", tags=["Mods"])
@limiter.limit("120/minute")
def mod_entities(request: Request, key: str, entity: str, lang: str = DEFAULT_LANG):
    """A mod's catalog for one entity type (cards/relics/potions) in the given
    language, so clients can resolve modded entities as the third fallback
    after stable and beta. Returns the same per-entity shape the stable
    /api/<entity> endpoints return."""
    if entity not in _MOD_ENTITIES:
        raise HTTPException(status_code=404, detail="unknown entity")
    if not any(m.get("key") == key for m in _load_mods()):
        raise HTTPException(status_code=404, detail="unknown mod")
    return {entity: load_mod_entities(key, entity, lang)}
