"""Ancient relic pool API endpoints."""

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

from ..services.data_service import (
    BETA_DATA_DIR,
    DATA_DIR,
    _resolve_base,
    _get_version,
    get_beta_version,
    get_channel,
)

router = APIRouter(prefix="/api/ancient-pools", tags=["Ancient Pools"])


def _candidates(filename: str) -> list[Path]:
    """Channel-aware lookup order: per-version file first, then the data root."""
    if get_channel() == "beta":
        version = _get_version() or get_beta_version()
        paths = []
        if version:
            paths.append(BETA_DATA_DIR / version / filename)
        paths.append(BETA_DATA_DIR / filename)
        paths.append(DATA_DIR / filename)
        return paths
    return [
        _resolve_base(_get_version()) / filename,
        DATA_DIR / filename,
    ]


def _load_pools() -> list[dict]:
    """Load ancient_pools.json and enrich each entry with the parser's
    `per_character_relics` set (relic IDs the ancient offers as 5
    distinct character-skinned options in-game — currently just
    SEA_GLASS via Orobas's DiscoveryTotems).
    """
    candidates = _candidates("ancient_pools.json")
    pools: list[dict] = []
    for path in candidates:
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                pools = json.load(f)
            break
    if not pools:
        return []

    # Merge the parser's per-character expansion data. Lookup is best-effort:
    # if the parsed file is missing (parser hasn't run yet), the response
    # is identical to the hand file alone — `per_character_relics` just
    # stays absent so the frontend treats every relic as single-option.
    parsed_candidates = _candidates("ancient_pools_parsed.json")
    parsed: dict[str, list[str]] = {}
    for path in parsed_candidates:
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                for entry in json.load(f):
                    parsed[entry["id"]] = entry.get("per_character_relics") or []
            break
    for ancient in pools:
        ancient["per_character_relics"] = parsed.get(ancient["id"], [])
    return pools


@router.get("", tags=["Ancient Pools"])
def list_ancient_pools(request: Request):
    """Return all ancient relic pools."""
    return _load_pools()


@router.get("/{ancient_id}", tags=["Ancient Pools"])
def get_ancient_pool(ancient_id: str, request: Request):
    """Return relic pools for a specific ancient."""
    pools = _load_pools()
    for pool in pools:
        if pool["id"] == ancient_id.upper():
            return pool
    raise HTTPException(status_code=404, detail=f"Ancient '{ancient_id}' not found")
