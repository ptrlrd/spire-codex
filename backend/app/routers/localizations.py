"""The game's own localization tables, converted to ICU MessageFormat for
next-intl, served per language and channel."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from ..dependencies import get_lang, shared_limiter
from ..services import rate_limit_config
from ..services.data_service import (
    load_localization,
    load_localization_pack,
    localization_table_names,
)

router = APIRouter(prefix="/api/localizations", tags=["Languages"])
limiter = shared_limiter
CACHE = "public, max-age=3600"
MAX_TABLES = 50
NO_STORE = "no-store"


@router.get("", response_model=dict)
@limiter.limit(rate_limit_config.endpoint_limit("localizations.pack", "120/minute"))
def get_localizations(
    request: Request,
    response: Response,
    lang: str = Depends(get_lang),
    tables: str | None = Query(
        default=None, description="Comma-separated table names; all when omitted"
    ),
):
    """Every localization table for the language, or only the ones named in
    `tables` (unknown names are 404)."""
    pack = load_localization_pack(lang)
    response.headers["Cache-Control"] = CACHE if pack else NO_STORE
    if not tables:
        return pack
    wanted = list(dict.fromkeys(t.strip() for t in tables.split(",") if t.strip()))
    if len(wanted) > MAX_TABLES:
        raise HTTPException(
            status_code=400, detail=f"At most {MAX_TABLES} tables per request"
        )
    missing = [t for t in wanted if t not in pack]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Localization table(s) not found: {', '.join(missing)}",
        )
    return {t: pack[t] for t in wanted}


@router.get("/tables", response_model=list[str])
@limiter.limit(rate_limit_config.endpoint_limit("localizations.tables", "120/minute"))
def get_localization_tables(
    request: Request, response: Response, lang: str = Depends(get_lang)
):
    names = localization_table_names(lang)
    response.headers["Cache-Control"] = CACHE if names else NO_STORE
    return names


@router.get("/{table}", response_model=dict)
@limiter.limit(rate_limit_config.endpoint_limit("localizations.table", "240/minute"))
def get_localization(
    request: Request, response: Response, table: str, lang: str = Depends(get_lang)
):
    found = load_localization(lang, table)
    if found is None:
        raise HTTPException(
            status_code=404, detail=f"Localization table {table} was not found."
        )
    response.headers["Cache-Control"] = CACHE
    return found
