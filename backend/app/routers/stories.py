"""Story API endpoints."""
from fastapi import APIRouter, HTTPException, Request
from ..models.schemas import Story
from ..services.data_service import load_stories

router = APIRouter(prefix="/api/stories", tags=["Stories"])


@router.get("", response_model=list[Story])
def get_stories(request: Request):
    return load_stories()


@router.get("/{story_id}", response_model=Story)
def get_story(request: Request, story_id: str):
    stories = load_stories()
    for story in stories:
        if story["id"] == story_id:
            return story
    raise HTTPException(status_code=404, detail=f"Story '{story_id}' not found")
