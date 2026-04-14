"""Parse character data from decompiled C# files and localization JSON."""

import json
import re
from pathlib import Path

from parser_paths import DECOMPILED, loc_dir as _loc_dir, data_dir as _data_dir

CHARS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Characters"


def class_name_to_id(name: str) -> str:
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name)
    s = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", "_", s)
    return s.upper()


def load_localization(loc_dir: Path) -> dict:
    loc_file = loc_dir / "characters.json"
    if loc_file.exists():
        with open(loc_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def load_ancients_localization(loc_dir: Path) -> dict:
    loc_file = loc_dir / "ancients.json"
    if loc_file.exists():
        with open(loc_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def parse_ancient_dialogues(ancients_loc: dict, char_id: str) -> list[dict]:
    """Parse NPC dialogue trees for a specific character."""
    dialogues = []
    # Group by ancient -> conversation index
    convos: dict[str, dict[str, list]] = {}
    prefix_pattern = re.compile(rf"^(\w+)\.talk\.{char_id}\.(\d+)-(\d+)(r?)\.(\w+)$")
    for key, value in ancients_loc.items():
        m = prefix_pattern.match(key)
        if not m:
            continue
        ancient = m.group(1)
        convo_idx = m.group(2)
        line_idx = int(m.group(3))
        is_random = bool(m.group(4))
        speaker_type = m.group(5)  # "ancient", "char", "next"

        if speaker_type == "next":
            continue

        convo_key = f"{ancient}.{convo_idx}"
        if convo_key not in convos:
            convos[convo_key] = {
                "ancient": ancient,
                "index": convo_idx,
                "random": is_random,
                "lines": [],
            }
        convos[convo_key]["lines"].append(
            {
                "order": line_idx,
                "speaker": speaker_type,
                "text": value,
            }
        )

    for convo_key in sorted(convos.keys()):
        convo = convos[convo_key]
        convo["lines"].sort(key=lambda x: x["order"])
        ancient_name = convo["ancient"].replace("_", " ").title()
        dialogues.append(
            {
                "ancient": convo["ancient"],
                "ancient_name": ancient_name,
                "lines": convo["lines"],
            }
        )

    return dialogues


def parse_character(
    filepath: Path, localization: dict, ancients_loc: dict
) -> dict | None:
    content = filepath.read_text(encoding="utf-8")
    class_name = filepath.stem

    if class_name in ("RandomCharacter", "Deprived", "DeprecatedCharacter"):
        return None

    char_id = class_name_to_id(class_name)

    # Starting HP
    hp_match = re.search(r"StartingHp\s*=>\s*(\d+)", content)
    starting_hp = int(hp_match.group(1)) if hp_match else None

    # Starting Gold
    gold_match = re.search(r"StartingGold\s*=>\s*(\d+)", content)
    starting_gold = int(gold_match.group(1)) if gold_match else None

    # Starting deck
    starting_deck = []
    for m in re.finditer(r"ModelDb\.Card<(\w+)>\(\)", content):
        starting_deck.append(m.group(1))

    # Starting relics
    starting_relics = []
    for m in re.finditer(r"ModelDb\.Relic<(\w+)>\(\)", content):
        starting_relics.append(m.group(1))

    # Gender
    gender_match = re.search(r"Gender\s*=>\s*CharacterGender\.(\w+)", content)
    gender = gender_match.group(1) if gender_match else None

    # Color
    color_match = re.search(r"NameColor\s*=>\s*StsColors\.(\w+)", content)
    color = color_match.group(1) if color_match else None

    # Max Energy
    energy_match = re.search(r"MaxEnergy\s*=>\s*(\d+)", content)
    max_energy = int(energy_match.group(1)) if energy_match else 3

    # Orb slots (Defect)
    orb_match = re.search(r"BaseOrbSlotCount\s*=>\s*(\d+)", content)
    orb_slots = int(orb_match.group(1)) if orb_match else None

    # Unlocks after
    unlock_match = re.search(
        r"UnlocksAfterRunAs\s*=>\s*ModelDb\.Character<(\w+)>", content
    )
    unlocks_after = unlock_match.group(1) if unlock_match else None

    # Dialogue color
    dialogue_color_match = re.search(
        r"DialogueColor\s*=>\s*(?:StsColors\.)?(\w+)", content
    )
    dialogue_color = dialogue_color_match.group(1) if dialogue_color_match else None

    # Localization
    title = localization.get(f"{char_id}.title", class_name)
    description = localization.get(f"{char_id}.description", "")

    # Quotes / flavor text from localization
    quotes = {}
    quote_keys = [
        ("event_death_prevention", "eventDeathPrevention"),
        ("gold_monologue", "goldMonologue"),
        ("aroma_principle", "aromaPrinciple"),
        ("banter_alive", "banter.alive.endTurnPing"),
        ("banter_dead", "banter.dead.endTurnPing"),
        ("unlock_text", "unlockText"),
        ("cards_modifier_title", "cardsModifierTitle"),
        ("cards_modifier_description", "cardsModifierDescription"),
    ]
    for field_name, loc_key in quote_keys:
        val = localization.get(f"{char_id}.{loc_key}")
        if val:
            quotes[field_name] = val

    # Ancient NPC dialogues
    dialogues = parse_ancient_dialogues(ancients_loc, char_id)

    return {
        "id": char_id,
        "name": title,
        "description": description,
        "starting_hp": starting_hp,
        "starting_gold": starting_gold,
        "max_energy": max_energy,
        "orb_slots": orb_slots,
        "starting_deck": starting_deck,
        "starting_relics": starting_relics,
        "unlocks_after": unlocks_after,
        "gender": gender,
        "color": color,
        "dialogue_color": dialogue_color,
        "quotes": quotes if quotes else None,
        "dialogues": dialogues if dialogues else None,
        "image_url": f"/static/images/characters/char_select_{char_id.lower()}.webp",
    }


def parse_all_characters(loc_dir: Path) -> list[dict]:
    localization = load_localization(loc_dir)
    ancients_loc = load_ancients_localization(loc_dir)
    characters = []
    for filepath in sorted(CHARS_DIR.glob("*.cs")):
        char = parse_character(filepath, localization, ancients_loc)
        if char:
            characters.append(char)
    return characters


def main(lang: str = "eng"):
    loc_dir = _loc_dir(lang)
    output_dir = _data_dir(lang)
    output_dir.mkdir(parents=True, exist_ok=True)
    characters = parse_all_characters(loc_dir)
    with open(output_dir / "characters.json", "w", encoding="utf-8") as f:
        json.dump(characters, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(characters)} characters -> data/{lang}/characters.json")


if __name__ == "__main__":
    main()
