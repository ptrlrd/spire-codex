"""Merchant pricing config endpoint.

Exposes the parsed merchant config (card / potion / relic prices, removal
schedules, blacklist, fake-merchant constants) so the merchant page,
language wrappers, and the shop-inventory mechanics section can read live
values from the C# extraction instead of hardcoding numbers that drift
every patch.
"""

from fastapi import APIRouter, Depends, Request

from ..dependencies import get_lang
from ..services.data_service import load_merchant

router = APIRouter(prefix="/api/merchant", tags=["Merchant"])


@router.get("/config")
def get_merchant_config(request: Request, lang: str = Depends(get_lang)) -> dict:
    """Return the merchant pricing config for the requested language.

    Numeric values (base prices, variance, removal schedule, fake-merchant
    flat price) are universal; only the relic blacklist labels vary per
    language.
    """
    return load_merchant(lang)
