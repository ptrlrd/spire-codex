"""Card API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from ..models.schemas import Card
from ..services.data_service import load_cards, load_translation_maps
from ..dependencies import get_lang, matches_search

router = APIRouter(prefix="/api/cards", tags=["Cards"])


@router.get("", response_model=list[Card])
def get_cards(
    request: Request,
    color: str | None = Query(
        None,
        description="Filter by character color (ironclad, silent, defect, necrobinder, regent, colorless)",
    ),
    type: str | None = Query(
        None, description="Filter by card type (Attack, Skill, Power, Status, Curse)"
    ),
    rarity: str | None = Query(
        None, description="Filter by rarity (Basic, Common, Uncommon, Rare, Ancient)"
    ),
    keyword: str | None = Query(
        None,
        description="Filter by keyword (Exhaust, Innate, Ethereal, Retain, Unplayable, Sly, Eternal)",
    ),
    tag: str | None = Query(
        None, description="Filter by tag (Strike, Defend, Minion, etc.)"
    ),
    search: str | None = Query(None, description="Search by name or description"),
    lang: str = Depends(get_lang),
):
    cards = load_cards(lang)
    if color:
        cards = [c for c in cards if c["color"].lower() == color.lower()]
    if type or rarity or keyword:
        maps = load_translation_maps(lang)
    if type:
        type_localized = maps["card_types"].get(type, type)
        cards = [c for c in cards if c["type"] == type_localized]
    if rarity:
        rarity_localized = maps["card_rarities"].get(rarity, rarity)
        cards = [c for c in cards if c["rarity"] == rarity_localized]
    if keyword:
        kw_localized = maps["keywords"].get(keyword.upper(), keyword)
        cards = [
            c for c in cards if c.get("keywords") and kw_localized in c["keywords"]
        ]
    if tag:
        cards = [c for c in cards if c.get("tags") and tag in c["tags"]]
    if search:
        cards = [
            c
            for c in cards
            if matches_search(
                c,
                search,
                [
                    "name",
                    "description",
                    "upgrade_description",
                    "type",
                    "rarity",
                    "color",
                    "keywords",
                ],
            )
        ]
    return cards


@router.get("/{card_id}", response_model=Card)
def get_card(request: Request, card_id: str, lang: str = Depends(get_lang)):
    cards = load_cards(lang)
    for card in cards:
        if card["id"] == card_id.upper():
            return card
    raise HTTPException(status_code=404, detail=f"Card '{card_id}' not found")
