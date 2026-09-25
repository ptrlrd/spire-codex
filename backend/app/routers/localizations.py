""" The games own localisation messages, converted for use on the codex website"""
from fastapi import APIRouter, Depends, HTTPException, Request

from ..services.data_service import localization_table_names, load_localization
from ..dependencies import get_lang

router = APIRouter(prefix="/api/localizations", tags=["Languages"])
@router.get("", response_model=dict)
def get_localizations(
    request: Request,
    lang: str = Depends(get_lang),
):
    return {
                table: load_localization(lang, table)
                for table in localization_table_names(lang)
            }
        


@router.get("/{table}", response_model=dict)
def get_localization(request: Request, table: str, lang: str = Depends(get_lang)):
    tables = localization_table_names(lang)
    if table in tables:
        return load_localization(lang, table)
    raise HTTPException(status_code=404, detail=f"Localization table {table} was not found.")
