"""Parse enchantment data from decompiled C# files and localization JSON."""
import json
import re
from pathlib import Path
from description_resolver import resolve_description, extract_vars_from_source

BASE = Path(__file__).resolve().parents[3]
DECOMPILED = BASE / "extraction" / "decompiled"
LOCALIZATION = BASE / "extraction" / "raw" / "localization" / "eng"
ENCHANTMENTS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Enchantments"
STATIC_IMAGES = BASE / "backend" / "static" / "images" / "enchantments"
OUTPUT = BASE / "data"


def class_name_to_id(name: str) -> str:
    s = re.sub(r'(?<=[a-z0-9])(?=[A-Z])', '_', name)
    s = re.sub(r'(?<=[A-Z])(?=[A-Z][a-z])', '_', s)
    return s.upper()


def load_localization() -> dict:
    loc_file = LOCALIZATION / "enchantments.json"
    if loc_file.exists():
        with open(loc_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def parse_card_type_restriction(content: str) -> str | None:
    """Extract which card types this enchantment can be applied to."""
    m = re.search(r'CanEnchantCardType\(CardType\s+\w+\)\s*\{[^}]*cardType\s*==\s*CardType\.(\w+)', content, re.DOTALL)
    if m:
        return m.group(1)
    return None


def parse_single_enchantment(filepath: Path, localization: dict) -> dict | None:
    content = filepath.read_text(encoding="utf-8")
    class_name = filepath.stem

    if class_name.startswith("Deprecated") or class_name.startswith("Mock"):
        return None

    ench_id = class_name_to_id(class_name)

    # Extract variable values from source
    all_vars = extract_vars_from_source(content)

    # Enchantments using base.Amount: the value equals the enchantment level,
    # which is set at application time (e.g. "Adroit 5"). Use "X" as placeholder.
    if re.search(r'base\.Amount', content):
        all_vars["Amount"] = "X"
        # If RecalculateValues sets a var from base.Amount, that var also = Amount
        for rm in re.finditer(r'DynamicVars\.(\w+)\.BaseValue\s*=\s*base\.Amount', content):
            var_name = rm.group(1)
            all_vars[var_name] = "X"

    # Localization
    title = localization.get(f"{ench_id}.title", class_name)
    description_raw = localization.get(f"{ench_id}.description", "")
    extra_card_text_raw = localization.get(f"{ench_id}.extraCardText", "")

    # Resolve description templates
    description_resolved = resolve_description(description_raw, all_vars)
    desc_clean = description_resolved

    extra_text_resolved = resolve_description(extra_card_text_raw, all_vars) if extra_card_text_raw else None

    # Card type restriction
    card_type = parse_card_type_restriction(content)

    # Boolean properties
    is_stackable = "IsStackable => true" in content
    show_amount = "ShowAmount => true" in content

    # Image URL
    image_file = STATIC_IMAGES / f"{ench_id.lower()}.png"
    image_url = f"/static/images/enchantments/{ench_id.lower()}.png" if image_file.exists() else None

    return {
        "id": ench_id,
        "name": title,
        "description": desc_clean,
        "description_raw": description_raw if description_raw != desc_clean else None,
        "extra_card_text": extra_text_resolved,
        "card_type": card_type,
        "is_stackable": is_stackable,
        "image_url": image_url,
    }


def parse_all_enchantments() -> list[dict]:
    localization = load_localization()
    enchantments = []
    for filepath in sorted(ENCHANTMENTS_DIR.glob("*.cs")):
        ench = parse_single_enchantment(filepath, localization)
        if ench:
            enchantments.append(ench)
    return enchantments


def main():
    OUTPUT.mkdir(exist_ok=True)
    enchantments = parse_all_enchantments()
    with open(OUTPUT / "enchantments.json", "w", encoding="utf-8") as f:
        json.dump(enchantments, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(enchantments)} enchantments -> data/enchantments.json")


if __name__ == "__main__":
    main()
