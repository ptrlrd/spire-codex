"""Parse power/buff/debuff data from decompiled C# files and localization JSON."""

import json
import re
from pathlib import Path
from description_resolver import resolve_description, extract_vars_from_source

from parser_paths import DECOMPILED, RAW_DIR, loc_dir as _loc_dir, data_dir as _data_dir

POWERS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Powers"
POWERS_IMAGES = RAW_DIR / "images" / "powers"
POWERS_STATIC = Path(__file__).resolve().parents[2] / "static" / "images" / "powers"

# Aliases for powers whose icon filename doesn't match the ID pattern
IMAGE_ALIASES: dict[str, str] = {
    "TEMPORARY_DEXTERITY": "dexterity_down_power.png",
}


def class_name_to_id(name: str) -> str:
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name)
    s = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", "_", s)
    return s.upper()


def load_localization(loc_dir: Path) -> dict:
    loc_file = loc_dir / "powers.json"
    if loc_file.exists():
        with open(loc_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


# Map parent class -> { stat, positive_key, negative_key }
TEMPORARY_POWER_BASES = {
    "TemporaryStrengthPower": {
        "stat": "Strength",
        "pos_key": "TEMPORARY_STRENGTH_POWER",
        "neg_key": "TEMPORARY_STRENGTH_DOWN",
    },
    "TemporaryDexterityPower": {
        "stat": "Dexterity",
        "pos_key": "TEMPORARY_DEXTERITY_POWER",
        "neg_key": "TEMPORARY_DEXTERITY_DOWN",
    },
    "TemporaryFocusPower": {
        "stat": "Focus",
        "pos_key": "TEMPORARY_FOCUS_POWER",
        "neg_key": "TEMPORARY_FOCUS_DOWN",
    },
}


def detect_parent_power(content: str) -> tuple[str | None, bool]:
    """Detect if a power inherits from a Temporary*Power base class.
    Returns (parent_class_name, is_positive)."""
    m = re.search(r"class\s+\w+\s*:\s*(\w+)", content)
    if not m or m.group(1) not in TEMPORARY_POWER_BASES:
        return None, True
    parent = m.group(1)
    pos = re.search(r"IsPositive\s*=>\s*(true|false)", content)
    is_positive = (
        pos.group(1) == "true" if pos else True
    )  # default is true in base classes
    return parent, is_positive


def parse_single_power(filepath: Path, localization: dict) -> dict | None:
    content = filepath.read_text(encoding="utf-8")
    class_name = filepath.stem

    if class_name.startswith("Deprecated") or class_name.startswith("Mock"):
        return None

    # Skip abstract base classes — their children are the real powers
    if re.search(r"\babstract\s+class\b", content):
        return None

    # Strip "Power" suffix for ID if present
    base_name = class_name
    if base_name.endswith("Power"):
        base_name = base_name[:-5]
    power_id = class_name_to_id(base_name)

    # Check for Temporary*Power inheritance
    parent_class, is_positive = detect_parent_power(content)
    parent_info = TEMPORARY_POWER_BASES.get(parent_class) if parent_class else None

    # PowerType: Buff, Debuff, or None/neutral
    type_match = re.search(
        r"(?:override\s+)?PowerType\s+Type\s*(?:=>|=)\s*PowerType\.(\w+)", content
    )
    if type_match:
        power_type = type_match.group(1)
    elif parent_info:
        power_type = "Buff" if is_positive else "Debuff"
    else:
        power_type = "None"

    # StackType: Counter, Single, None
    stack_match = re.search(
        r"(?:override\s+)?PowerStackType\s+StackType\s*(?:=>|=)\s*PowerStackType\.(\w+)",
        content,
    )
    if stack_match:
        stack_type = stack_match.group(1)
    elif parent_info:
        stack_type = "Counter"  # All Temporary*Power bases use Counter
    else:
        stack_type = "None"

    # AllowNegative
    allow_negative = bool(re.search(r"AllowNegative\s*(?:=>|=)\s*true", content))

    # Extract variable values from source
    all_vars = extract_vars_from_source(content)

    # Default runtime vars — OwnerName is the creature that has the power
    all_vars.setdefault("OwnerName", "this creature")

    # Localization — try both with and without POWER suffix
    title = localization.get(f"{power_id}.title")
    if title is None:
        # Try with _POWER suffix
        title = localization.get(f"{power_id}_POWER.title")
    if title is None:
        # Try full class name as ID
        full_id = class_name_to_id(class_name)
        title = localization.get(f"{full_id}.title", class_name)

    # For inherited powers with no localization title, derive a readable name
    if parent_info and title == class_name:
        stat = parent_info["stat"]
        direction = "" if is_positive else " Down"
        title = f"Temporary {stat}{direction}"

    # Description — try smartDescription first, fall back to plain description
    # if smartDescription has unresolvable vars like {Amount}
    desc_key = power_id
    if (
        f"{power_id}.smartDescription" not in localization
        and f"{power_id}.description" not in localization
    ):
        desc_key = (
            f"{power_id}_POWER"
            if f"{power_id}_POWER.smartDescription" in localization
            else class_name_to_id(class_name)
        )

    # For inherited powers with no own localization, use parent's localization
    if (
        parent_info
        and f"{desc_key}.smartDescription" not in localization
        and f"{desc_key}.description" not in localization
    ):
        desc_key = parent_info["neg_key"] if not is_positive else parent_info["pos_key"]

    smart_raw = localization.get(f"{desc_key}.smartDescription", "")
    plain_raw = localization.get(f"{desc_key}.description", "")

    if smart_raw:
        description_resolved = resolve_description(smart_raw, all_vars)
        # If the smart template uses {Amount} but we couldn't extract it,
        # prefer the plain description (Amount is the stack count, set at runtime).
        # Also fall back for any remaining template artifacts.
        amount_missing = "{Amount" in smart_raw and "Amount" not in all_vars
        has_artifacts = bool(
            re.search(
                r"\[Amount\]|\[Applier|:cond:|==\d+\?|>\d+\?", description_resolved
            )
        )
        # Only fall back to plain if:
        # 1. Plain is actually useful (not "TODO" or empty)
        # 2. Smart description ONLY has {Amount} issues (no other resolved vars that plain would lose)
        plain_is_useful = plain_raw and plain_raw.strip() not in ("", "TODO")
        # Check if smart description resolved any non-Amount vars that plain would lose
        smart_has_resolved_vars = any(
            f"{{{v}" in smart_raw and v != "Amount" and v in all_vars for v in all_vars
        )
        # Also check for unresolved StringVar placeholders like [AfflictionTitle]
        has_unresolved_stringvars = bool(
            re.search(r"\[(?:AfflictionTitle|Covering)\]", description_resolved)
        )
        if (
            (amount_missing or has_artifacts)
            and plain_is_useful
            and not smart_has_resolved_vars
        ) or (has_unresolved_stringvars and plain_is_useful):
            description_raw = plain_raw
            description_resolved = resolve_description(plain_raw, all_vars)
        else:
            description_raw = smart_raw
    elif plain_raw:
        description_raw = plain_raw
        description_resolved = resolve_description(plain_raw, all_vars)
    else:
        description_raw = ""
        description_resolved = ""

    desc_clean = description_resolved

    # Resolve image URL — prefer WebP from static dir, fall back to PNG from raw
    image_url = None
    if power_id in IMAGE_ALIASES:
        icon_name = IMAGE_ALIASES[power_id]
    else:
        icon_name = f"{power_id.lower()}_power.png"
    webp_name = Path(icon_name).with_suffix(".webp").name
    if (POWERS_STATIC / webp_name).exists():
        image_url = f"/static/images/powers/{webp_name}"
    elif (POWERS_IMAGES / icon_name).exists():
        image_url = f"/static/images/powers/{icon_name}"

    return {
        "id": power_id,
        "name": title,
        "description": desc_clean,
        "description_raw": description_raw if description_raw != desc_clean else None,
        "type": power_type,
        "stack_type": stack_type,
        "allow_negative": allow_negative if allow_negative else None,
        "image_url": image_url,
    }


def parse_all_powers(loc_dir: Path) -> list[dict]:
    localization = load_localization(loc_dir)
    powers = []
    for filepath in sorted(POWERS_DIR.glob("*.cs")):
        power = parse_single_power(filepath, localization)
        if power:
            powers.append(power)
    return powers


def main(lang: str = "eng"):
    loc_dir = _loc_dir(lang)
    output_dir = _data_dir(lang)
    output_dir.mkdir(parents=True, exist_ok=True)
    powers = parse_all_powers(loc_dir)
    with open(output_dir / "powers.json", "w", encoding="utf-8") as f:
        json.dump(powers, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(powers)} powers -> data/{lang}/powers.json")


if __name__ == "__main__":
    main()
