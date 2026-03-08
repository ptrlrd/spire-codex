"""Enchantment API endpoints."""
from fastapi import APIRouter, HTTPException, Query, Request
from ..models.schemas import Enchantment
from ..services.data_service import load_enchantments

router = APIRouter(prefix="/api/enchantments", tags=["Enchantments"])


@router.get("", response_model=list[Enchantment])
def get_enchantments(
    request: Request,
    card_type: str | None = Query(None, description="Filter by card type restriction (Attack, Skill, Power)"),
    search: str | None = Query(None, description="Search by name"),
):
    enchantments = load_enchantments()
    if card_type:
        enchantments = [e for e in enchantments if e.get("card_type") and e["card_type"].lower() == card_type.lower()]
    if search:
        enchantments = [e for e in enchantments if search.lower() in e["name"].lower()]
    return enchantments


@router.get("/{enchantment_id}", response_model=Enchantment)
def get_enchantment(request: Request, enchantment_id: str):
    enchantments = load_enchantments()
    for e in enchantments:
        if e["id"] == enchantment_id.upper():
            return e
    raise HTTPException(status_code=404, detail=f"Enchantment '{enchantment_id}' not found")
