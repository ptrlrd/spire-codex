"""Blitz mode's rules as the game code states them: the fixed act layout,
the opening card pick, the merchant's offers and odds, the room rewards,
the Ascension ladder and what the mode bans."""

import re
from pathlib import Path

from parser_paths import DECOMPILED

CORE = "MegaCrit.Sts2.Core"
ACT_MAP_FILE = DECOMPILED / f"{CORE}.Map" / "BlitzActMap.cs"
RUN_MODEL_FILE = DECOMPILED / f"{CORE}.Models.Blitz" / "BlitzRunModel.cs"
ODDS_FILE = DECOMPILED / f"{CORE}.Odds" / "CardRarityOdds.cs"
MERCHANT_DIR = DECOMPILED / f"{CORE}.Entities.Merchant"
ENTRY_TYPE_FILE = MERCHANT_DIR / "BlitzMerchantEntryType.cs"
ENTRY_FILE = MERCHANT_DIR / "BlitzMerchantEntry.cs"
INVENTORY_FILE = MERCHANT_DIR / "MerchantInventory.cs"
RELIC_LISTS_FILE = DECOMPILED / f"{CORE}.Helpers" / "RelicLists.cs"
CARDS_DIR = DECOMPILED / f"{CORE}.Models.Cards"
ASCENSION_LEVEL_FILE = DECOMPILED / f"{CORE}.Entities.Ascension" / "AscensionLevel.cs"
ACT_MODEL_FILE = DECOMPILED / f"{CORE}.Models" / "ActModel.cs"
RELICS_DIR = DECOMPILED / f"{CORE}.Models.Relics"
TREASURE_FILE = (
    DECOMPILED / f"{CORE}.Multiplayer.Game" / "TreasureRoomRelicSynchronizer.cs"
)
MERCHANT_PREFIX = "MERCHANT.blitz."


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.exists() else ""


def snake(name: str) -> str:
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name).upper()


def _enum(text: str, name: str) -> list[str]:
    body = re.search(rf"enum\s+{name}\s*\{{(.*?)\}}", text, re.DOTALL)
    if not body:
        return []
    return re.findall(r"\b([A-Z]\w*)\b", re.sub(r"///[^\n]*", "", body.group(1)))


def _const(text: str, name: str) -> float | None:
    found = re.search(rf"const\s+\w+\s+{name}\s*=\s*([\d.]+)f?\s*;", text)
    return float(found.group(1)) if found else None


def _odds(text: str, prefix: str) -> dict | None:
    odds = {
        rarity.lower(): _const(text, f"{prefix}{rarity}Odds")
        for rarity in ("Common", "Uncommon", "Rare")
    }
    return odds if all(v is not None for v in odds.values()) else None


def act_layout() -> list[str]:
    """Every act's rooms in order. The Ancient and the Boss frame the fixed
    middle the game lists in pointTypes."""
    body = re.search(r"pointTypes\s*=[^{]*\{(.*?)\}", _read(ACT_MAP_FILE), re.DOTALL)
    middle = re.findall(r"MapPointType\.(\w+)", body.group(1)) if body else []
    if not middle:
        return []
    return ["ANCIENT", *(snake(room) for room in middle), "BOSS"]


def neow_numbers() -> dict:
    text = _read(RUN_MODEL_FILE)
    offered = re.search(r"CardFactory\.CreateForReward\(player,\s*(\d+)", text)
    picked = re.search(r"selectionScreenPrompt\"\),\s*(\d+)\)", text)
    out: dict = {}
    if offered:
        out["cards_offered"] = int(offered.group(1))
    if picked:
        out["cards_picked"] = int(picked.group(1))
    odds = _odds(_read(ODDS_FILE), "blitzNeow")
    if odds:
        out["rarity_odds"] = odds
    return out


def shop_enchantments(enchantments: dict) -> list[dict]:
    found = re.findall(
        r"ModelDb\.Enchantment<(\w+)>\(\),\s*(\d+)\)", _read(RUN_MODEL_FILE)
    )
    return [
        {
            "id": snake(name),
            "name": enchantments.get(f"{snake(name)}.title", name),
            "amount": int(amount),
        }
        for name, amount in found
    ]


def merchant_rules(enchantments: dict) -> dict:
    inventory = _read(INVENTORY_FILE)
    shown = _const(inventory, "_blitzEntryCount")
    choices = _const(inventory, "_defaultBlitzChoices")
    rolled = re.search(
        r"GetBlitzEntries\(Player \w+\)\s*\{.*?\n\t\tint\s+\w+\s*=\s*(\d+)\s*;",
        inventory,
        re.DOTALL,
    )
    weight = re.search(
        r"RareBlitzEntries\.Contains\(e\)\)\s*\?\s*1f\s*:\s*([\d.]+)f", inventory
    )
    out: dict = {}
    if shown is not None:
        out["offers_shown"] = int(shown)
    if rolled and shown is not None:
        out["normal_offers_shown"] = int(rolled.group(1))
        out["cursed_offers_shown"] = int(shown) - int(rolled.group(1))
    if choices is not None:
        out["picks"] = int(choices)
    if weight:
        out["rare_offer_weight"] = float(weight.group(1))
    odds = _odds(_read(ODDS_FILE), "blitzShop")
    if odds:
        out["card_rarity_odds"] = odds
    options = shop_enchantments(enchantments)
    if options:
        out["enchantments"] = options
    return out


def _entry_text(text: str, enchantment: str | None) -> str:
    """Offer text with its runtime names filled in: the enchantment when the
    offer has a fixed one, the placeholder's own word otherwise."""
    if enchantment:
        text = text.replace("{Enchantment}", enchantment)
    text = re.sub(r"\{\}", "", text)
    while re.search(r"\{\w+:[^{}]*\}", text):
        text = re.sub(r"\{\w+:[^{}]*\}", "", text)
    return re.sub(r"\{(\w+)\}", r"\1", text).strip()


def merchant_entries(merchant: dict, enchantments: dict) -> list[dict]:
    """One row per offer the game can roll, in the game's own order. Text
    left over from an offer the game no longer has is skipped."""
    types = _enum(_read(ENTRY_TYPE_FILE), "BlitzMerchantEntryType")
    entry = _read(ENTRY_FILE)
    first_cursed = re.search(
        r"firstCursedOption\s*=\s*BlitzMerchantEntryType\.(\w+)", entry
    )
    cursed_from = (
        types.index(first_cursed.group(1))
        if first_cursed and first_cursed.group(1) in types
        else len(types)
    )
    rare_block = re.search(r"RareBlitzEntries\s*\{(.*?)return", entry, re.DOTALL)
    rare = set(
        re.findall(r"BlitzMerchantEntryType\.(\w+)", rare_block.group(1))
        if rare_block
        else []
    )
    out = []
    for index, name in enumerate(types):
        key = f"{MERCHANT_PREFIX}{snake(name).lower()}_entry"
        if f"{key}.title" not in merchant:
            continue
        fixed = None
        source = _read(MERCHANT_DIR / f"BlitzMerchant{name}Entry.cs")
        pinned = re.search(r"ModelDb\.Enchantment<(\w+)>\(\)", source)
        if pinned:
            fixed = enchantments.get(f"{snake(pinned.group(1))}.title", pinned.group(1))
        out.append(
            {
                "id": snake(name),
                "name": _entry_text(merchant[f"{key}.title"], fixed),
                "description": _entry_text(
                    merchant.get(f"{key}.description", ""), fixed
                ),
                "cursed": index >= cursed_from,
                "rare": name in rare,
            }
        )
    return out


def room_rewards() -> list[dict]:
    """What each fight pays out, read branch by branch from the method that
    replaces the standard rewards."""
    body = re.search(
        r"TryReplaceDefaultRoomRewards\(.*?\)\s*\{(.*?)\n\t\}",
        _read(RUN_MODEL_FILE),
        re.DOTALL,
    )
    if not body:
        return []
    text = body.group(1)
    marks = [(m.start(), m.group(1)) for m in re.finditer(r"RoomType\.(\w+)", text)]
    out = []
    seen: set[str] = set()
    for i, (start, room) in enumerate(marks):
        if room in seen:
            continue
        end = next((pos for pos, other in marks[i + 1 :] if other != room), len(text))
        branch = text[start:end]
        rarity = re.search(r"CardRarity\.(\w+)", branch)
        if not rarity:
            continue
        seen.add(room)
        cards = re.search(r"CardRarity\.\w+\),\s*(\d+)", branch)
        row = {
            "room": snake(room),
            "card_rarity": rarity.group(1),
            "card_choices": int(cards.group(1)) if cards else None,
            "relics": branch.count("new RelicReward"),
            "potion": None,
        }
        if "new PotionReward" in branch:
            row["potion"] = "after_first_fight" if "IsWeak" in branch else "always"
        if room == "Boss" and re.search(r"CurrentActIndex\s*>=\s*\d", branch):
            row["final_boss"] = False
        out.append(row)
    return out


def reward_upgrades_by_act() -> list[int]:
    """How many of a fight's card choices come upgraded in each act."""
    body = re.search(
        r"TryModifyCardRewardOptionsLate\(.*?\)\s*\{(.*?)\n\t\}",
        _read(RUN_MODEL_FILE),
        re.DOTALL,
    )
    if not body:
        return []
    text = body.group(1)
    counts: dict[int, int] = {}
    skipped = re.search(r"CurrentActIndex == (\d+)\)\s*\{\s*return false", text)
    if skipped:
        counts[int(skipped.group(1))] = 0
    for act, branch in re.findall(
        r"CurrentActIndex == (\d+)\)\s*\{(.*?)\n\t\t\}", text, re.DOTALL
    ):
        if "return false" in branch:
            continue
        taken = re.search(r"Take\((\d+)\)", branch)
        counts[int(act)] = int(taken.group(1)) if taken else 1
    return [counts[act] for act in sorted(counts)]


def treasure_extra_relics() -> dict:
    block = re.search(
        r"GameMode == GameMode\.Blitz\)\s*\{(.*?)for \(",
        _read(TREASURE_FILE),
        re.DOTALL,
    )
    if not block:
        return {}
    counts = [int(n) for n in re.findall(r"\bnum = (\d+);", block.group(1))]
    if len(counts) != 2:
        return {}
    return {"multiplayer": counts[0], "singleplayer": counts[1]}


def ascension_ladder(levels: list[str], ascension: dict) -> list[dict]:
    order = _enum(_read(ASCENSION_LEVEL_FILE), "AscensionLevel")
    out = []
    for step, name in enumerate(levels, start=1):
        if name not in order:
            continue
        key = f"LEVEL_{order.index(name):02d}"
        out.append(
            {
                "level": step,
                "id": snake(name),
                "name": ascension.get(f"{key}.title", name),
                "description": ascension.get(f"{key}.description"),
            }
        )
    return out


def _named(ids: list[str], table: dict) -> list[dict]:
    return [{"id": i, "name": table.get(f"{i}.title", i)} for i in ids]


def banned_cards(cards: dict) -> list[dict]:
    if not CARDS_DIR.is_dir():
        return []
    ids = sorted(
        snake(path.stem)
        for path in CARDS_DIR.glob("*.cs")
        if "IsAllowedInBlitz => false" in path.read_text(encoding="utf-8")
    )
    return _named(ids, cards)


def banned_relics(relics: dict) -> list[dict]:
    block = re.search(
        r"notAllowedInBlitz\s*=[^{]*\{(.*?)\};", _read(RELIC_LISTS_FILE), re.DOTALL
    )
    names = re.findall(r"GetId<(\w+)>", block.group(1)) if block else []
    return _named(sorted(snake(name) for name in names), relics)


ROOM_LEGEND = {
    "MONSTER": "LEGEND_ENEMY",
    "SHOP": "LEGEND_MERCHANT",
    "REST_SITE": "LEGEND_REST",
}


def room_name(room: str, legend: dict) -> str:
    key = ROOM_LEGEND.get(room, f"LEGEND_{room}")
    return legend.get(f"{key}.title") or room.replace("_", " ").title()


def weak_encounters_per_act() -> int | None:
    """How many of an act's regular fights come from its easy pool."""
    found = re.search(r"isBlitz\s*\?\s*(\d+)\s*:", _read(ACT_MODEL_FILE))
    return int(found.group(1)) if found else None


def merchant_curses(cards: dict) -> list[dict]:
    """The curses a cursed offer can hand out: every curse the game lets
    modifiers generate, minus the ones the mode bans."""
    if not CARDS_DIR.is_dir():
        return []
    ids = []
    for path in sorted(CARDS_DIR.glob("*.cs")):
        text = path.read_text(encoding="utf-8")
        if not re.search(r"base\([^)]*CardType\.Curse", text):
            continue
        if "CanBeGeneratedByModifiers => false" in text:
            continue
        if "IsAllowedInBlitz => false" in text:
            continue
        ids.append(snake(path.stem))
    return _named(ids, cards)


def late_relics(relics: dict, layout: list[str], banned: list[dict]) -> dict:
    """Relics that stop appearing late in the last act, and the floor that
    starts at. The game counts the cut-off from the last act's Elite."""
    block = re.search(
        r"notAllowedLateInAct3\s*=[^{]*\{(.*?)\};", _read(RELIC_LISTS_FILE), re.DOTALL
    )
    names = re.findall(r"GetId<(\w+)>", block.group(1)) if block else []
    if not names or "ELITE" not in layout:
        return {}
    gone = {row["id"] for row in banned}
    ids = sorted(i for i in (snake(name) for name in names) if i not in gone)
    for path in sorted(RELICS_DIR.glob("*.cs")) if RELICS_DIR.is_dir() else []:
        text = path.read_text(encoding="utf-8")
        if "GameMode.Blitz" in text and "IsAllowed" in text:
            ids.append(snake(path.stem))
    if not ids:
        return {}
    return {
        "from_floor": len(layout) * 2 + layout.index("ELITE") + 1,
        "relics": _named(sorted(set(ids)), relics),
    }


def blitz_details(loc: dict[str, dict], levels: list[str]) -> dict:
    """The extra fields of the Blitz row. `loc` maps a table name to its
    strings; a field the code no longer states is left out."""
    ascension = loc.get("ascension", {})
    enchantments = loc.get("enchantments", {})
    out: dict = {}
    layout = act_layout()
    if layout:
        fights = sum(1 for room in layout if room in ("MONSTER", "ELITE", "BOSS"))
        out["act_layout"] = layout
        out["act_rooms"] = [
            {"type": room, "name": room_name(room, loc.get("map", {}))}
            for room in layout
        ]
        weak = weak_encounters_per_act()
        if weak is not None:
            out["weak_encounters_per_act"] = weak
            monsters = [r for r in out["act_rooms"] if r["type"] == "MONSTER"]
            for index, room in enumerate(monsters):
                room["easy"] = index < weak
        out["floors_per_act"] = len(layout)
        out["encounters_per_act"] = fights
    neow = neow_numbers()
    if "BLITZ.NEOW.selectionScreenPrompt" in ascension:
        neow["prompt"] = ascension["BLITZ.NEOW.selectionScreenPrompt"]
    if neow:
        out["neow_details"] = neow
    rules = merchant_rules(enchantments)
    if rules:
        out["merchant"] = rules
    rewards = room_rewards()
    if rewards:
        for row in rewards:
            row["room_name"] = room_name(row["room"], loc.get("map", {}))
        out["rewards"] = rewards
    upgrades = reward_upgrades_by_act()
    if upgrades:
        out["reward_upgrades_by_act"] = upgrades
    treasure = treasure_extra_relics()
    if treasure:
        out["treasure_extra_relics"] = treasure
    ladder = ascension_ladder(levels, ascension)
    if ladder:
        out["ascension_ladder"] = ladder
    cards = banned_cards(loc.get("cards", {}))
    if cards:
        out["banned_cards"] = cards
    relics = banned_relics(loc.get("relics", {}))
    if relics:
        out["banned_relics"] = relics
    late = late_relics(loc.get("relics", {}), layout, relics)
    if late:
        out["late_relics"] = late
    curses = merchant_curses(loc.get("cards", {}))
    if curses and "merchant" in out:
        out["merchant"]["curses"] = curses
    return out
