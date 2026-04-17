"""Badge API endpoints.

Badges are run-end mini-achievements awarded on the Game Over screen. They
ship as part of Major Update #1 (v0.103.2) and can be tiered (Bronze /
Silver / Gold) or single-tier, with some only attainable in multiplayer.
"""

from fastapi import APIRouter, Depends, HTTPException, Request

from ..dependencies import get_lang, matches_search
from ..models.schemas import Badge
from ..services.data_service import load_badges

router = APIRouter(prefix="/api/badges", tags=["Badges"])


@router.get("", response_model=list[Badge])
def get_badges(
    request: Request,
    lang: str = Depends(get_lang),
    tiered: bool | None = None,
    multiplayer_only: bool | None = None,
    requires_win: bool | None = None,
    search: str | None = None,
):
    badges = load_badges(lang)
    if tiered is not None:
        badges = [b for b in badges if b.get("tiered") == tiered]
    if multiplayer_only is not None:
        badges = [b for b in badges if b.get("multiplayer_only") == multiplayer_only]
    if requires_win is not None:
        badges = [b for b in badges if b.get("requires_win") == requires_win]
    if search:
        # Flatten tier titles/descriptions into a searchable string on a
        # shallow copy so matches_search's simple field lookup can hit them.
        def _with_tier_text(b: dict) -> dict:
            tier_text = " ".join(
                (t.get("title", "") + " " + t.get("description", ""))
                for t in b.get("tiers", [])
            )
            return {**b, "_tier_text": tier_text}

        badges = [
            b
            for b in badges
            if matches_search(
                _with_tier_text(b), search, ["name", "description", "_tier_text", "id"]
            )
        ]
    return badges


@router.get("/{badge_id}", response_model=Badge)
def get_badge(request: Request, badge_id: str, lang: str = Depends(get_lang)):
    badges = load_badges(lang)
    for b in badges:
        if b["id"] == badge_id.upper():
            return b
    raise HTTPException(status_code=404, detail=f"Badge '{badge_id}' not found")
