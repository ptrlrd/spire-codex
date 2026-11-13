"""Game mode API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request

from ..dependencies import get_lang
from ..models.schemas import GameMode
from ..services.data_service import load_game_modes

router = APIRouter(prefix="/api/game-modes", tags=["Game Modes"])


@router.get("", response_model=list[GameMode])
def get_game_modes(request: Request, lang: str = Depends(get_lang)):
    return load_game_modes(lang)


@router.get("/{mode_id}", response_model=GameMode)
def get_game_mode(request: Request, mode_id: str, lang: str = Depends(get_lang)):
    for mode in load_game_modes(lang):
        if mode["id"] == mode_id.upper():
            return mode
    raise HTTPException(status_code=404, detail=f"Game mode '{mode_id}' not found")
