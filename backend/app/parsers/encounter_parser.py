"""Parse encounter data from decompiled C# files and localization JSON."""

import json
import re
from pathlib import Path

from orphan_filter import is_orphan
from parser_paths import DECOMPILED, loc_dir as _loc_dir, data_dir as _data_dir

ENCOUNTERS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Encounters"
ACTS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Acts"


def class_name_to_id(name: str) -> str:
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name)
    s = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", "_", s)
    return s.upper()


def monster_class_to_name(class_name: str) -> str:
    """Convert PascalCase monster class to readable name."""
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", class_name)
    s = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", " ", s)
    return s


def load_localization(loc_dir: Path) -> dict:
    loc_file = loc_dir / "encounters.json"
    if loc_file.exists():
        with open(loc_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def load_monster_names(loc_dir: Path) -> dict[str, str]:
    """Load monster ID -> localized name mapping."""
    loc_file = loc_dir / "monsters.json"
    if not loc_file.exists():
        return {}
    with open(loc_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    names = {}
    for key, value in data.items():
        if key.endswith(".name"):
            monster_id = key[:-5]  # strip ".name"
            names[monster_id] = value
    return names


def build_act_mapping() -> dict[str, str]:
    """Map encounter class names to act names by parsing act files."""
    encounter_to_act = {}
    act_map = {
        "Overgrowth.cs": "Act 1 - Overgrowth",
        "Hive.cs": "Act 2 - Hive",
        "Glory.cs": "Act 3 - Glory",
        "Underdocks.cs": "Underdocks",
    }
    for filename, act_name in act_map.items():
        filepath = ACTS_DIR / filename
        if not filepath.exists():
            continue
        content = filepath.read_text(encoding="utf-8")
        for m in re.finditer(r"ModelDb\.Encounter<(\w+)>\(\)", content):
            encounter_to_act[m.group(1)] = act_name
    return encounter_to_act


def parse_room_type(content: str) -> str:
    """Extract room type: Monster, Elite, or Boss."""
    m = re.search(r"RoomType\s*=>\s*RoomType\.(\w+)", content)
    return m.group(1) if m else "Monster"


def parse_tags(content: str) -> list[str]:
    """Extract encounter tags."""
    tags = []
    for m in re.finditer(r"EncounterTag\.(\w+)", content):
        tag = m.group(1)
        if tag != "None":
            tags.append(tag)
    return tags


def parse_monsters(content: str) -> list[str]:
    """Extract all possible monster class names from AllPossibleMonsters and GenerateMonsters."""
    monsters = set()
    for m in re.finditer(r"ModelDb\.Monster<(\w+)>\(\)", content):
        monsters.add(m.group(1))
    return sorted(monsters)


def parse_single_encounter(
    filepath: Path,
    localization: dict,
    act_mapping: dict,
    monster_names: dict[str, str] = {},
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

    enc_id = class_name_to_id(class_name)
    room_type = parse_room_type(content)
    tags = parse_tags(content)
    monster_classes = parse_monsters(content)

    # Determine if weak encounter
    is_weak = "Weak" in class_name or "IsWeak => true" in content

    # Localization
    title = localization.get(f"{enc_id}.title", monster_class_to_name(class_name))
    loss_text = localization.get(f"{enc_id}.loss", "")
    # Resolve {encounter} with the encounter title, {character} with generic noun
    loss_clean = loss_text.replace("{encounter}", title).replace(
        "{character}", "[b]The Adventurer[/b]"
    )

    # Act mapping
    act = act_mapping.get(class_name)

    # Convert monster class names to IDs and localized names
    monsters = []
    for mc in monster_classes:
        mid = class_name_to_id(mc)
        monsters.append(
            {
                "id": mid,
                "name": monster_names.get(mid, monster_class_to_name(mc)),
            }
        )

    return {
        "id": enc_id,
        "name": title,
        "room_type": room_type,
        "is_weak": is_weak,
        "act": act,
        "tags": tags if tags else None,
        "monsters": monsters if monsters else None,
        "loss_text": loss_clean if loss_clean else None,
    }


def parse_all_encounters(loc_dir: Path) -> list[dict]:
    localization = load_localization(loc_dir)
    act_mapping = build_act_mapping()
    monster_names = load_monster_names(loc_dir)
    encounters = []
    for filepath in sorted(ENCOUNTERS_DIR.glob("*.cs")):
        enc = parse_single_encounter(filepath, localization, act_mapping, monster_names)
        if enc:
            encounters.append(enc)
    return encounters


def main(lang: str = "eng"):
    loc_dir = _loc_dir(lang)
    output_dir = _data_dir(lang)
    output_dir.mkdir(parents=True, exist_ok=True)
    encounters = parse_all_encounters(loc_dir)
    with open(output_dir / "encounters.json", "w", encoding="utf-8") as f:
        json.dump(encounters, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(encounters)} encounters -> data/{lang}/encounters.json")


if __name__ == "__main__":
    main()
