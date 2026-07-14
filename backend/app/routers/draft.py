"""Offer-conditioned draft recommendations + the live draft advisor.

Read-only over the `draft_recs` cache built by `scripts.build_draft_recs`:
- GET  /api/draft-recs/{item_type}/{item_id}  — "you have this, players draft…"
- POST /api/draft-advice                        — rank an actual offer given a deck
Empty until that job has run.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.draft_recs import get_draft_recs, score_offer

router = APIRouter(prefix="/api", tags=["Draft"])


@router.get("/draft-recs/{item_type}/{item_id}")
def get_recs(item_type: str, item_id: str, lang: str = "eng"):
    """Given a card/relic you already have, the cards players most often draft
    when offered them, ranked by lift over each card's baseline take-rate. Each
    entry carries `pref` (take-rate given this context), `pref_base` (the card's
    overall take-rate), `lift`, `offers` (sample size), and `winrate`. Empty
    `recommends` until the build job has run."""
    if item_type not in ("cards", "relics"):
        raise HTTPException(status_code=400, detail="bad item_type")
    doc = get_draft_recs(item_type, item_id, lang)
    if not doc:
        return {"kind": item_type, "item_id": item_id.upper(), "recommends": []}
    return doc


class DraftAdviceRequest(BaseModel):
    deck: list[str] = Field(
        default_factory=list,
        description='Items already held, as "cards:ID" / "relics:ID" (bare ids default to a card).',
    )
    offered: list[str] = Field(
        default_factory=list, description="Card ids currently offered in the reward."
    )
    lang: str = "eng"


@router.post("/draft-advice")
def draft_advice(req: DraftAdviceRequest):
    """Rank the offered cards for the current deck. Each offered card starts at
    its baseline take-rate and is nudged by the lift of every held item that
    lists it (per-term clamped, naive-Bayes-style), so the result reflects what
    players who reached this state actually pick. Returns ranked cards with a
    score, the baseline, and the held items driving each one (`reasons`)."""
    if not req.offered:
        return {"ranked": []}
    return score_offer(req.deck, req.offered, req.lang)
