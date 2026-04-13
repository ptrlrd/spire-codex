"""Card Builder — create custom cards and export C# + localization."""

import re
from fastapi import APIRouter, HTTPException, Request

from ..services.card_builder_db import (
    create_card,
    update_card,
    delete_card,
    get_card_by_id,
    get_card_by_share_code,
    list_cards_by_creator,
    list_recent_cards,
)
from ..services.card_codegen import generate_full_export

router = APIRouter(prefix="/api/card-builder", tags=["Card Builder"])

MAX_BODY_SIZE = 64 * 1024  # 64 KB

VALID_TYPES = {"Attack", "Skill", "Power", "Status", "Curse"}
VALID_RARITIES = {"Basic", "Common", "Uncommon", "Rare", "Token"}
VALID_TARGETS = {"Self", "AnyEnemy", "AllEnemies", "RandomEnemy", "None"}
VALID_POOLS = {"Ironclad", "Silent", "Defect", "Necrobinder", "Regent", ""}
VALID_KEYWORDS = {
    "Exhaust",
    "Ethereal",
    "Innate",
    "Retain",
    "Sly",
    "Eternal",
    "Unplayable",
}
VALID_TAGS = {"Strike", "Defend"}


def _sanitize_name(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9 '\-]", "", name.strip())[:60].strip()


def _to_class_name(name: str) -> str:
    return "".join(
        word.capitalize() for word in re.sub(r"[^a-zA-Z0-9 ]", "", name).split() if word
    )


def _validate_card_data(data: dict) -> dict:
    """Validate and sanitize card builder input."""
    name = _sanitize_name(data.get("name", ""))
    if not name:
        raise HTTPException(status_code=400, detail="Card name is required")
    if len(name) < 2:
        raise HTTPException(
            status_code=400, detail="Card name must be at least 2 characters"
        )

    class_name = data.get("class_name") or _to_class_name(name)
    class_name = re.sub(r"[^a-zA-Z0-9]", "", class_name)[:60]
    if not class_name:
        raise HTTPException(status_code=400, detail="Invalid class name")

    card_type = data.get("type", "Attack")
    if card_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid type: {card_type}")

    rarity = data.get("rarity", "Common")
    if rarity not in VALID_RARITIES:
        raise HTTPException(status_code=400, detail=f"Invalid rarity: {rarity}")

    target = data.get("target", "AnyEnemy")
    if target not in VALID_TARGETS:
        raise HTTPException(status_code=400, detail=f"Invalid target: {target}")

    pool = data.get("pool", "")
    if pool not in VALID_POOLS:
        raise HTTPException(status_code=400, detail=f"Invalid pool: {pool}")

    cost = data.get("cost", 1)
    if not isinstance(cost, int) or cost < -2 or cost > 99:
        raise HTTPException(status_code=400, detail="Cost must be between -2 and 99")

    keywords = [k for k in data.get("keywords", []) if k in VALID_KEYWORDS]
    tags = [t for t in data.get("tags", []) if t in VALID_TAGS]

    damage = data.get("damage")
    if damage is not None:
        damage = max(0, min(int(damage), 999))
    block = data.get("block")
    if block is not None:
        block = max(0, min(int(block), 999))

    hit_count = data.get("hit_count")
    if hit_count is not None:
        hit_count = max(1, min(int(hit_count), 20))

    cards_draw = data.get("cards_draw")
    if cards_draw is not None:
        cards_draw = max(0, min(int(cards_draw), 10))

    energy_gain = data.get("energy_gain")
    if energy_gain is not None:
        energy_gain = max(0, min(int(energy_gain), 10))

    hp_loss = data.get("hp_loss")
    if hp_loss is not None:
        hp_loss = max(0, min(int(hp_loss), 999))

    powers_applied = []
    for p in data.get("powers_applied", [])[:5]:
        power = re.sub(r"[^a-zA-Z]", "", str(p.get("power", "")))[:40]
        amount = max(1, min(int(p.get("amount", 1)), 99))
        target_self = bool(p.get("target_self", False))
        if power:
            powers_applied.append(
                {"power": power, "amount": amount, "target_self": target_self}
            )

    upgrade = {}
    raw_upgrade = data.get("upgrade", {})
    if raw_upgrade.get("damage"):
        upgrade["damage"] = max(-99, min(int(raw_upgrade["damage"]), 99))
    if raw_upgrade.get("block"):
        upgrade["block"] = max(-99, min(int(raw_upgrade["block"]), 99))
    if raw_upgrade.get("cost") is not None:
        upgrade["cost"] = max(-5, min(int(raw_upgrade["cost"]), 5))
    if raw_upgrade.get("cards_draw"):
        upgrade["cards_draw"] = max(-5, min(int(raw_upgrade["cards_draw"]), 5))
    upgrade_powers = []
    for p in raw_upgrade.get("powers", [])[:5]:
        power = re.sub(r"[^a-zA-Z]", "", str(p.get("power", "")))[:40]
        amount = max(-99, min(int(p.get("amount", 1)), 99))
        if power:
            upgrade_powers.append({"power": power, "amount": amount})
    if upgrade_powers:
        upgrade["powers"] = upgrade_powers
    if raw_upgrade.get("add_keyword") and raw_upgrade["add_keyword"] in VALID_KEYWORDS:
        upgrade["add_keyword"] = raw_upgrade["add_keyword"]
    if (
        raw_upgrade.get("remove_keyword")
        and raw_upgrade["remove_keyword"] in VALID_KEYWORDS
    ):
        upgrade["remove_keyword"] = raw_upgrade["remove_keyword"]

    description = str(data.get("description", ""))[:500]
    upgrade_description = str(data.get("upgrade_description", ""))[:500]

    return {
        "name": name,
        "class_name": class_name,
        "type": card_type,
        "rarity": rarity,
        "target": target,
        "pool": pool,
        "cost": cost,
        "keywords": keywords,
        "tags": tags,
        "damage": damage,
        "block": block,
        "hit_count": hit_count,
        "cards_draw": cards_draw,
        "energy_gain": energy_gain,
        "hp_loss": hp_loss,
        "powers_applied": powers_applied,
        "upgrade": upgrade,
        "description": description,
        "upgrade_description": upgrade_description,
    }


@router.post("", tags=["Card Builder"])
async def create_card_endpoint(request: Request):
    body = await request.body()
    if len(body) > MAX_BODY_SIZE:
        raise HTTPException(status_code=413, detail="Request too large")
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    creator_hash = str(data.get("creator_hash", "")).strip()[:64]
    if not creator_hash:
        raise HTTPException(status_code=400, detail="creator_hash is required")

    card_data = _validate_card_data(data)
    result = create_card(
        creator_hash=creator_hash,
        name=card_data["name"],
        class_name=card_data["class_name"],
        card_data=card_data,
    )
    return result


@router.put("/{card_id}", tags=["Card Builder"])
async def update_card_endpoint(card_id: int, request: Request):
    body = await request.body()
    if len(body) > MAX_BODY_SIZE:
        raise HTTPException(status_code=413, detail="Request too large")
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    creator_hash = str(data.get("creator_hash", "")).strip()[:64]
    if not creator_hash:
        raise HTTPException(status_code=400, detail="creator_hash is required")

    card_data = _validate_card_data(data)
    result = update_card(
        card_id=card_id,
        creator_hash=creator_hash,
        name=card_data["name"],
        class_name=card_data["class_name"],
        card_data=card_data,
    )
    if not result:
        raise HTTPException(
            status_code=404, detail="Card not found or not owned by you"
        )
    return result


@router.delete("/{card_id}", tags=["Card Builder"])
async def delete_card_endpoint(card_id: int, request: Request, creator_hash: str = ""):
    if not creator_hash:
        raise HTTPException(status_code=400, detail="creator_hash is required")
    if not delete_card(card_id, creator_hash):
        raise HTTPException(
            status_code=404, detail="Card not found or not owned by you"
        )
    return {"success": True}


@router.get("/my-cards", tags=["Card Builder"])
def my_cards_endpoint(
    request: Request, creator_hash: str = "", page: int = 1, limit: int = 50
):
    if not creator_hash:
        raise HTTPException(status_code=400, detail="creator_hash is required")
    return list_cards_by_creator(creator_hash, page, limit)


@router.get("/recent", tags=["Card Builder"])
def recent_cards_endpoint(request: Request, page: int = 1, limit: int = 20):
    return list_recent_cards(page, limit)


@router.get("/shared/{share_code}", tags=["Card Builder"])
def get_shared_card(share_code: str, request: Request):
    card = get_card_by_share_code(share_code)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return card


@router.get("/{card_id}", tags=["Card Builder"])
def get_card_endpoint(card_id: int, request: Request):
    card = get_card_by_id(card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return card


@router.get("/{card_id}/export", tags=["Card Builder"])
def export_card(card_id: int, request: Request):
    card = get_card_by_id(card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return generate_full_export(card["card_data"])
