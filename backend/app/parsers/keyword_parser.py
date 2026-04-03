"""Parse keywords, intents, orbs, and afflictions from localization JSON and C# source."""
import json
import re
from pathlib import Path
from description_resolver import resolve_description, extract_vars_from_source

BASE = Path(__file__).resolve().parents[3]
DECOMPILED = BASE / "extraction" / "decompiled"
ORBS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Orbs"
AFFLICTIONS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Afflictions"
STATIC_IMAGES = BASE / "backend" / "static" / "images"
MODIFIERS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Modifiers"


def class_name_to_id(name: str) -> str:
    s = re.sub(r'(?<=[a-z0-9])(?=[A-Z])', '_', name)
    s = re.sub(r'(?<=[A-Z])(?=[A-Z][a-z])', '_', s)
    return s.upper()


def clean_description(text: str) -> str:
    """Strip only non-renderable tags, keep colors and effects for frontend."""
    text = re.sub(r'\[/?(?:thinky_dots|i|font_size)\]', '', text)
    text = re.sub(r'\[rainbow[^\]]*\]', '', text)
    text = re.sub(r'\[font_size=\d+\]', '', text)
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
        keywords.append({
            "id": kw_id,
            "name": title,
            "description": desc_clean,
        })
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
        # Image URL — check for intent icon
        img_name = intent_id.lower()
        image_file = STATIC_IMAGES / "intents" / f"{img_name}.png"
        image_url = f"/static/images/intents/{img_name}.png" if image_file.exists() else None

        intents.append({
            "id": intent_id,
            "name": title,
            "description": desc_clean,
            "image_url": image_url,
        })
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
        if orb_id in seen or orb_id == "EMPTY_SLOT":
            continue
        seen.add(orb_id)

        title = loc.get(f"{orb_id}.title", orb_id.replace("_", " ").title())

        # Try to get vars from C# source
        all_vars: dict[str, int] = {}
        # Map localization ID back to class name
        orb_class = orb_id.replace("_", "").title().replace(" ", "") + "Orb"
        # Try common names
        for cs_file in ORBS_DIR.glob("*.cs"):
            if cs_file.stem.upper().replace("ORB", "").replace("_", "") == orb_id.replace("_", ""):
                content = cs_file.read_text(encoding="utf-8")
                all_vars = extract_vars_from_source(content)
                # Also extract PassiveVal/EvokeVal
                for m in re.finditer(r'(\w+)Val\s*(?:=>|=)\s*(\d+)', content):
                    var_name = m.group(1)
                    all_vars[var_name] = int(m.group(2))
                break

        desc_raw = loc.get(f"{orb_id}.smartDescription", "")
        if not desc_raw:
            desc_raw = loc.get(f"{orb_id}.description", "")
        desc_resolved = resolve_description(desc_raw, all_vars) if desc_raw else ""
        desc_clean = clean_description(desc_resolved)

        # Image URL
        img_name = orb_id.lower()
        image_file = STATIC_IMAGES / "orbs" / f"{img_name}.png"
        image_url = f"/static/images/orbs/{img_name}.png" if image_file.exists() else None

        orbs.append({
            "id": orb_id,
            "name": title,
            "description": desc_clean,
            "description_raw": desc_raw if desc_raw != desc_clean else None,
            "image_url": image_url,
        })
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
        has_extra_card_text = False
        for cs_file in AFFLICTIONS_DIR.glob("*.cs"):
            cs_id = class_name_to_id(cs_file.stem)
            if cs_id == aff_id:
                content = cs_file.read_text(encoding="utf-8")
                all_vars = extract_vars_from_source(content)
                is_stackable = "IsStackable => true" in content or "IsStackable = true" in content
                has_extra_card_text = "HasExtraCardText => true" in content or "HasExtraCardText = true" in content
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
        extra_resolved = resolve_description(extra_text_raw, all_vars) if extra_text_raw else None
        if extra_resolved:
            extra_resolved = clean_description(extra_resolved)

        afflictions.append({
            "id": aff_id,
            "name": title,
            "description": desc_clean,
            "extra_card_text": extra_resolved,
            "is_stackable": is_stackable,
        })
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

        modifiers.append({
            "id": mod_id,
            "name": title,
            "description": desc_clean,
        })
    return modifiers


# --- Achievements ---
def parse_achievements(loc_dir: Path) -> list[dict]:
    loc_file = loc_dir / "achievements.json"
    if not loc_file.exists():
        return []
    with open(loc_file, "r", encoding="utf-8") as f:
        loc = json.load(f)

    achievements = []
    seen = set()
    # Skip meta keys
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

        achievements.append({
            "id": ach_id,
            "name": title,
            "description": desc_clean,
        })
    return achievements


# --- Glossary (Static Hover Tips) ---
SKIP_GLOSSARY = {
    "BOSS", "DOUBLE_BOSS", "NETWORK_PROBLEM_CLIENT", "NETWORK_PROBLEM_HOST",
    "SETTINGS", "COMPENDIUM", "REPLAY_DYNAMIC", "SUMMON_DYNAMIC",
    "ENERGY_COUNT", "STAR_COUNT", "END_TURN", "TURN_NUMBER", "MAP", "FLOOR",
    "ROOM_UNKNOWN_ELITE", "ROOM_UNKNOWN_ENEMY", "ROOM_UNKNOWN_EVENT",
    "ROOM_UNKNOWN_MERCHANT", "ROOM_UNKNOWN_TREASURE", "ROOM_MAP",
}

RENAME_GLOSSARY = {
    "REPLAY_STATIC": "REPLAY",
    "SUMMON_STATIC": "SUMMON",
}

GLOSSARY_CATEGORIES = {
    "BLOCK": "combat", "ENERGY": "combat", "STUN": "combat", "FATAL": "combat",
    "CHANNELING": "combat", "EVOKE": "combat",
    "FORGE": "mechanics", "REPLAY": "mechanics", "SUMMON": "mechanics",
    "TRANSFORM": "mechanics", "COOK": "mechanics",
    "DISCARD_PILE": "zones", "DRAW_PILE": "zones", "EXHAUST_PILE": "zones", "DECK": "zones",
    "CARD_REWARD": "progression", "LINKED_REWARDS": "progression",
    "POTION_SLOT": "progression", "HIT_POINTS": "progression", "MONEY_POUCH": "progression",
    "ROOM_ANCIENT": "rooms", "ROOM_BOSS": "rooms", "ROOM_ELITE": "rooms",
    "ROOM_ENEMY": "rooms", "ROOM_EVENT": "rooms", "ROOM_MERCHANT": "rooms",
    "ROOM_REST": "rooms", "ROOM_TREASURE": "rooms",
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
        title = re.sub(r'\s*\([A-Z]+\)\s*$', '', title)
        desc = clean_description(desc)
        # Clean unresolvable template variables
        desc = re.sub(r'\{[^}]+\}', '', desc).strip()
        # Normalize whitespace
        desc = re.sub(r'  +', ' ', desc)

        term_id = RENAME_GLOSSARY.get(raw_id, raw_id)
        category = GLOSSARY_CATEGORIES.get(term_id, "other")

        glossary.append({
            "id": term_id,
            "name": title,
            "description": desc,
            "category": category,
        })
    return glossary


def main(lang: str = "eng"):
    loc_dir = BASE / "extraction" / "raw" / "localization" / lang
    output_dir = BASE / "data" / lang
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
