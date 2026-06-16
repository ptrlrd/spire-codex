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

from fastapi import APIRouter, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter(prefix="/api/mods", tags=["Mods"])
limiter = Limiter(key_func=get_remote_address)

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
