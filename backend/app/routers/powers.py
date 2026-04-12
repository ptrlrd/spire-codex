"""Power/buff/debuff API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from ..models.schemas import Power
from ..services.data_service import load_powers
from ..dependencies import get_lang, matches_search

router = APIRouter(prefix="/api/powers", tags=["Powers"])


@router.get("", response_model=list[Power])
def get_powers(
    request: Request,
    type: str | None = Query(None, description="Filter by type (Buff/Debuff)"),
    stack_type: str | None = Query(
        None, description="Filter by stack type (Counter/Single/None)"
    ),
    search: str | None = Query(None, description="Search by name or description"),
    lang: str = Depends(get_lang),
):
    powers = load_powers(lang)
    if type:
        powers = [p for p in powers if p["type"].lower() == type.lower()]
    if stack_type:
        powers = [
            p for p in powers if p.get("stack_type", "").lower() == stack_type.lower()
        ]
    if search:
        powers = [
            p
            for p in powers
            if matches_search(p, search, ["name", "description", "type"])
        ]
    return powers


@router.get("/{power_id}", response_model=Power)
def get_power(request: Request, power_id: str, lang: str = Depends(get_lang)):
    powers = load_powers(lang)
    for power in powers:
        if power["id"] == power_id.upper():
            return power
    raise HTTPException(status_code=404, detail=f"Power '{power_id}' not found")
