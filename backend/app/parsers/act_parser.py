"""Parse act data from decompiled C# files and localization JSON."""

import json
import re
from pathlib import Path

from parser_paths import DECOMPILED, loc_dir as _loc_dir, data_dir as _data_dir

ACTS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Acts"


def class_name_to_id(name: str) -> str:
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name)
    s = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", "_", s)
    return s.upper()


def load_localization(loc_dir: Path) -> dict:
    loc_file = loc_dir / "acts.json"
    if loc_file.exists():
        with open(loc_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def parse_act(filepath: Path, localization: dict) -> dict:
    content = filepath.read_text(encoding="utf-8")
    class_name = filepath.stem
    act_id = class_name_to_id(class_name)

    title = localization.get(f"{act_id}.title", class_name)

    # Boss encounters from BossDiscoveryOrder property
    boss_list = []
    if "BossDiscoveryOrder" in content:
        boss_section = content.split("BossDiscoveryOrder")[1].split(";")[0]
        boss_list = re.findall(r"ModelDb\.Encounter<(\w+)>\(\)", boss_section)

    # All encounters from GenerateAllEncounters
    encounters = []
    gen_match = re.search(
        r"GenerateAllEncounters\(\)(.*?)(?:\n\t\})", content, re.DOTALL
    )
    if gen_match:
        encounters = re.findall(r"ModelDb\.Encounter<(\w+)>\(\)", gen_match.group(1))

    # Ancients
    ancients = re.findall(r"ModelDb\.AncientEvent<(\w+)>\(\)", content)

    # Events
    events = re.findall(r"ModelDb\.Event<(\w+)>\(\)", content)

    # Number of rooms
    rooms_match = re.search(r"BaseNumberOfRooms\s*=>\s*(\d+)", content)
    num_rooms = int(rooms_match.group(1)) if rooms_match else None

    return {
        "id": act_id,
        "name": title,
        "num_rooms": num_rooms,
        "bosses": [class_name_to_id(b) for b in boss_list],
        "ancients": [class_name_to_id(a) for a in ancients],
        "events": [class_name_to_id(e) for e in events],
        "encounters": [class_name_to_id(e) for e in encounters],
    }


def parse_all_acts(loc_dir: Path) -> list[dict]:
    localization = load_localization(loc_dir)
    acts = []
    for filepath in sorted(ACTS_DIR.glob("*.cs")):
        acts.append(parse_act(filepath, localization))
    return acts


def main(lang: str = "eng"):
    loc_dir = _loc_dir(lang)
    output_dir = _data_dir(lang)
    output_dir.mkdir(parents=True, exist_ok=True)
    acts = parse_all_acts(loc_dir)
    with open(output_dir / "acts.json", "w", encoding="utf-8") as f:
        json.dump(acts, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(acts)} acts -> data/{lang}/acts.json")


if __name__ == "__main__":
    main()
