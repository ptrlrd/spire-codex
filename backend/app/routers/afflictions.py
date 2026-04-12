"""Affliction API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request
from ..models.schemas import Affliction
from ..services.data_service import load_afflictions
from ..dependencies import get_lang

router = APIRouter(prefix="/api/afflictions", tags=["Afflictions"])


@router.get("", response_model=list[Affliction])
def get_afflictions(request: Request, lang: str = Depends(get_lang)):
    return load_afflictions(lang)


@router.get("/{affliction_id}", response_model=Affliction)
def get_affliction(request: Request, affliction_id: str, lang: str = Depends(get_lang)):
    afflictions = load_afflictions(lang)
    for aff in afflictions:
        if aff["id"] == affliction_id.upper():
            return aff
    raise HTTPException(
        status_code=404, detail=f"Affliction '{affliction_id}' not found"
    )
