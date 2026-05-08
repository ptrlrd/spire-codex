"""Parse relic data from decompiled C# files and localization JSON."""

import json
import re
from pathlib import Path
from description_resolver import resolve_description, extract_vars_from_source

from orphan_filter import is_orphan
from parser_paths import (
    BASE,
    DECOMPILED,
    loc_dir as _loc_dir,
    data_dir as _data_dir,
    resolve_image_url,
)

RELICS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Relics"
RELIC_POOLS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.RelicPools"
STATIC_IMAGES = BASE / "backend" / "static" / "images" / "relics"
RELIC_NOTES_PATH = BASE / "data" / "relic_notes.json"


def _load_relic_notes() -> dict[str, list[str]]:
    """Read `data/relic_notes.json` once at import time.

    Per-relic prose explanations (Toy Box's wax mechanic, Looming
    Fruit's per-save coin flip) used to be hardcoded inline in this
    parser. Moving them to an external JSON keeps the parser focused
    on C# extraction and gives reviewers a single file to scan when
    they want to know "what mechanic notes are we shipping?" without
    grepping the parser source.

    Schema: `{relic_id: [note, note, ...]}`. Empty/missing file
    returns `{}` so the parser still runs in fresh checkouts.
    """
    if not RELIC_NOTES_PATH.exists():
        return {}
    with open(RELIC_NOTES_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


_RELIC_NOTES = _load_relic_notes()


def class_name_to_id(name: str) -> str:
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name)
    s = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", "_", s)
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
            r"ModelDb\.Relic<(\w+)>\(\)\.Id,\s*ModelDb\.Relic<(\w+)>\(\)", content
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
        for m in re.finditer(r"ModelDb\.Relic<(\w+)>\(\)", content):
            relic_to_pool[m.group(1)] = pool_name

    # Assign upgraded starter relics to their base relic's character pool
    starter_upgrades = parse_starter_upgrades()
    for upgraded, base in starter_upgrades.items():
        if base in relic_to_pool and upgraded not in relic_to_pool:
            relic_to_pool[upgraded] = relic_to_pool[base]

    return relic_to_pool


def parse_single_relic(
    filepath: Path, localization: dict, relic_pools: dict, ench_loc: dict | None = None
) -> dict | None:
    # Skip orphan .cs files left over from previous extractions — the
    # class no longer exists in the current DLL (no cross-references,
    # stale mtime) so it shouldn't appear in our output.
    if is_orphan(filepath):
        return None
    content = filepath.read_text(encoding="utf-8")
    class_name = filepath.stem

    if class_name.startswith("Deprecated") or class_name.startswith("Mock"):
        return None

    # Skip non-relic classes that happen to live in the Relics directory
    if not re.search(r"class\s+\w+\s*:\s*RelicModel\b", content):
        return None

    relic_id = class_name_to_id(class_name)

    # Rarity
    rarity_match = re.search(r"Rarity\s*=>\s*RelicRarity\.(\w+)", content)
    rarity = rarity_match.group(1) if rarity_match else "Unknown"

    # Extract variable values from source
    all_vars = extract_vars_from_source(content)

    # Resolve StringVar references to enchantment names
    # Pattern: StringVar("EnchantmentName", ModelDb.Enchantment<Goopy>().Title.GetFormattedText())
    for sv in re.finditer(
        r'StringVar\(\s*"(\w+)"\s*,\s*ModelDb\.Enchantment<(\w+)>\(\)', content
    ):
        var_name = sv.group(1)
        enchant_class = sv.group(2)
        enchant_id = class_name_to_id(enchant_class)
        enchant_name = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", enchant_class)
        if ench_loc:
            loc_name = ench_loc.get(f"{enchant_id}.title")
            if loc_name:
                enchant_name = loc_name
        all_vars[var_name] = enchant_name

    # Localization
    title = localization.get(f"{relic_id}.title", class_name)
    description_raw = localization.get(f"{relic_id}.description", "")
    flavor = localization.get(f"{relic_id}.flavor", "")

    # Per-character title overrides — Sea Glass renames itself to
    # "Demon Glass" / "Venom Glass" / "Gear Glass" / "Lich Glass" /
    # "Noble Glass" depending on which character holds it. Pattern:
    # `<RELIC>.<CHAR>.title` in `relics.json`. Surfaced as
    # `name_variants` so detail pages can list alternate names without
    # parsing localization at render time.
    NAME_VARIANT_CHARS = {
        "IRONCLAD": "Ironclad",
        "SILENT": "Silent",
        "DEFECT": "Defect",
        "NECROBINDER": "Necrobinder",
        "REGENT": "Regent",
    }
    name_variants: dict[str, str] = {}
    for char_key, char_label in NAME_VARIANT_CHARS.items():
        variant_title = localization.get(f"{relic_id}.{char_key}.title")
        if variant_title and variant_title != title:
            name_variants[char_label] = variant_title

    # Resolve templates, keep color tags for frontend rendering
    description_resolved = resolve_description(description_raw, all_vars)
    desc_clean = description_resolved
    flavor_clean = flavor

    # Merchant cost — base price from rarity or MerchantCost override, with
    # ×0.85–1.15 variance. Major Update #1 (game v0.103.2) reduced every
    # rarity tier's base by 25g; values below match the post-MU1 RelicModel.cs
    # constants. The five gold-generating relics that broke shop economy
    # (The Courier, Old Coin + the MU1 additions Lucky Fysh, Bowler Hat,
    # Amethyst Aubergine) now opt out via `IsAllowedInShops => false` —
    # surface that as `merchant_price: null` so the frontend doesn't
    # advertise a shop price for relics you can never actually buy.
    RARITY_BASE_COST = {
        "Common": 175,
        "Uncommon": 225,
        "Rare": 275,
        "Shop": 200,
    }
    is_shop_blacklisted = bool(
        re.search(r"override\s+bool\s+IsAllowedInShops\s*=>\s*false\b", content)
    )
    merchant_cost_override = re.search(
        r"override\s+int\s+MerchantCost\s*=>\s*(\d+)", content
    )
    if merchant_cost_override:
        base_cost = int(merchant_cost_override.group(1))
    else:
        base_cost = RARITY_BASE_COST.get(rarity)

    if is_shop_blacklisted or base_cost is None:
        merchant_price = None
    else:
        cost_min = round(base_cost * 0.85)
        cost_max = round(base_cost * 1.15)
        merchant_price = {"base": base_cost, "min": cost_min, "max": cost_max}

    # Pool/character
    pool = relic_pools.get(class_name, "shared")

    # Image URL — version-aware via resolve_image_url (per-version beta
    # asset → stable canonical fallback). Returns None when neither has
    # the file.
    relic_base = relic_id.lower()
    image_url = resolve_image_url("relics", relic_base)

    # Character-specific image variants (e.g., Yummy Cookie has 5 variants)
    VARIANT_SUFFIXES = {
        "ironclad": "Ironclad",
        "silent": "Silent",
        "defect": "Defect",
        "necrobinder": "Necrobinder",
        "regent": "Regent",
    }
    image_variants = {}
    for suffix, char_name in VARIANT_SUFFIXES.items():
        variant_url = resolve_image_url("relics", f"{relic_base}_{suffix}")
        if variant_url:
            image_variants[char_name] = variant_url

    # Looming Fruit ships two icons (cornucopia + bare fruit) and the
    # game picks one per save based on `UniqueId % 2 == 0` in
    # `LoomingFruit.cs::HasCornucopia()`. Half the playerbase sees
    # each, which leads to "wrong icon" reports — surface both so the
    # detail page's variant picker shows them as alternates.
    if class_name == "LoomingFruit":
        cornucopia_url = resolve_image_url("relics", relic_base)
        fruit_url = resolve_image_url("relics", f"{relic_base}_2")
        if cornucopia_url and fruit_url:
            image_variants["Cornucopia"] = cornucopia_url
            image_variants["Fruit"] = fruit_url

    # Per-relic notes — see _load_relic_notes() docstring for why this
    # lives in `data/relic_notes.json` and not inline.
    notes = _RELIC_NOTES.get(relic_id)

    return {
        "id": relic_id,
        "name": title,
        "description": desc_clean,
        "description_raw": description_raw,
        "flavor": flavor_clean,
        "rarity": rarity,
        "pool": pool,
        "merchant_price": merchant_price,
        "image_url": image_url,
        "image_variants": image_variants if image_variants else None,
        "name_variants": name_variants if name_variants else None,
        "notes": notes,
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
        "None": gameplay_ui.get("RELIC_RARITY.NONE", "Relic"),
    }


# Compendium rarity order for relics (matches in-game relic collection)
RELIC_RARITY_ORDER = [
    "Starter",
    "Common",
    "Uncommon",
    "Rare",
    "Shop",
    "Ancient",
    "Event",
]


def parse_all_relics(loc_dir: Path) -> list[dict]:
    localization = load_localization(loc_dir)
    relic_pools = parse_relic_pools()
    gameplay_ui = load_gameplay_ui(loc_dir)
    rarity_map = build_relic_rarity_map(gameplay_ui)
    rarity_index = {rarity_map.get(r, r): i for i, r in enumerate(RELIC_RARITY_ORDER)}
    # Load enchantment localization for StringVar resolution
    ench_loc_file = loc_dir / "enchantments.json"
    ench_loc = {}
    if ench_loc_file.exists():
        with open(ench_loc_file, "r", encoding="utf-8") as f:
            ench_loc = json.load(f)
    relics = []
    for filepath in sorted(RELICS_DIR.glob("*.cs")):
        relic = parse_single_relic(filepath, localization, relic_pools, ench_loc)
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
    loc_dir = _loc_dir(lang)
    output_dir = _data_dir(lang)
    output_dir.mkdir(parents=True, exist_ok=True)
    relics = parse_all_relics(loc_dir)
    with open(output_dir / "relics.json", "w", encoding="utf-8") as f:
        json.dump(relics, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(relics)} relics -> data/{lang}/relics.json")


if __name__ == "__main__":
    main()
