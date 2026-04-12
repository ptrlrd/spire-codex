"""Monster API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from ..models.schemas import Monster
from ..services.data_service import load_monsters
from ..dependencies import get_lang, matches_search

router = APIRouter(prefix="/api/monsters", tags=["Monsters"])


@router.get("", response_model=list[Monster])
def get_monsters(
    request: Request,
    type: str | None = Query(None, description="Filter by type (Normal, Elite, Boss)"),
    search: str | None = Query(None, description="Search by name or description"),
    lang: str = Depends(get_lang),
):
    monsters = load_monsters(lang)
    if type:
        monsters = [m for m in monsters if m["type"].lower() == type.lower()]
    if search:
        monsters = [m for m in monsters if matches_search(m, search, ["name", "type"])]
    return monsters


@router.get("/{monster_id}", response_model=Monster)
def get_monster(request: Request, monster_id: str, lang: str = Depends(get_lang)):
    monsters = load_monsters(lang)
    for monster in monsters:
        if monster["id"] == monster_id.upper():
            return monster
    raise HTTPException(status_code=404, detail=f"Monster '{monster_id}' not found")
