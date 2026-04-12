"""Character API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from ..models.schemas import Character
from ..services.data_service import load_characters
from ..dependencies import get_lang, matches_search

router = APIRouter(prefix="/api/characters", tags=["Characters"])


@router.get("", response_model=list[Character])
def get_characters(
    request: Request,
    search: str | None = Query(None, description="Search by name or description"),
    lang: str = Depends(get_lang),
):
    characters = load_characters(lang)
    if search:
        characters = [
            c for c in characters if matches_search(c, search, ["name", "description"])
        ]
    return characters


@router.get("/{character_id}", response_model=Character)
def get_character(request: Request, character_id: str, lang: str = Depends(get_lang)):
    characters = load_characters(lang)
    for char in characters:
        if char["id"] == character_id.upper():
            return char
    raise HTTPException(status_code=404, detail=f"Character '{character_id}' not found")
