"""Parse power/buff/debuff data from decompiled C# files and localization JSON."""
import json
import re
from pathlib import Path
from description_resolver import resolve_description, extract_vars_from_source

BASE = Path(__file__).resolve().parents[3]
DECOMPILED = BASE / "extraction" / "decompiled"
LOCALIZATION = BASE / "extraction" / "raw" / "localization" / "eng"
POWERS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Powers"
OUTPUT = BASE / "data"


def class_name_to_id(name: str) -> str:
    s = re.sub(r'(?<=[a-z0-9])(?=[A-Z])', '_', name)
    s = re.sub(r'(?<=[A-Z])(?=[A-Z][a-z])', '_', s)
    return s.upper()


def load_localization() -> dict:
    loc_file = LOCALIZATION / "powers.json"
    if loc_file.exists():
        with open(loc_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def parse_single_power(filepath: Path, localization: dict) -> dict | None:
    content = filepath.read_text(encoding="utf-8")
    class_name = filepath.stem

    if class_name.startswith("Deprecated") or class_name.startswith("Mock"):
        return None

    # Strip "Power" suffix for ID if present
    base_name = class_name
    if base_name.endswith("Power"):
        base_name = base_name[:-5]
    power_id = class_name_to_id(base_name)

    # PowerType: Buff, Debuff, or None/neutral
    type_match = re.search(r'(?:override\s+)?PowerType\s+Type\s*(?:=>|=)\s*PowerType\.(\w+)', content)
    power_type = type_match.group(1) if type_match else "None"

    # StackType: Counter, Single, None
    stack_match = re.search(r'(?:override\s+)?PowerStackType\s+StackType\s*(?:=>|=)\s*PowerStackType\.(\w+)', content)
    stack_type = stack_match.group(1) if stack_match else "None"

    # AllowNegative
    allow_negative = bool(re.search(r'AllowNegative\s*(?:=>|=)\s*true', content))

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

    # Description — try smartDescription first, fall back to plain description
    # if smartDescription has unresolvable vars like {Amount}
    desc_key = power_id
    if f"{power_id}.smartDescription" not in localization and f"{power_id}.description" not in localization:
        desc_key = f"{power_id}_POWER" if f"{power_id}_POWER.smartDescription" in localization else class_name_to_id(class_name)

    smart_raw = localization.get(f"{desc_key}.smartDescription", "")
    plain_raw = localization.get(f"{desc_key}.description", "")

    if smart_raw:
        description_resolved = resolve_description(smart_raw, all_vars)
        # If the smart template uses {Amount} but we couldn't extract it,
        # prefer the plain description (Amount is the stack count, set at runtime).
        # Also fall back for any remaining template artifacts.
        amount_missing = "{Amount" in smart_raw and "Amount" not in all_vars
        has_artifacts = bool(re.search(
            r'\[Amount\]|\[Applier|:cond:|==\d+\?|>\d+\?',
            description_resolved
        ))
        if (amount_missing or has_artifacts) and plain_raw:
            description_raw = plain_raw
            description_resolved = plain_raw
        else:
            description_raw = smart_raw
    elif plain_raw:
        description_raw = plain_raw
        description_resolved = plain_raw
    else:
        description_raw = ""
        description_resolved = ""

    desc_clean = description_resolved

    return {
        "id": power_id,
        "name": title,
        "description": desc_clean,
        "description_raw": description_raw if description_raw != desc_clean else None,
        "type": power_type,
        "stack_type": stack_type,
        "allow_negative": allow_negative if allow_negative else None,
    }


def parse_all_powers() -> list[dict]:
    localization = load_localization()
    powers = []
    for filepath in sorted(POWERS_DIR.glob("*.cs")):
        power = parse_single_power(filepath, localization)
        if power:
            powers.append(power)
    return powers


def main():
    OUTPUT.mkdir(exist_ok=True)
    powers = parse_all_powers()
    with open(OUTPUT / "powers.json", "w", encoding="utf-8") as f:
        json.dump(powers, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(powers)} powers -> data/powers.json")


if __name__ == "__main__":
    main()
