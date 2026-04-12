"""Potion API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from ..models.schemas import Potion
from ..services.data_service import load_potions, load_translation_maps
from ..dependencies import get_lang

router = APIRouter(prefix="/api/potions", tags=["Potions"])


@router.get("", response_model=list[Potion])
def get_potions(
    request: Request,
    rarity: str | None = Query(None, description="Filter by rarity"),
    pool: str | None = Query(None, description="Filter by character pool"),
    search: str | None = Query(None, description="Search by name or description"),
    lang: str = Depends(get_lang),
):
    potions = load_potions(lang)
    if rarity:
        maps = load_translation_maps(lang)
        rarity_localized = maps["potion_rarities"].get(rarity, rarity)
        potions = [p for p in potions if p["rarity"] == rarity_localized]
    if pool:
        potions = [p for p in potions if p.get("pool", "").lower() == pool.lower()]
    if search:
        q = search.lower()
        potions = [p for p in potions if q in p["name"].lower() or q in p.get("description", "").lower() or q in p.get("rarity", "").lower() or q in p.get("pool", "").lower()]
    return potions


@router.get("/{potion_id}", response_model=Potion)
def get_potion(request: Request, potion_id: str, lang: str = Depends(get_lang)):
    potions = load_potions(lang)
    for potion in potions:
        if potion["id"] == potion_id.upper():
            return potion
    raise HTTPException(status_code=404, detail=f"Potion '{potion_id}' not found")
