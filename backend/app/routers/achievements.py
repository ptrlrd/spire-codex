"""Achievement API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request
from ..models.schemas import Achievement
from ..services.data_service import load_achievements
from ..dependencies import get_lang

router = APIRouter(prefix="/api/achievements", tags=["Achievements"])


@router.get("", response_model=list[Achievement])
def get_achievements(request: Request, lang: str = Depends(get_lang)):
    return load_achievements(lang)


@router.get("/{achievement_id}", response_model=Achievement)
def get_achievement(
    request: Request, achievement_id: str, lang: str = Depends(get_lang)
):
    achievements = load_achievements(lang)
    for ach in achievements:
        if ach["id"] == achievement_id.upper():
            return ach
    raise HTTPException(
        status_code=404, detail=f"Achievement '{achievement_id}' not found"
    )
