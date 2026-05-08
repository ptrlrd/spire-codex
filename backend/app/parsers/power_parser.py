"""Parse power/buff/debuff data from decompiled C# files and localization JSON."""

import json
import re
from pathlib import Path
from description_resolver import resolve_description, extract_vars_from_source

from orphan_filter import is_orphan
from parser_paths import (
    DECOMPILED,
    RAW_DIR,
    loc_dir as _loc_dir,
    data_dir as _data_dir,
    resolve_image_url,
)

POWERS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Powers"
CARDS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Cards"
POWERS_IMAGES = RAW_DIR / "images" / "powers"
POWERS_STATIC = Path(__file__).resolve().parents[2] / "static" / "images" / "powers"

# Powers like ToricToughnessPower carry a placeholder `BlockVar(0m, Unpowered)`
# and call `SetBlock(...)` from the matching card at runtime — the *card* is
# the source of truth for the canonical Block + Turns values shown in tooltips.
# When the power's class shares its base name with a card (e.g.
# `ToricToughnessPower` ↔ `ToricToughness.cs`), pull the card's vars and let
# them win over the placeholder zeros so descriptions render real numbers.
# Mega Crit's static localization uses a literal "X" as a placeholder for
# any variable amount that gets set at runtime by the apply site (e.g.
# `Hatches after X turns.` for HatchPower, `this creature X loses HP.` for
# DemisePower). Wrap those Xs in [blue] so they read as variables rather
# than as the letter X. The smart-description path normally handles this
# via {Amount} -> [blue]N[/blue], but we keep the polish for the cases
# where the smart template is unavailable or the parser falls back.
_LITERAL_X_PATTERN = re.compile(
    r"(?<![A-Za-z\[/])X(?![A-Za-z\]/])"  # standalone uppercase X — not inside a word or markup tag
)


def _polish_power_description(text: str) -> str:
    if not text:
        return text
    # Wrap standalone "X" placeholders in [blue]…[/blue].
    text = _LITERAL_X_PATTERN.sub("[blue]X[/blue]", text)
    # Capitalize the first visible letter — many smart templates start
    # with a `{OwnerName}` substitution that resolves to "this creature",
    # giving sentences that open mid-word ("[gold]this creature's[/gold]
    # next Attack…"). Walk past leading whitespace + an optional [tag] open
    # and uppercase the first alpha character we see.
    m = re.match(r"^(\s*(?:\[[^\]]+\]\s*)?)([a-z])", text)
    if m:
        text = text[: m.end(1)] + m.group(2).upper() + text[m.end(2) :]
    return text


def _enrich_vars_from_sister_card(base_name: str, all_vars: dict) -> dict:
    sister = CARDS_DIR / f"{base_name}.cs"
    if not sister.exists():
        return all_vars
    card_vars = extract_vars_from_source(sister.read_text(encoding="utf-8"))
    # Cards often expose `Turns` as a DynamicVar; the power's Amount is set to
    # that value at apply time.
    if "Turns" in card_vars and "Amount" not in all_vars:
        all_vars["Amount"] = card_vars["Turns"]
    # Card BlockVar values override the power's placeholder zero. Same for
    # Damage/Strength/Dexterity if it ever comes up.
    for key in ("Block", "Damage", "Strength", "Dexterity", "Focus"):
        if key in card_vars and all_vars.get(key, 0) == 0:
            all_vars[key] = card_vars[key]
    return all_vars


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
    # Skip orphan .cs files left over from previous extractions — the
    # class no longer exists in the current DLL (no cross-references,
    # stale mtime) so it shouldn't appear in our output.
    if is_orphan(filepath):
        return None
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

    # Pull canonical values from the sister card (e.g. ToricToughnessPower ↔
    # ToricToughness.cs) so display numbers reflect the default unmodified
    # play instead of the power's runtime-zero placeholders.
    all_vars = _enrich_vars_from_sister_card(base_name, all_vars)

    # Default runtime vars — OwnerName is the creature that has the power.
    # Kept lowercase here because the localization uses it mid-sentence too
    # ("Whenever {OwnerName} deals damage..."); sentence-initial usages get
    # capitalised by the post-processor below.
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

    # Drop powers with no localization at all (title + both descriptions
    # missing). These are typically deprecated implementations Mega Crit
    # has stripped from the lang files but still ship in the assembly,
    # e.g. GrapplePower — surfacing them with empty descriptions just
    # adds noise to the powers list.
    has_localization_title = (
        f"{power_id}.title" in localization
        or f"{power_id}_POWER.title" in localization
        or f"{class_name_to_id(class_name)}.title" in localization
    )
    if not has_localization_title and not smart_raw and not plain_raw:
        return None

    if smart_raw:
        description_resolved = resolve_description(smart_raw, all_vars)
        # Look for actual unresolved-template artifacts in the *resolved*
        # output rather than just inferring from the source. A
        # `{Amount:plural:...}` directive resolves cleanly even without
        # Amount in scope (the resolver picks the plural branch by default
        # — see `resolve_all_plurals`), so reading "{Amount" in the source
        # over-eagerly forces a fallback for powers like SandpitPower whose
        # smart template renders into a perfectly complete sentence.
        has_artifacts = bool(
            re.search(
                r"\[Amount\]|\[Applier|:cond:|==\d+\?|>\d+\?", description_resolved
            )
        )
        # Only fall back to plain if:
        # 1. Plain is actually useful (not "TODO" or empty)
        # 2. Smart description ONLY has artifacts (no other resolved vars that plain would lose)
        plain_is_useful = plain_raw and plain_raw.strip() not in ("", "TODO")
        # Check if smart description resolved any non-Amount vars that plain would lose
        smart_has_resolved_vars = any(
            f"{{{v}" in smart_raw and v != "Amount" and v in all_vars for v in all_vars
        )
        # Also check for unresolved StringVar placeholders like [AfflictionTitle]
        has_unresolved_stringvars = bool(
            re.search(r"\[(?:AfflictionTitle|Covering)\]", description_resolved)
        )
        if (has_artifacts and plain_is_useful and not smart_has_resolved_vars) or (
            has_unresolved_stringvars and plain_is_useful
        ):
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

    desc_clean = _polish_power_description(description_resolved)

    # Resolve image URL — version-aware (per-version beta asset → stable
    # canonical fallback). The icon stem is what differs between powers
    # (alias map handles a few oddballs); resolve_image_url knows where
    # to look.
    if power_id in IMAGE_ALIASES:
        icon_stem = Path(IMAGE_ALIASES[power_id]).stem
    else:
        icon_stem = f"{power_id.lower()}_power"
    image_url = resolve_image_url("powers", icon_stem)

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
