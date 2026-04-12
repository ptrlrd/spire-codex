"""Enchantment API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from ..models.schemas import Enchantment
from ..services.data_service import load_enchantments
from ..dependencies import get_lang, matches_search

router = APIRouter(prefix="/api/enchantments", tags=["Enchantments"])


@router.get("", response_model=list[Enchantment])
def get_enchantments(
    request: Request,
    card_type: str | None = Query(
        None, description="Filter by card type restriction (Attack, Skill, Power)"
    ),
    search: str | None = Query(None, description="Search by name or description"),
    lang: str = Depends(get_lang),
):
    enchantments = load_enchantments(lang)
    if card_type:
        enchantments = [
            e
            for e in enchantments
            if e.get("card_type") and e["card_type"].lower() == card_type.lower()
        ]
    if search:
        enchantments = [
            e
            for e in enchantments
            if matches_search(e, search, ["name", "description", "card_type"])
        ]
    return enchantments


@router.get("/{enchantment_id}", response_model=Enchantment)
def get_enchantment(
    request: Request, enchantment_id: str, lang: str = Depends(get_lang)
):
    enchantments = load_enchantments(lang)
    for e in enchantments:
        if e["id"] == enchantment_id.upper():
            return e
    raise HTTPException(
        status_code=404, detail=f"Enchantment '{enchantment_id}' not found"
    )
