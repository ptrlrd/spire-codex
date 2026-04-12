"""Orb API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request
from ..models.schemas import Orb
from ..services.data_service import load_orbs
from ..dependencies import get_lang

router = APIRouter(prefix="/api/orbs", tags=["Orbs"])


@router.get("", response_model=list[Orb])
def get_orbs(request: Request, lang: str = Depends(get_lang)):
    return load_orbs(lang)


@router.get("/{orb_id}", response_model=Orb)
def get_orb(request: Request, orb_id: str, lang: str = Depends(get_lang)):
    orbs = load_orbs(lang)
    for orb in orbs:
        if orb["id"] == orb_id.upper():
            return orb
    raise HTTPException(status_code=404, detail=f"Orb '{orb_id}' not found")
