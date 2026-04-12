"""Modifier API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request
from ..models.schemas import Modifier
from ..services.data_service import load_modifiers
from ..dependencies import get_lang

router = APIRouter(prefix="/api/modifiers", tags=["Modifiers"])


@router.get("", response_model=list[Modifier])
def get_modifiers(request: Request, lang: str = Depends(get_lang)):
    return load_modifiers(lang)


@router.get("/{modifier_id}", response_model=Modifier)
def get_modifier(request: Request, modifier_id: str, lang: str = Depends(get_lang)):
    modifiers = load_modifiers(lang)
    for mod in modifiers:
        if mod["id"] == modifier_id.upper():
            return mod
    raise HTTPException(status_code=404, detail=f"Modifier '{modifier_id}' not found")
