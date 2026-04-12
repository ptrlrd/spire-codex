"""Relic API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from ..models.schemas import Relic
from ..services.data_service import load_relics, load_translation_maps
from ..dependencies import get_lang, matches_search

router = APIRouter(prefix="/api/relics", tags=["Relics"])


@router.get("", response_model=list[Relic])
def get_relics(
    request: Request,
    rarity: str | None = Query(
        None,
        description="Filter by rarity (Starter, Common, Uncommon, Rare, Shop, Event, Ancient)",
    ),
    pool: str | None = Query(
        None,
        description="Filter by character pool (ironclad, silent, defect, necrobinder, regent, shared)",
    ),
    search: str | None = Query(None, description="Search by name or description"),
    lang: str = Depends(get_lang),
):
    relics = [r for r in load_relics(lang) if not r["id"].startswith("VAKUU_CARD")]
    if rarity:
        maps = load_translation_maps(lang)
        rarity_localized = maps["relic_rarities"].get(rarity, rarity)
        relics = [r for r in relics if r["rarity"] == rarity_localized]
    if pool:
        relics = [r for r in relics if r["pool"].lower() == pool.lower()]
    if search:
        relics = [
            r
            for r in relics
            if matches_search(r, search, ["name", "description", "rarity", "pool"])
        ]
    return relics


@router.get("/{relic_id}", response_model=Relic)
def get_relic(request: Request, relic_id: str, lang: str = Depends(get_lang)):
    relics = load_relics(lang)
    for relic in relics:
        if relic["id"] == relic_id.upper():
            return relic
    raise HTTPException(status_code=404, detail=f"Relic '{relic_id}' not found")
