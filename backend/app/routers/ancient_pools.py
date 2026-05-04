"""Ancient relic pool API endpoints."""

import json

from fastapi import APIRouter, HTTPException, Request

from ..services.data_service import DATA_DIR, _resolve_base, _get_version

router = APIRouter(prefix="/api/ancient-pools", tags=["Ancient Pools"])


def _load_pools() -> list[dict]:
    """Load ancient_pools.json and enrich each entry with the parser's
    `per_character_relics` set (relic IDs the ancient offers as 5
    distinct character-skinned options in-game — currently just
    SEA_GLASS via Orobas's DiscoveryTotems).

    Tries the version-resolved base first (so beta versions can ship their own
    file), then falls back to DATA_DIR so an unversioned file at the data root
    works for both stable and beta layouts. Same lookup order for the
    parsed companion file so a beta drop can override its enrichment.
    """
    candidates = [
        _resolve_base(_get_version()) / "ancient_pools.json",
        DATA_DIR / "ancient_pools.json",
    ]
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
    parsed_candidates = [
        _resolve_base(_get_version()) / "ancient_pools_parsed.json",
        DATA_DIR / "ancient_pools_parsed.json",
    ]
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
