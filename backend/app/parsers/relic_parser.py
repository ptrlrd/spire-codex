"""Parse relic data from decompiled C# files and localization JSON."""
import json
import re
from pathlib import Path
from description_resolver import resolve_description, extract_vars_from_source

BASE = Path(__file__).resolve().parents[3]
DECOMPILED = BASE / "extraction" / "decompiled"
RELICS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Relics"
RELIC_POOLS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.RelicPools"
STATIC_IMAGES = BASE / "backend" / "static" / "images" / "relics"


def class_name_to_id(name: str) -> str:
    s = re.sub(r'(?<=[a-z0-9])(?=[A-Z])', '_', name)
    s = re.sub(r'(?<=[A-Z])(?=[A-Z][a-z])', '_', s)
    return s.upper()


def load_localization(loc_dir: Path) -> dict:
    loc_file = loc_dir / "relics.json"
    if loc_file.exists():
        with open(loc_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def parse_starter_upgrades() -> dict[str, str]:
    """Map upgraded starter relic class names to their base relic class names.

    Extracted from TouchOfOrobas.RefinementUpgrades: { base.Id -> upgraded }.
    """
    touch_file = RELICS_DIR / "TouchOfOrobas.cs"
    upgrades = {}
    if touch_file.exists():
        content = touch_file.read_text(encoding="utf-8")
        # Pattern: { ModelDb.Relic<Base>().Id, ModelDb.Relic<Upgraded>() }
        for m in re.finditer(
            r'ModelDb\.Relic<(\w+)>\(\)\.Id,\s*ModelDb\.Relic<(\w+)>\(\)',
            content
        ):
            base, upgraded = m.group(1), m.group(2)
            upgrades[upgraded] = base
    return upgrades


def parse_relic_pools() -> dict[str, str]:
    """Map relic class names to character pools."""
    relic_to_pool = {}
    pool_map = {
        "IroncladRelicPool.cs": "ironclad",
        "SilentRelicPool.cs": "silent",
        "DefectRelicPool.cs": "defect",
        "NecrobinderRelicPool.cs": "necrobinder",
        "RegentRelicPool.cs": "regent",
        "SharedRelicPool.cs": "shared",
    }
    for filename, pool_name in pool_map.items():
        filepath = RELIC_POOLS_DIR / filename
        if not filepath.exists():
            continue
        content = filepath.read_text(encoding="utf-8")
        for m in re.finditer(r'ModelDb\.Relic<(\w+)>\(\)', content):
            relic_to_pool[m.group(1)] = pool_name

    # Assign upgraded starter relics to their base relic's character pool
    starter_upgrades = parse_starter_upgrades()
    for upgraded, base in starter_upgrades.items():
        if base in relic_to_pool and upgraded not in relic_to_pool:
            relic_to_pool[upgraded] = relic_to_pool[base]

    return relic_to_pool


def parse_single_relic(filepath: Path, localization: dict, relic_pools: dict) -> dict | None:
    content = filepath.read_text(encoding="utf-8")
    class_name = filepath.stem

    if class_name.startswith("Deprecated") or class_name.startswith("Mock"):
        return None

    relic_id = class_name_to_id(class_name)

    # Rarity
    rarity_match = re.search(r'Rarity\s*=>\s*RelicRarity\.(\w+)', content)
    rarity = rarity_match.group(1) if rarity_match else "Unknown"

    # Extract variable values from source
    all_vars = extract_vars_from_source(content)

    # Localization
    title = localization.get(f"{relic_id}.title", class_name)
    description_raw = localization.get(f"{relic_id}.description", "")
    flavor = localization.get(f"{relic_id}.flavor", "")

    # Resolve templates, keep color tags for frontend rendering
    description_resolved = resolve_description(description_raw, all_vars)
    desc_clean = description_resolved
    flavor_clean = flavor

    # Pool/character
    pool = relic_pools.get(class_name, "shared")

    # Image URL
    image_file = STATIC_IMAGES / f"{relic_id.lower()}.png"
    image_url = f"/static/images/relics/{relic_id.lower()}.png" if image_file.exists() else None

    # Character-specific image variants (e.g., Yummy Cookie has 5 variants)
    VARIANT_SUFFIXES = {
        "ironclad": "Ironclad",
        "silent": "Silent",
        "defect": "Defect",
        "necro": "Necrobinder",
        "regent": "Regent",
    }
    image_variants = {}
    for suffix, char_name in VARIANT_SUFFIXES.items():
        variant_file = STATIC_IMAGES / f"{relic_id.lower()}_{suffix}.png"
        if variant_file.exists():
            image_variants[char_name] = f"/static/images/relics/{relic_id.lower()}_{suffix}.png"

    return {
        "id": relic_id,
        "name": title,
        "description": desc_clean,
        "description_raw": description_raw,
        "flavor": flavor_clean,
        "rarity": rarity,
        "pool": pool,
        "image_url": image_url,
        "image_variants": image_variants if image_variants else None,
    }


def load_gameplay_ui(loc_dir: Path) -> dict:
    loc_file = loc_dir / "gameplay_ui.json"
    if loc_file.exists():
        with open(loc_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def build_relic_rarity_map(gameplay_ui: dict) -> dict[str, str]:
    return {
        "Starter": gameplay_ui.get("RELIC_RARITY.STARTER", "Starter"),
        "Common": gameplay_ui.get("RELIC_RARITY.COMMON", "Common"),
        "Uncommon": gameplay_ui.get("RELIC_RARITY.UNCOMMON", "Uncommon"),
        "Rare": gameplay_ui.get("RELIC_RARITY.RARE", "Rare"),
        "Ancient": gameplay_ui.get("RELIC_RARITY.ANCIENT", "Ancient"),
        "Event": gameplay_ui.get("RELIC_RARITY.EVENT", "Event"),
        "Shop": gameplay_ui.get("RELIC_RARITY.SHOP", "Shop"),
    }


# Compendium rarity order for relics (matches in-game relic collection)
RELIC_RARITY_ORDER = ["Starter", "Common", "Uncommon", "Rare", "Shop", "Ancient", "Event"]


def parse_all_relics(loc_dir: Path) -> list[dict]:
    localization = load_localization(loc_dir)
    relic_pools = parse_relic_pools()
    gameplay_ui = load_gameplay_ui(loc_dir)
    rarity_map = build_relic_rarity_map(gameplay_ui)
    rarity_index = {rarity_map.get(r, r): i for i, r in enumerate(RELIC_RARITY_ORDER)}
    relics = []
    for filepath in sorted(RELICS_DIR.glob("*.cs")):
        relic = parse_single_relic(filepath, localization, relic_pools)
        if relic:
            relic["rarity_key"] = relic["rarity"]
            relic["rarity"] = rarity_map.get(relic["rarity"], relic["rarity"])
            relics.append(relic)

    # Assign compendium_order: rarity category → alphabetical by name
    relics.sort(key=lambda r: (rarity_index.get(r["rarity"], 99), r["name"]))
    for i, relic in enumerate(relics):
        relic["compendium_order"] = i

    # Restore alphabetical order (default)
    relics.sort(key=lambda r: r["name"])

    return relics


def main(lang: str = "eng"):
    loc_dir = BASE / "extraction" / "raw" / "localization" / lang
    output_dir = BASE / "data" / lang
    output_dir.mkdir(parents=True, exist_ok=True)
    relics = parse_all_relics(loc_dir)
    with open(output_dir / "relics.json", "w", encoding="utf-8") as f:
        json.dump(relics, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(relics)} relics -> data/{lang}/relics.json")


if __name__ == "__main__":
    main()
