"""Unlocks API — aggregates epoch unlock data into a browsable list."""

from fastapi import APIRouter, Depends, Request

from ..services.data_service import (
    load_epochs,
    load_cards,
    load_relics,
    load_potions,
    load_events,
    load_characters,
)
from ..dependencies import get_lang

router = APIRouter(prefix="/api/unlocks", tags=["Unlocks"])

_UNLOCK_ORDER = ("SILENT", "DEFECT", "REGENT", "NECROBINDER")


def _character_unlock_epochs(chars_map: dict, epoch_map: dict) -> dict[str, str]:
    """Character id -> the epoch that unlocks it, for every character the
    catalog says needs unlocking."""
    later = [
        cid
        for cid, char in chars_map.items()
        if cid not in _UNLOCK_ORDER
        and char.get("unlocks_after")
        and f"{cid}1_EPOCH" in epoch_map
    ]
    return {
        cid: f"{cid}1_EPOCH" for cid in (*_UNLOCK_ORDER, *later) if cid in chars_map
    }


# Score thresholds from GetScoreThreshold() — 18 score-based unlocks
SCORE_THRESHOLDS = [
    200,
    500,
    750,
    1000,
    1250,
    1500,
    1600,
    1700,
    1800,
    1900,
    2000,
    2100,
    2200,
    2300,
    2400,
    2500,
    2500,
    2500,
]


@router.get("")
def get_unlocks(request: Request, lang: str = Depends(get_lang)):
    """Return all unlockable entities grouped by type, with epoch context."""
    epochs = load_epochs(lang)
    epoch_map = {e["id"]: e for e in epochs}

    # Build entity lookup maps
    cards_map = {c["id"]: c for c in load_cards(lang)}
    relics_map = {r["id"]: r for r in load_relics(lang)}
    potions_map = {p["id"]: p for p in load_potions(lang)}
    events_map = {e["id"]: e for e in load_events(lang)}
    chars_map = {c["id"]: c for c in load_characters(lang)}

    result = {"characters": [], "cards": [], "relics": [], "potions": [], "events": []}

    # Build score threshold map — score-based epochs sorted by sort_order
    score_epochs = sorted(
        [
            e
            for e in epochs
            if "accumulating score" in (e.get("unlock_info") or "").lower()
        ],
        key=lambda e: e.get("sort_order", 0),
    )
    score_threshold_map = {}
    for i, ep in enumerate(score_epochs):
        threshold = SCORE_THRESHOLDS[i] if i < len(SCORE_THRESHOLDS) else 2500
        score_threshold_map[ep["id"]] = (
            f"Reach [blue]{threshold:,}[/blue] cumulative score (unlock #{i + 1} of {len(score_epochs)})."
        )

    # Characters (only those that require unlocking)
    for char_id, epoch_id in _character_unlock_epochs(chars_map, epoch_map).items():
        epoch = epoch_map.get(epoch_id, {})
        char = chars_map.get(char_id, {})
        if char:
            result["characters"].append(
                {
                    "id": char_id,
                    "name": char.get("name", char_id),
                    "epoch_id": epoch_id,
                    "epoch_title": epoch.get("title", ""),
                    "era": epoch.get("era_name", epoch.get("era", "")),
                    "unlock_info": epoch.get("unlock_info", ""),
                    "sort_order": epoch.get("sort_order", 0),
                }
            )

    # Cards, relics, potions, events from epoch unlock lists
    for epoch in sorted(epochs, key=lambda e: e.get("sort_order", 0)):
        epoch_id = epoch["id"]
        epoch_title = epoch.get("title", "")
        era = epoch.get("era_name", epoch.get("era", ""))
        sort_order = epoch.get("sort_order", 0)
        story = epoch.get("story_id", "")
        unlock_info = score_threshold_map.get(epoch_id, epoch.get("unlock_info", ""))

        # Determine character association from story
        story_lower = story.lower() if story else ""
        character = None
        for char_name in (cid.lower() for cid in chars_map):
            if char_name in story_lower:
                character = char_name.capitalize()
                break
        if not character:
            character = "Shared"

        for card_id in epoch.get("unlocks_cards", []):
            card = cards_map.get(card_id, {})
            result["cards"].append(
                {
                    "id": card_id,
                    "name": card.get("name", card_id),
                    "type": card.get("type", ""),
                    "rarity": card.get("rarity", ""),
                    "color": card.get("color", ""),
                    "character": character,
                    "image_url": card.get("image_url"),
                    "epoch_id": epoch_id,
                    "epoch_title": epoch_title,
                    "era": era,
                    "unlock_info": unlock_info,
                    "sort_order": sort_order,
                }
            )

        for relic_id in epoch.get("unlocks_relics", []):
            relic = relics_map.get(relic_id, {})
            result["relics"].append(
                {
                    "id": relic_id,
                    "name": relic.get("name", relic_id),
                    "rarity": relic.get("rarity", ""),
                    "character": character,
                    "image_url": relic.get("image_url"),
                    "epoch_id": epoch_id,
                    "epoch_title": epoch_title,
                    "era": era,
                    "unlock_info": unlock_info,
                    "sort_order": sort_order,
                }
            )

        for potion_id in epoch.get("unlocks_potions", []):
            potion = potions_map.get(potion_id, {})
            result["potions"].append(
                {
                    "id": potion_id,
                    "name": potion.get("name", potion_id),
                    "rarity": potion.get("rarity", ""),
                    "character": character,
                    "image_url": potion.get("image_url"),
                    "epoch_id": epoch_id,
                    "epoch_title": epoch_title,
                    "era": era,
                    "unlock_info": unlock_info,
                    "sort_order": sort_order,
                }
            )

        for event_id in epoch.get("unlocks_events", []):
            event = events_map.get(event_id, {})
            result["events"].append(
                {
                    "id": event_id,
                    "name": event.get("name", event_id),
                    "character": character,
                    "epoch_id": epoch_id,
                    "epoch_title": epoch_title,
                    "era": era,
                    "unlock_info": unlock_info,
                    "sort_order": sort_order,
                }
            )

    # Sort characters by sort_order
    result["characters"].sort(key=lambda x: x["sort_order"])

    return result
