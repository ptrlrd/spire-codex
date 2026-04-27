"""Mechanics constants API.

Serves `data/mechanics_constants.json` produced by
`mechanics_constants_parser.py`. The shape is language-agnostic
(probabilities + thresholds + enum names), so this router doesn't
run translation. Honors the version ContextVar so beta deployments
can ship adjusted balance numbers without touching stable.

Frontend `/mechanics/<slug>` pages consume this instead of
hardcoding probabilities and formulas — closes the silent-drift
class of bug we kept hitting (e.g. card-rarity page showing 1.5%
when the actual value is 1.49%).
"""

import json

from fastapi import APIRouter, HTTPException, Request

from ..services.data_service import DATA_DIR, _resolve_base, _get_version

router = APIRouter(prefix="/api/mechanics", tags=["Mechanics"])


def _load_constants() -> dict:
    """Read `mechanics_constants.json` from the version-resolved base,
    falling back to `DATA_DIR` so an unversioned file works for both
    stable and beta layouts."""
    candidates = [
        _resolve_base(_get_version()) / "mechanics_constants.json",
        DATA_DIR / "mechanics_constants.json",
    ]
    for path in candidates:
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    return {}


@router.get("/constants", tags=["Mechanics"])
def get_mechanics_constants(request: Request) -> dict:
    """Return parsed mechanics constants — card-rarity / potion / unknown
    room probabilities, encounter gold ranges, ascension levels, combat
    multipliers, and AscensionHelper tuning numbers. 404 when the file
    isn't present (parser hasn't run)."""
    constants = _load_constants()
    if not constants:
        raise HTTPException(
            status_code=404,
            detail="mechanics_constants.json not found — run backend/app/parsers/parse_all.py",
        )
    return constants
