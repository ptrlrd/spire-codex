"""Act API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request
from ..models.schemas import Act
from ..services.data_service import load_acts
from ..dependencies import get_lang

router = APIRouter(prefix="/api/acts", tags=["Acts"])


@router.get("", response_model=list[Act])
def get_acts(request: Request, lang: str = Depends(get_lang)):
    return load_acts(lang)


@router.get("/{act_id}", response_model=Act)
def get_act(request: Request, act_id: str, lang: str = Depends(get_lang)):
    acts = load_acts(lang)
    for act in acts:
        if act["id"] == act_id.upper():
            return act
    raise HTTPException(status_code=404, detail=f"Act '{act_id}' not found")
