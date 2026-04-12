"""Intent API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request
from ..models.schemas import Intent
from ..services.data_service import load_intents
from ..dependencies import get_lang

router = APIRouter(prefix="/api/intents", tags=["Intents"])


@router.get("", response_model=list[Intent])
def get_intents(request: Request, lang: str = Depends(get_lang)):
    return load_intents(lang)


@router.get("/{intent_id}", response_model=Intent)
def get_intent(request: Request, intent_id: str, lang: str = Depends(get_lang)):
    intents = load_intents(lang)
    for intent in intents:
        if intent["id"] == intent_id.upper():
            return intent
    raise HTTPException(status_code=404, detail=f"Intent '{intent_id}' not found")
