"""Parse character data from decompiled C# files and localization JSON."""

import json
import re
from pathlib import Path

from parser_paths import (
    DECOMPILED,
    loc_dir as _loc_dir,
    data_dir as _data_dir,
    playable_characters,
    resolve_animation_url,
)

CHARS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Characters"
EVENTS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Events"

_GUESS_OVERRIDE = re.compile(
    r"FoolPronounGuess\s+FoolPronounGuess\s*=>\s*FoolPronounGuess\.(\w+)"
)


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


def load_events_localization(loc_dir: Path) -> dict:
    loc_file = loc_dir / "events.json"
    if loc_file.exists():
        with open(loc_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _is_placeholder(text: str) -> bool:
    """Text the game ships as a stand-in until the real line is written."""
    stripped = (text or "").strip()
    return stripped.upper() == "TODO" or stripped.startswith("TEMP:")


def _pronouns(localization: dict, char_id: str, guess: str) -> dict:
    base = f"{char_id}.guess.{guess}"
    return {
        "guess": guess,
        "subject": localization.get(f"{base}.pronounSubject"),
        "object": localization.get(f"{base}.pronounObject"),
        "possessive": localization.get(f"{base}.possessiveAdjective"),
    }


def parse_pronoun_guesses(
    localization: dict,
    char_id: str,
    speaker_titles: dict,
    events_dir: Path | None = None,
) -> tuple[list[dict], dict] | None:
    """Which pronoun each Ancient or event narrator uses for a character the
    game leaves unguessed. None when the character has no guess table."""
    if not any(key.startswith(f"{char_id}.guess.") for key in localization):
        return None
    events_dir = events_dir or EVENTS_DIR
    guesses = []
    if events_dir.is_dir():
        for filepath in sorted(events_dir.glob("*.cs")):
            match = _GUESS_OVERRIDE.search(filepath.read_text(encoding="utf-8"))
            if not match:
                continue
            speaker_id = class_name_to_id(filepath.stem)
            guesses.append(
                {
                    "speaker_id": speaker_id,
                    "speaker_name": speaker_titles.get(f"{speaker_id}.title")
                    or speaker_id.replace("_", " ").title(),
                    **_pronouns(localization, char_id, match.group(1).lower()),
                }
            )
    guesses.sort(key=lambda g: g["speaker_name"])
    return guesses, _pronouns(localization, char_id, "neutral")


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

        if speaker_type == "next" or _is_placeholder(value):
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
    filepath: Path,
    localization: dict,
    ancients_loc: dict,
    events_loc: dict | None = None,
) -> dict | None:
    content = filepath.read_text(encoding="utf-8")
    class_name = filepath.stem

    if class_name not in playable_characters():
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
    # C# forms: `DialogueColor => new Color("HEX")` (the 5 playable chars) or a
    # named constant like `Colors.Magenta` / `StsColors.Foo`. Capture the hex
    # from the `new Color("...")` form first, otherwise fall back to the named
    # constant. The old regex matched the bare `new` keyword from `new Color(...)`.
    dialogue_color = None
    hex_match = re.search(
        r'DialogueColor\s*=>\s*new\s+Color\(\s*"([0-9A-Fa-f]+)"', content
    )
    if hex_match:
        dialogue_color = hex_match.group(1)
    else:
        named_match = re.search(r"DialogueColor\s*=>\s*(?:Sts)?Colors\.(\w+)", content)
        if named_match:
            dialogue_color = named_match.group(1)

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
        if val and not _is_placeholder(val):
            quotes[field_name] = val

    # Ancient NPC dialogues
    dialogues = parse_ancient_dialogues(ancients_loc, char_id)

    character = {
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
        # Looping animated portrait, rendered per beta version. Prefer the
        # character's signature animation (e.g. the Defect power-up) over a
        # plain idle when both exist. Null when nothing has been rendered.
        "animation_url": (
            resolve_animation_url("characters", f"{char_id.lower()}_power_up")
            or resolve_animation_url("characters", f"{char_id.lower()}_idle")
        ),
    }
    guessed = parse_pronoun_guesses(
        localization, char_id, {**(events_loc or {}), **ancients_loc}
    )
    if guessed:
        character["pronoun_guesses"], character["pronoun_default"] = guessed
    return character


def parse_all_characters(loc_dir: Path) -> list[dict]:
    localization = load_localization(loc_dir)
    ancients_loc = load_ancients_localization(loc_dir)
    events_loc = load_events_localization(loc_dir)
    characters = []
    for filepath in sorted(CHARS_DIR.glob("*.cs")):
        char = parse_character(filepath, localization, ancients_loc, events_loc)
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
