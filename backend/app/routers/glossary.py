"""Glossary (game terms) API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request
from ..models.schemas import GlossaryTerm
from ..services.data_service import load_glossary
from ..dependencies import get_lang

router = APIRouter(prefix="/api/glossary", tags=["Glossary"])


@router.get("", response_model=list[GlossaryTerm])
def get_glossary(request: Request, lang: str = Depends(get_lang)):
    return load_glossary(lang)


@router.get("/{term_id}", response_model=GlossaryTerm)
def get_glossary_term(request: Request, term_id: str, lang: str = Depends(get_lang)):
    terms = load_glossary(lang)
    for term in terms:
        if term["id"] == term_id.upper():
            return term
    raise HTTPException(status_code=404, detail=f"Glossary term '{term_id}' not found")
