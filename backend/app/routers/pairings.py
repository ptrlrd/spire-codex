"""Cached item-pairings (card / relic / potion co-occurrence synergies).

Read-only: served from the `item_pairings` collection built by the
`scripts.build_pairings` job. O(1) per lookup, empty until that job has run.
"""

from fastapi import APIRouter, HTTPException

from ..services.item_pairings import get_pairings

router = APIRouter(prefix="/api/pairings", tags=["Pairings"])


@router.get("/{item_type}/{item_id}")
def get_item_pairings(item_type: str, item_id: str, lang: str = "eng"):
    """Which cards / relics / potions show up in the same runs as this item.

    Each partner carries `co` (co-occurrence count), both confidence directions
    — `conf` (of the runs with THIS item, the fraction that also run the partner)
    and `conf_rev` (the reverse, of the partner's runs the fraction that also run
    this item) — `npmi` (symmetric synergy, >0 = played together more than
    chance), and `winrate` (the pair's win rate). Cards/relics are ranked by
    NPMI; potions are ranked by frequency and are "commonly seen with", not a
    synergy claim. Returns an empty `partners` map until the build job has run.
    """
    if item_type not in ("cards", "relics", "potions"):
        raise HTTPException(status_code=400, detail="bad item_type")
    doc = get_pairings(item_type, item_id, lang)
    if not doc:
        return {"kind": item_type, "item_id": item_id.upper(), "partners": {}}
    return doc
