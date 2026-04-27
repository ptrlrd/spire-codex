"""Merchant pricing API.

Serves `data/merchant_config.json` produced by `merchant_parser.py`.
The shape is language-agnostic (just numbers + rarity keys), so this
router doesn't run translation — but it does honor the version
ContextVar so beta deployments can ship adjusted pricing without
touching stable. The frontend `/merchant` page consumes this instead
of hardcoding card / potion / relic / removal costs.
"""

import json

from fastapi import APIRouter, HTTPException, Request

from ..services.data_service import DATA_DIR, _resolve_base, _get_version

router = APIRouter(prefix="/api/merchant", tags=["Merchant"])


def _load_config() -> dict:
    """Read `merchant_config.json` from the version-resolved base, then
    fall back to `DATA_DIR` so an unversioned file at the data root
    works for both stable and beta layouts."""
    candidates = [
        _resolve_base(_get_version()) / "merchant_config.json",
        DATA_DIR / "merchant_config.json",
    ]
    for path in candidates:
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    return {}


@router.get("/config", tags=["Merchant"])
def get_merchant_config(request: Request) -> dict:
    """Return the parsed merchant pricing config — card / potion / relic
    cost tiers with min/max ranges, removal formula, and Fake-Merchant
    flat price. 404 if the file isn't present (parser hasn't run)."""
    config = _load_config()
    if not config:
        raise HTTPException(
            status_code=404,
            detail="merchant_config.json not found — run backend/app/parsers/parse_all.py",
        )
    return config
