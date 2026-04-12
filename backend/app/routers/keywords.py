"""Keyword API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request
from ..models.schemas import Keyword
from ..services.data_service import load_keywords
from ..dependencies import get_lang

router = APIRouter(prefix="/api/keywords", tags=["Keywords"])


@router.get("", response_model=list[Keyword])
def get_keywords(request: Request, lang: str = Depends(get_lang)):
    return load_keywords(lang)


@router.get("/{keyword_id}", response_model=Keyword)
def get_keyword(request: Request, keyword_id: str, lang: str = Depends(get_lang)):
    keywords = load_keywords(lang)
    for kw in keywords:
        if kw["id"] == keyword_id.upper():
            return kw
    raise HTTPException(status_code=404, detail=f"Keyword '{keyword_id}' not found")
