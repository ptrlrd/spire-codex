"""Parse keywords, intents, orbs, and afflictions from localization JSON and C# source."""

import json
import re
from pathlib import Path
from description_resolver import resolve_description, extract_vars_from_source

from parser_paths import BASE, DECOMPILED, loc_dir as _loc_dir, data_dir as _data_dir

ORBS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Orbs"
AFFLICTIONS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Afflictions"
STATIC_IMAGES = BASE / "backend" / "static" / "images"
MODIFIERS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Modifiers"


def class_name_to_id(name: str) -> str:
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name)
    s = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", "_", s)
    return s.upper()


def clean_description(text: str) -> str:
    """Strip only non-renderable tags, keep colors and effects for frontend."""
    text = re.sub(r"\[/?(?:thinky_dots|i|font_size|rainbow)\]", "", text)
    text = re.sub(r"\[rainbow[^\]]*\]", "", text)
    text = re.sub(r"\[font_size=\d+\]", "", text)
    return text


# --- Keywords ---
def parse_keywords(loc_dir: Path) -> list[dict]:
    loc_file = loc_dir / "card_keywords.json"
    if not loc_file.exists():
        return []
    with open(loc_file, "r", encoding="utf-8") as f:
        loc = json.load(f)

    keywords = []
    seen = set()
    for key in loc:
        parts = key.split(".")
        kw_id = parts[0]
        if kw_id in seen:
            continue
        seen.add(kw_id)
        title = loc.get(f"{kw_id}.title", kw_id.replace("_", " ").title())
        desc = loc.get(f"{kw_id}.description", "")
        desc_clean = clean_description(desc)
        keywords.append(
            {
                "id": kw_id,
                "name": title,
                "description": desc_clean,
            }
        )
    return keywords


# --- Intents ---
def parse_intents(loc_dir: Path) -> list[dict]:
    loc_file = loc_dir / "intents.json"
    if not loc_file.exists():
        return []
    with open(loc_file, "r", encoding="utf-8") as f:
        loc = json.load(f)

    intents = []
    seen = set()
    for key in loc:
        parts = key.split(".")
        intent_id = parts[0]
        if intent_id in seen or intent_id.startswith("FORMAT_"):
            continue
        seen.add(intent_id)
        title = loc.get(f"{intent_id}.title", intent_id.replace("_", " ").title())
        desc = loc.get(f"{intent_id}.description", "")
        desc_clean = clean_description(desc)
        # Image URL — check for intent icon, prefer WebP
        img_name = intent_id.lower()
        image_file = STATIC_IMAGES / "intents" / f"{img_name}.webp"
        if not image_file.exists():
            image_file = STATIC_IMAGES / "intents" / f"{img_name}.png"
        image_url = (
            f"/static/images/intents/{image_file.name}" if image_file.exists() else None
        )

        intents.append(
            {
                "id": intent_id,
                "name": title,
                "description": desc_clean,
                "image_url": image_url,
            }
        )
    return intents


# --- Orbs ---
def parse_orbs(loc_dir: Path) -> list[dict]:
    loc_file = loc_dir / "orbs.json"
    if not loc_file.exists():
        return []
    with open(loc_file, "r", encoding="utf-8") as f:
        loc = json.load(f)

    orbs = []
    seen = set()
    for key in loc:
        parts = key.split(".")
        orb_id = parts[0]
        if orb_id in seen or orb_id == "EMPTY_SLOT" or "MOCK" in orb_id:
            continue
        seen.add(orb_id)

        title = loc.get(f"{orb_id}.title", orb_id.replace("_", " ").title())

        # Try to get vars from C# source
        all_vars: dict[str, int] = {}
        # Map localization ID back to class name
        # Try common names
        for cs_file in ORBS_DIR.glob("*.cs"):
            if cs_file.stem.upper().replace("ORB", "").replace(
                "_", ""
            ) == orb_id.replace("_ORB", "").replace("_", ""):
                content = cs_file.read_text(encoding="utf-8")
                all_vars = extract_vars_from_source(content)
                # Extract PassiveVal/EvokeVal from patterns like:
                #   PassiveVal => ModifyOrbValue(3m)
                #   _passiveVal = 4m
                #   _evokeVal = 6m
                for m in re.finditer(
                    r"(?:override\s+decimal\s+)?(\w+)Val\s*(?:=>|=)\s*(?:ModifyOrbValue\()?(\d+)m",
                    content,
                ):
                    var_name = m.group(1).lstrip("_").capitalize()
                    all_vars[var_name] = int(m.group(2))
                # Handle computed evoke (e.g. GlassOrb: EvokeVal => PassiveVal * 2m)
                m_computed = re.search(
                    r"EvokeVal\s*=>\s*PassiveVal\s*\*\s*(\d+)m", content
                )
                if m_computed and "Passive" in all_vars:
                    all_vars["Evoke"] = all_vars["Passive"] * int(m_computed.group(1))
                break

        desc_raw = loc.get(f"{orb_id}.smartDescription", "")
        if not desc_raw:
            desc_raw = loc.get(f"{orb_id}.description", "")
        desc_resolved = resolve_description(desc_raw, all_vars) if desc_raw else ""
        desc_clean = clean_description(desc_resolved)

        # Image URL — prefer WebP
        img_name = orb_id.lower()
        image_file = STATIC_IMAGES / "orbs" / f"{img_name}.webp"
        if not image_file.exists():
            image_file = STATIC_IMAGES / "orbs" / f"{img_name}.png"
        image_url = (
            f"/static/images/orbs/{image_file.name}" if image_file.exists() else None
        )

        orbs.append(
            {
                "id": orb_id,
                "name": title,
                "description": desc_clean,
                "description_raw": desc_raw if desc_raw != desc_clean else None,
                "image_url": image_url,
            }
        )
    return orbs


# --- Afflictions ---
def parse_afflictions(loc_dir: Path) -> list[dict]:
    loc_file = loc_dir / "afflictions.json"
    if not loc_file.exists():
        return []
    with open(loc_file, "r", encoding="utf-8") as f:
        loc = json.load(f)

    afflictions = []
    seen = set()
    for key in loc:
        parts = key.split(".")
        aff_id = parts[0]
        if aff_id in seen or aff_id.startswith("MOCK"):
            continue
        seen.add(aff_id)

        title = loc.get(f"{aff_id}.title", aff_id.replace("_", " ").title())

        # Try to get C# source data
        all_vars: dict[str, int] = {}
        is_stackable = False
        for cs_file in AFFLICTIONS_DIR.glob("*.cs"):
            cs_id = class_name_to_id(cs_file.stem)
            if cs_id == aff_id:
                content = cs_file.read_text(encoding="utf-8")
                all_vars = extract_vars_from_source(content)
                is_stackable = (
                    "IsStackable => true" in content or "IsStackable = true" in content
                )
                break

        desc_raw = loc.get(f"{aff_id}.smartDescription", "")
        if not desc_raw:
            desc_raw = loc.get(f"{aff_id}.description", "")
        extra_text_raw = loc.get(f"{aff_id}.extraCardText", "")

        # For stackable afflictions, {Amount} refers to the stack count (dynamic)
        if is_stackable and "Amount" not in all_vars:
            all_vars["Amount"] = "X"
        desc_resolved = resolve_description(desc_raw, all_vars) if desc_raw else ""
        desc_clean = clean_description(desc_resolved)
        extra_resolved = (
            resolve_description(extra_text_raw, all_vars) if extra_text_raw else None
        )
        if extra_resolved:
            extra_resolved = clean_description(extra_resolved)

        afflictions.append(
            {
                "id": aff_id,
                "name": title,
                "description": desc_clean,
                "extra_card_text": extra_resolved,
                "is_stackable": is_stackable,
            }
        )
    return afflictions


# --- Modifiers ---
def parse_modifiers(loc_dir: Path) -> list[dict]:
    loc_file = loc_dir / "modifiers.json"
    if not loc_file.exists():
        return []
    with open(loc_file, "r", encoding="utf-8") as f:
        loc = json.load(f)

    modifiers = []
    seen = set()
    for key in loc:
        parts = key.split(".")
        mod_id = parts[0]
        if mod_id in seen:
            continue
        seen.add(mod_id)

        title = loc.get(f"{mod_id}.title", mod_id.replace("_", " ").title())

        # Try to get C# source data
        all_vars: dict[str, int] = {}
        for cs_file in MODIFIERS_DIR.glob("*.cs"):
            cs_id = class_name_to_id(cs_file.stem)
            if cs_id == mod_id:
                content = cs_file.read_text(encoding="utf-8")
                all_vars = extract_vars_from_source(content)
                break

        desc_raw = loc.get(f"{mod_id}.description", "")
        desc_resolved = resolve_description(desc_raw, all_vars) if desc_raw else ""
        desc_clean = clean_description(desc_resolved)

        modifiers.append(
            {
                "id": mod_id,
                "name": title,
                "description": desc_clean,
            }
        )
    return modifiers


# --- Achievements ---
def parse_achievements(loc_dir: Path) -> list[dict]:
    loc_file = loc_dir / "achievements.json"
    if not loc_file.exists():
        return []
    with open(loc_file, "r", encoding="utf-8") as f:
        loc = json.load(f)

    # Achievement metadata from C# source
    ACHIEVEMENT_META: dict[str, dict] = {
        "IRONCLAD_WIN": {"category": "character_win", "character": "Ironclad"},
        "SILENT_WIN": {"category": "character_win", "character": "Silent"},
        "REGENT_WIN": {"category": "character_win", "character": "Regent"},
        "NECROBINDER_WIN": {"category": "character_win", "character": "Necrobinder"},
        "DEFECT_WIN": {"category": "character_win", "character": "Defect"},
        "IRONCLAD_ASCENSION10": {
            "category": "character_ascension",
            "character": "Ironclad",
        },
        "SILENT_ASCENSION10": {
            "category": "character_ascension",
            "character": "Silent",
        },
        "REGENT_ASCENSION10": {
            "category": "character_ascension",
            "character": "Regent",
        },
        "NECROBINDER_ASCENSION10": {
            "category": "character_ascension",
            "character": "Necrobinder",
        },
        "DEFECT_ASCENSION10": {
            "category": "character_ascension",
            "character": "Defect",
        },
        "CHARACTER_SKILL_IRONCLAD1": {
            "category": "character_skill",
            "character": "Ironclad",
            "threshold": 20,
            "condition": "Exhaust 20 cards in a single combat",
        },
        "CHARACTER_SKILL_IRONCLAD2": {
            "category": "character_skill",
            "character": "Ironclad",
            "threshold": 999,
            "condition": "Deal 999+ damage in a single hit",
        },
        "CHARACTER_SKILL_SILENT1": {
            "category": "character_skill",
            "character": "Silent",
            "threshold": 5,
            "condition": "Play 5 cards via Sly off a single card play",
        },
        "CHARACTER_SKILL_SILENT2": {
            "category": "character_skill",
            "character": "Silent",
            "threshold": 99,
            "condition": "Apply 99+ Poison to a single enemy",
        },
        "CHARACTER_SKILL_NECROBINDER1": {
            "category": "character_skill",
            "character": "Necrobinder",
            "threshold": 999,
            "condition": "Apply 999+ Doom to a single enemy",
        },
        "CHARACTER_SKILL_NECROBINDER2": {
            "category": "character_skill",
            "character": "Necrobinder",
            "threshold": 50,
            "condition": "Apply 50+ Strength to Osty",
        },
        "CHARACTER_SKILL_REGENT1": {
            "category": "character_skill",
            "character": "Regent",
            "threshold": 999,
            "condition": "Forge a Sovereign Blade with 999+ base damage",
        },
        "CHARACTER_SKILL_REGENT2": {
            "category": "character_skill",
            "character": "Regent",
            "threshold": 20,
            "condition": "Have 20+ Stars at once",
        },
        "PLAY20_CARDS_SINGLE_TURN": {
            "category": "combat",
            "threshold": 20,
            "condition": "Play 20 cards in a single turn",
        },
        "DEFEAT_ONE_BOSS": {"category": "combat", "condition": "Defeat a boss"},
        "DEFEAT_OVERGROWTH_ENEMIES": {
            "category": "combat",
            "condition": "Defeat every enemy in the Overgrowth",
        },
        "DEFEAT_UNDERDOCKS_ENEMIES": {
            "category": "combat",
            "condition": "Defeat every enemy in the Underdocks",
        },
        "DEFEAT_HIVE_ENEMIES": {
            "category": "combat",
            "condition": "Defeat every enemy in the Hive",
        },
        "DEFEAT_GLORY_ENEMIES": {
            "category": "combat",
            "condition": "Defeat every enemy in the Glory",
        },
        "NO_RELIC_WIN": {
            "category": "run",
            "condition": "Win without obtaining any relics",
        },
        "ALL_CARDS_UPGRADED": {
            "category": "run",
            "condition": "Win with a fully-upgraded deck",
        },
        "COMPLETE_ACT4": {"category": "run", "condition": "Complete Act 4"},
        "FLOOR_TEN_THOUSAND": {
            "category": "collection",
            "threshold": 10000,
            "condition": "Climb 10,000 floors total",
        },
        "DISCOVER_ALL_CARDS": {
            "category": "collection",
            "condition": "Discover all cards",
        },
        "DISCOVER_ALL_RELICS": {
            "category": "collection",
            "condition": "Discover all relics",
        },
        "DISCOVER_ALL_EVENTS": {
            "category": "collection",
            "condition": "Encounter all events",
        },
        "COMPLETE_TIMELINE": {
            "category": "collection",
            "condition": "Complete the Timeline",
        },
        "ALL_OTHER_ACHIEVEMENTS": {
            "category": "meta",
            "condition": "Complete all other achievements",
        },
    }

    achievements = []
    seen = set()
    skip_prefixes = {"DESCRIPTION_WITH_UNLOCK_TIME", "UNLOCK_DATE", "LOCKED"}
    for key in loc:
        parts = key.split(".")
        ach_id = parts[0]
        if ach_id in seen or ach_id in skip_prefixes:
            continue
        seen.add(ach_id)

        title = loc.get(f"{ach_id}.title", ach_id.replace("_", " ").title())
        desc = loc.get(f"{ach_id}.description", "")
        desc_clean = clean_description(desc)

        meta = ACHIEVEMENT_META.get(ach_id, {})
        achievements.append(
            {
                "id": ach_id,
                "name": title,
                "description": desc_clean,
                "category": meta.get("category"),
                "character": meta.get("character"),
                "threshold": meta.get("threshold"),
                "condition": meta.get("condition"),
            }
        )
    return achievements


# --- Glossary (Static Hover Tips) ---
SKIP_GLOSSARY = {
    "BOSS",
    "DOUBLE_BOSS",
    "NETWORK_PROBLEM_CLIENT",
    "NETWORK_PROBLEM_HOST",
    "SETTINGS",
    "COMPENDIUM",
    "REPLAY_DYNAMIC",
    "SUMMON_DYNAMIC",
    "ENERGY_COUNT",
    "STAR_COUNT",
    "END_TURN",
    "TURN_NUMBER",
    "MAP",
    "FLOOR",
    "ROOM_UNKNOWN_ELITE",
    "ROOM_UNKNOWN_ENEMY",
    "ROOM_UNKNOWN_EVENT",
    "ROOM_UNKNOWN_MERCHANT",
    "ROOM_UNKNOWN_TREASURE",
    "ROOM_MAP",
}

RENAME_GLOSSARY = {
    "REPLAY_STATIC": "REPLAY",
    "SUMMON_STATIC": "SUMMON",
}

GLOSSARY_CATEGORIES = {
    "BLOCK": "combat",
    "ENERGY": "combat",
    "STUN": "combat",
    "FATAL": "combat",
    "CHANNELING": "combat",
    "EVOKE": "combat",
    "FORGE": "mechanics",
    "REPLAY": "mechanics",
    "SUMMON": "mechanics",
    "TRANSFORM": "mechanics",
    "COOK": "mechanics",
    "DISCARD_PILE": "zones",
    "DRAW_PILE": "zones",
    "EXHAUST_PILE": "zones",
    "DECK": "zones",
    "CARD_REWARD": "progression",
    "LINKED_REWARDS": "progression",
    "POTION_SLOT": "progression",
    "HIT_POINTS": "progression",
    "MONEY_POUCH": "progression",
    "ROOM_ANCIENT": "rooms",
    "ROOM_BOSS": "rooms",
    "ROOM_ELITE": "rooms",
    "ROOM_ENEMY": "rooms",
    "ROOM_EVENT": "rooms",
    "ROOM_MERCHANT": "rooms",
    "ROOM_REST": "rooms",
    "ROOM_TREASURE": "rooms",
}


def parse_glossary(loc_dir: Path) -> list[dict]:
    loc_file = loc_dir / "static_hover_tips.json"
    if not loc_file.exists():
        return []
    with open(loc_file, "r", encoding="utf-8") as f:
        loc = json.load(f)

    # Collect unique IDs
    ids = set()
    for key in loc:
        ids.add(key.split(".")[0])

    glossary = []
    for raw_id in sorted(ids):
        if raw_id in SKIP_GLOSSARY:
            continue
        title = loc.get(f"{raw_id}.title")
        desc = loc.get(f"{raw_id}.description")
        if not title or not desc:
            continue
        # Strip keyboard shortcut hints like "(D)", "(ESC)"
        title = re.sub(r"\s*\([A-Z]+\)\s*$", "", title)
        desc = clean_description(desc)
        # Clean unresolvable template variables
        desc = re.sub(r"\{[^}]+\}", "", desc).strip()
        # Normalize whitespace
        desc = re.sub(r"  +", " ", desc)

        term_id = RENAME_GLOSSARY.get(raw_id, raw_id)
        category = GLOSSARY_CATEGORIES.get(term_id, "other")

        glossary.append(
            {
                "id": term_id,
                "name": title,
                "description": desc,
                "category": category,
            }
        )
    return glossary


def main(lang: str = "eng"):
    loc_dir = _loc_dir(lang)
    output_dir = _data_dir(lang)
    output_dir.mkdir(parents=True, exist_ok=True)

    keywords = parse_keywords(loc_dir)
    with open(output_dir / "keywords.json", "w", encoding="utf-8") as f:
        json.dump(keywords, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(keywords)} keywords -> data/{lang}/keywords.json")

    intents = parse_intents(loc_dir)
    with open(output_dir / "intents.json", "w", encoding="utf-8") as f:
        json.dump(intents, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(intents)} intents -> data/{lang}/intents.json")

    orbs = parse_orbs(loc_dir)
    with open(output_dir / "orbs.json", "w", encoding="utf-8") as f:
        json.dump(orbs, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(orbs)} orbs -> data/{lang}/orbs.json")

    afflictions = parse_afflictions(loc_dir)
    with open(output_dir / "afflictions.json", "w", encoding="utf-8") as f:
        json.dump(afflictions, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(afflictions)} afflictions -> data/{lang}/afflictions.json")

    modifiers = parse_modifiers(loc_dir)
    with open(output_dir / "modifiers.json", "w", encoding="utf-8") as f:
        json.dump(modifiers, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(modifiers)} modifiers -> data/{lang}/modifiers.json")

    achievements = parse_achievements(loc_dir)
    with open(output_dir / "achievements.json", "w", encoding="utf-8") as f:
        json.dump(achievements, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(achievements)} achievements -> data/{lang}/achievements.json")

    glossary = parse_glossary(loc_dir)
    with open(output_dir / "glossary.json", "w", encoding="utf-8") as f:
        json.dump(glossary, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(glossary)} glossary terms -> data/{lang}/glossary.json")


if __name__ == "__main__":
    main()
