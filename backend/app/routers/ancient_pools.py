"""Ancient relic pool API endpoints."""

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/api/ancient-pools", tags=["Ancient Pools"])

DATA_FILE = Path(__file__).resolve().parents[3] / "data" / "ancient_pools.json"


def _load_pools() -> list[dict]:
    if not DATA_FILE.exists():
        return []
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


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
