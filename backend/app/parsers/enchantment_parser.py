"""Parse enchantment data from decompiled C# files and localization JSON."""

import json
import re
from pathlib import Path
from description_resolver import resolve_description, extract_vars_from_source

from parser_paths import BASE, DECOMPILED, loc_dir as _loc_dir, data_dir as _data_dir

ENCHANTMENTS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Enchantments"
STATIC_IMAGES = BASE / "backend" / "static" / "images" / "enchantments"


def class_name_to_id(name: str) -> str:
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name)
    s = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", "_", s)
    return s.upper()


def load_localization(loc_dir: Path) -> dict:
    loc_file = loc_dir / "enchantments.json"
    if loc_file.exists():
        with open(loc_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def parse_card_type_restriction(content: str) -> str | None:
    """Extract which card types this enchantment can be applied to."""
    # Simple equality: cardType == CardType.Attack
    m = re.search(
        r"CanEnchantCardType\(CardType\s+\w+\)\s*\{[^}]*cardType\s*==\s*CardType\.(\w+)",
        content,
        re.DOTALL,
    )
    if m:
        return m.group(1)
    # Decompiled range check: (uint)(cardType - 1) <= 1u → Attack (1) or Skill (2)
    if re.search(
        r"CanEnchantCardType.*\(uint\)\(cardType\s*-\s*1\)\s*<=\s*1u",
        content,
        re.DOTALL,
    ):
        return "Attack, Skill"
    return None


def parse_applicable_to(content: str) -> str | None:
    """Extract CanEnchant restrictions beyond card type (tags, keywords, properties)."""
    # Extract CanEnchant(CardModel ...) method body up to next method declaration
    m = re.search(
        r"override\s+bool\s+CanEnchant\(CardModel\s+\w+\)\s*\{(.*?)(?=\n\t(?:public|protected|private)\s|\n\})",
        content,
        re.DOTALL,
    )
    if not m:
        return None
    body = m.group(1)

    restrictions = []

    # Tag checks: card.Tags.Contains(CardTag.Strike)
    tags = re.findall(r"Tags\.Contains\(CardTag\.(\w+)\)", body)
    if tags:
        restrictions.append(", ".join(tags) + " cards")

    # Rarity checks: card.Rarity == CardRarity.Basic
    rarity_m = re.search(r"Rarity\s*==\s*CardRarity\.(\w+)", body)
    if rarity_m:
        restrictions.insert(0, rarity_m.group(1))

    # Keyword checks: card.Keywords.Contains(CardKeyword.Exhaust)
    keywords = re.findall(r"Keywords\.Contains\(CardKeyword\.(\w+)\)", body)
    if keywords:
        kw_names = [k for k in keywords if k != "Unplayable"]
        if kw_names:
            restrictions.append("cards with " + ", ".join(kw_names))

    # Property checks: card.GainsBlock
    if "GainsBlock" in body:
        restrictions.append("cards that gain Block")

    if restrictions:
        return " ".join(restrictions)
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
    if re.search(r"base\.Amount", content):
        all_vars["Amount"] = "X"
        # If RecalculateValues sets a var from base.Amount, that var also = Amount
        for rm in re.finditer(
            r"DynamicVars\.(\w+)\.BaseValue\s*=\s*base\.Amount", content
        ):
            var_name = rm.group(1)
            all_vars[var_name] = "X"

    # Localization
    title = localization.get(f"{ench_id}.title", class_name)
    description_raw = localization.get(f"{ench_id}.description", "")
    extra_card_text_raw = localization.get(f"{ench_id}.extraCardText", "")

    # Resolve description templates
    description_resolved = resolve_description(description_raw, all_vars)
    desc_clean = description_resolved

    extra_text_resolved = (
        resolve_description(extra_card_text_raw, all_vars)
        if extra_card_text_raw
        else None
    )

    # Card type restriction
    card_type = parse_card_type_restriction(content)

    # CanEnchant restriction (tags, keywords, properties beyond card type)
    applicable_to = parse_applicable_to(content)

    # Boolean properties
    is_stackable = "IsStackable => true" in content

    # Image URL — prefer WebP, fall back to PNG
    ench_base = ench_id.lower()
    image_file = STATIC_IMAGES / f"{ench_base}.webp"
    if not image_file.exists():
        image_file = STATIC_IMAGES / f"{ench_base}.png"
    image_url = (
        f"/static/images/enchantments/{image_file.name}"
        if image_file.exists()
        else None
    )

    return {
        "id": ench_id,
        "name": title,
        "description": desc_clean,
        "description_raw": description_raw if description_raw != desc_clean else None,
        "extra_card_text": extra_text_resolved,
        "card_type": card_type,
        "applicable_to": applicable_to,
        "is_stackable": is_stackable,
        "image_url": image_url,
    }


def parse_all_enchantments(loc_dir: Path) -> list[dict]:
    localization = load_localization(loc_dir)
    enchantments = []
    for filepath in sorted(ENCHANTMENTS_DIR.glob("*.cs")):
        ench = parse_single_enchantment(filepath, localization)
        if ench:
            enchantments.append(ench)
    return enchantments


def main(lang: str = "eng"):
    loc_dir = _loc_dir(lang)
    output_dir = _data_dir(lang)
    output_dir.mkdir(parents=True, exist_ok=True)
    enchantments = parse_all_enchantments(loc_dir)
    with open(output_dir / "enchantments.json", "w", encoding="utf-8") as f:
        json.dump(enchantments, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(enchantments)} enchantments -> data/{lang}/enchantments.json")


if __name__ == "__main__":
    main()
