"""Parse potion data from decompiled C# files and localization JSON."""

import json
import re
from pathlib import Path
from description_resolver import resolve_description, extract_vars_from_source

from orphan_filter import is_orphan
from parser_paths import BASE, DECOMPILED, loc_dir as _loc_dir, data_dir as _data_dir

POTIONS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Potions"
STATIC_IMAGES = BASE / "backend" / "static" / "images" / "potions"


def class_name_to_id(name: str) -> str:
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name)
    s = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", "_", s)
    return s.upper()


def load_localization(loc_dir: Path) -> dict:
    loc_file = loc_dir / "potions.json"
    if loc_file.exists():
        with open(loc_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def parse_single_potion(filepath: Path, localization: dict) -> dict | None:
    # Skip orphan .cs files left over from previous extractions — the
    # class no longer exists in the current DLL (no cross-references,
    # stale mtime) so it shouldn't appear in our output.
    if is_orphan(filepath):
        return None
    content = filepath.read_text(encoding="utf-8")
    class_name = filepath.stem

    if class_name.startswith("Deprecated") or class_name.startswith("Mock"):
        return None

    potion_id = class_name_to_id(class_name)

    # Rarity
    rarity_match = re.search(r"Rarity\s*=>\s*PotionRarity\.(\w+)", content)
    rarity = rarity_match.group(1) if rarity_match else "Common"

    # Extract variable values from source
    all_vars = extract_vars_from_source(content)

    # Localization
    title = localization.get(f"{potion_id}.title", class_name)
    description_raw = localization.get(f"{potion_id}.description", "")

    # Resolve templates, keep [gold] for frontend rendering
    description_resolved = resolve_description(description_raw, all_vars)
    desc_clean = description_resolved

    # Image URL — prefer WebP, fall back to PNG
    potion_base = potion_id.lower()
    image_file = STATIC_IMAGES / f"{potion_base}.webp"
    if not image_file.exists():
        image_file = STATIC_IMAGES / f"{potion_base}.png"
    image_url = (
        f"/static/images/potions/{image_file.name}" if image_file.exists() else None
    )

    return {
        "id": potion_id,
        "name": title,
        "description": desc_clean,
        "description_raw": description_raw,
        "rarity": rarity,
        "image_url": image_url,
    }


def load_gameplay_ui(loc_dir: Path) -> dict:
    loc_file = loc_dir / "gameplay_ui.json"
    if loc_file.exists():
        with open(loc_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def build_potion_rarity_map(gameplay_ui: dict) -> dict[str, str]:
    return {
        "Common": gameplay_ui.get("POTION_RARITY.COMMON", "Common"),
        "Uncommon": gameplay_ui.get("POTION_RARITY.UNCOMMON", "Uncommon"),
        "Rare": gameplay_ui.get("POTION_RARITY.RARE", "Rare"),
        "Event": gameplay_ui.get("POTION_RARITY.EVENT", "Event"),
        "Token": gameplay_ui.get("POTION_RARITY.TOKEN", "Token"),
    }


# Compendium rarity order for potions (matches in-game potion lab)
POTION_RARITY_ORDER = ["Common", "Uncommon", "Rare", "Event", "Token"]


def parse_all_potions(loc_dir: Path) -> list[dict]:
    localization = load_localization(loc_dir)
    gameplay_ui = load_gameplay_ui(loc_dir)
    rarity_map = build_potion_rarity_map(gameplay_ui)
    rarity_index = {rarity_map.get(r, r): i for i, r in enumerate(POTION_RARITY_ORDER)}
    potions = []
    for filepath in sorted(POTIONS_DIR.glob("*.cs")):
        potion = parse_single_potion(filepath, localization)
        if potion:
            potion["rarity_key"] = potion["rarity"]
            potion["rarity"] = rarity_map.get(potion["rarity"], potion["rarity"])
            potions.append(potion)

    # Assign compendium_order: rarity category → alphabetical by name
    potions.sort(key=lambda p: (rarity_index.get(p["rarity"], 99), p["name"]))
    for i, potion in enumerate(potions):
        potion["compendium_order"] = i

    # Restore alphabetical order (default)
    potions.sort(key=lambda p: p["name"])

    return potions


def main(lang: str = "eng"):
    loc_dir = _loc_dir(lang)
    output_dir = _data_dir(lang)
    output_dir.mkdir(parents=True, exist_ok=True)
    potions = parse_all_potions(loc_dir)
    with open(output_dir / "potions.json", "w", encoding="utf-8") as f:
        json.dump(potions, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(potions)} potions -> data/{lang}/potions.json")


if __name__ == "__main__":
    main()
