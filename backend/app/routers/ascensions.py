"""Ascension API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request
from ..models.schemas import Ascension
from ..services.data_service import load_ascensions
from ..dependencies import get_lang

router = APIRouter(prefix="/api/ascensions", tags=["Ascensions"])


@router.get("", response_model=list[Ascension])
def get_ascensions(request: Request, lang: str = Depends(get_lang)):
    return load_ascensions(lang)


@router.get("/{ascension_id}", response_model=Ascension)
def get_ascension(request: Request, ascension_id: str, lang: str = Depends(get_lang)):
    ascensions = load_ascensions(lang)
    for asc in ascensions:
        if asc["id"] == ascension_id.upper():
            return asc
    raise HTTPException(status_code=404, detail=f"Ascension '{ascension_id}' not found")
