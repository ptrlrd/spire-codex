"""Epoch API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from ..models.schemas import Epoch
from ..services.data_service import load_epochs
from ..dependencies import get_lang

router = APIRouter(prefix="/api/epochs", tags=["Epochs"])


@router.get("", response_model=list[Epoch])
def get_epochs(
    request: Request,
    story: str | None = Query(None, description="Filter by story ID"),
    search: str | None = Query(
        None, description="Search by title, description, or unlock text"
    ),
    lang: str = Depends(get_lang),
):
    epochs = load_epochs(lang)
    if story:
        epochs = [
            e for e in epochs if (e.get("story_id") or "").lower() == story.lower()
        ]
    if search:
        term = search.lower()
        epochs = [
            e
            for e in epochs
            if term in (e.get("title") or "").lower()
            or term in (e.get("description") or "").lower()
            or term in (e.get("unlock_text") or "").lower()
        ]
    return epochs


@router.get("/{epoch_id}", response_model=Epoch)
def get_epoch(request: Request, epoch_id: str, lang: str = Depends(get_lang)):
    epochs = load_epochs(lang)
    lookup = epoch_id.lower()
    for epoch in epochs:
        if epoch["id"].lower() == lookup or epoch.get("slug") == lookup:
            return epoch
    raise HTTPException(status_code=404, detail=f"Epoch '{epoch_id}' not found")
