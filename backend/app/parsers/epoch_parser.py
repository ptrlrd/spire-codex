"""Parse epoch and story/timeline data from decompiled C# files and localization JSON."""

import json
import re
from pathlib import Path

from parser_paths import DECOMPILED, loc_dir as _loc_dir, data_dir as _data_dir

EPOCHS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Timeline.Epochs"
STORIES_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Timeline.Stories"

ERA_VALUES = {
    "Prehistoria0": -20000,
    "Prehistoria1": -19999,
    "Prehistoria2": -19998,
    "Seeds0": 0,
    "Seeds1": 1,
    "Seeds2": 2,
    "Seeds3": 3,
    "Blight0": 1201,
    "Blight1": 1202,
    "Blight2": 1203,
    "Flourish0": 1800,
    "Flourish1": 1801,
    "Flourish2": 1802,
    "Flourish3": 1803,
    "Invitation0": 2733,
    "Invitation1": 2734,
    "Invitation2": 2735,
    "Invitation3": 2736,
    "Invitation4": 2737,
    "Invitation5": 2738,
    "Invitation6": 2739,
    "Invitation7": 2740,
    "Peace0": 3000,
    "Peace1": 3001,
    "FarFuture0": 10000,
    "FarFuture1": 10001,
}


def class_name_to_id(name: str) -> str:
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name)
    s = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", "_", s)
    return s.upper()


def epoch_class_to_id(class_name: str) -> str:
    """Convert an epoch class name like 'Colorless1Epoch' to its ID like 'COLORLESS1_EPOCH'."""
    return class_name_to_id(class_name)


def load_localization(loc_dir: Path) -> dict:
    loc_file = loc_dir / "epochs.json"
    if loc_file.exists():
        with open(loc_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def load_eras_localization(loc_dir: Path) -> dict:
    loc_file = loc_dir / "eras.json"
    if loc_file.exists():
        with open(loc_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def strip_rich_tags(text: str) -> str:
    text = re.sub(r"\[rainbow[^\]]*\]", "", text)
    text = re.sub(r"\[font_size=\d+\]", "", text)
    text = re.sub(r"\[/?(?:thinky_dots|i|font_size|rainbow)\]", "", text)
    return text


def resolve_unlock_info(text: str) -> str:
    """Resolve {IsRevealed:A|B} conditionals — use the second option (requirement text)."""
    text = re.sub(r"\{IsRevealed:([^|]*)\|([^}]*)\}", r"\2", text)
    return text


def extract_field(content: str, field: str) -> str | None:
    """Extract an override property value like: override string Id => "VALUE" """
    m = re.search(rf'override\s+\w+\s+{field}\s*=>\s*"?([^";]+)"?\s*;', content)
    if m:
        val = m.group(1).strip().strip('"')
        return val
    return None


def extract_era(content: str) -> str | None:
    """Extract era enum name from: override EpochEra Era => EpochEra.Prehistoria0"""
    m = re.search(r"override\s+EpochEra\s+Era\s*=>\s*EpochEra\.(\w+)", content)
    return m.group(1) if m else None


def extract_era_position(content: str) -> int | None:
    """Extract era position from: override int EraPosition => 0"""
    m = re.search(r"override\s+int\s+EraPosition\s*=>\s*(\d+)", content)
    return int(m.group(1)) if m else None


def extract_story_id(content: str) -> str | None:
    """Extract story ID from: override string StoryId => "Magnum_Opus" """
    m = re.search(r'override\s+string\s+StoryId\s*=>\s*"([^"]+)"', content)
    return m.group(1) if m else None


def extract_unlocks_cards(content: str) -> list[str]:
    """Extract card class names from ModelDb.Card<ClassName>() patterns."""
    return [
        class_name_to_id(m.group(1))
        for m in re.finditer(r"ModelDb\.Card<(\w+)>\(\)", content)
    ]


def extract_unlocks_relics(content: str) -> list[str]:
    """Extract relic class names from ModelDb.Relic<ClassName>() patterns."""
    return [
        class_name_to_id(m.group(1))
        for m in re.finditer(r"ModelDb\.Relic<(\w+)>\(\)", content)
    ]


def extract_unlocks_potions(content: str) -> list[str]:
    """Extract potion class names from ModelDb.Potion<ClassName>() patterns."""
    return [
        class_name_to_id(m.group(1))
        for m in re.finditer(r"ModelDb\.Potion<(\w+)>\(\)", content)
    ]


def extract_unlocks_events(content: str) -> list[str]:
    """Extract event class names from ModelDb.Event<ClassName>() patterns."""
    return [
        class_name_to_id(m.group(1))
        for m in re.finditer(r"ModelDb\.Event<(\w+)>\(\)", content)
    ]


def load_all_titles(loc_dir: Path) -> dict[str, str]:
    """Load title mappings from localization files for resolving unlock_text placeholders."""
    titles = {}
    for filename in ("cards.json", "relics.json", "potions.json", "events.json"):
        loc_file = loc_dir / filename
        if not loc_file.exists():
            continue
        with open(loc_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        for key, value in data.items():
            if key.endswith(".title"):
                entity_id = key[:-6]
                titles[entity_id] = value
    return titles


def resolve_unlock_text(text: str, content: str, title_map: dict[str, str]) -> str:
    """Resolve placeholders like {Event}, {Potion1}, {Card1}, {Relic1} in unlock_text."""
    # Extract model references for numbered vars
    potions = [
        class_name_to_id(m.group(1))
        for m in re.finditer(r"ModelDb\.Potion<(\w+)>\(\)", content)
    ]
    cards = [
        class_name_to_id(m.group(1))
        for m in re.finditer(r"ModelDb\.Card<(\w+)>\(\)", content)
    ]
    relics = [
        class_name_to_id(m.group(1))
        for m in re.finditer(r"ModelDb\.Relic<(\w+)>\(\)", content)
    ]
    events = [
        class_name_to_id(m.group(1))
        for m in re.finditer(r"ModelDb\.Event<(\w+)>\(\)", content)
    ]

    # Build replacement map
    replacements = {}
    for i, eid in enumerate(events):
        replacements[f"Event{i + 1}" if len(events) > 1 else "Event"] = title_map.get(
            eid, eid
        )
        replacements[f"Event{i + 1}"] = title_map.get(eid, eid)
    for i, pid in enumerate(potions):
        replacements[f"Potion{i + 1}"] = title_map.get(pid, pid)
    for i, cid in enumerate(cards):
        replacements[f"Card{i + 1}"] = title_map.get(cid, cid)
    for i, rid in enumerate(relics):
        replacements[f"Relic{i + 1}"] = title_map.get(rid, rid)

    # Replace {VarName} placeholders
    def replace_var(m):
        var_name = m.group(1)
        return replacements.get(var_name, m.group(0))

    return re.sub(r"\{(\w+)\}", replace_var, text)


def extract_timeline_expansion(content: str) -> list[str]:
    """Extract epoch IDs from GetTimelineExpansion() method."""
    # Find the GetTimelineExpansion method body
    m = re.search(r"GetTimelineExpansion\(\)\s*\{(.*?)\}", content, re.DOTALL)
    if not m:
        return []
    body = m.group(1)
    # Pattern: EpochModel.Get(EpochModel.GetId<XxxEpoch>())
    ids = []
    for match in re.finditer(r"EpochModel\.GetId<(\w+)>\(\)", body):
        ids.append(epoch_class_to_id(match.group(1)))
    return ids


def parse_single_epoch(
    filepath: Path, localization: dict, title_map: dict[str, str]
) -> dict | None:
    content = filepath.read_text(encoding="utf-8")

    epoch_id = extract_field(content, "Id")
    if not epoch_id:
        return None

    # Check localization — skip if title is "TODO"
    title = localization.get(f"{epoch_id}.title")
    if title == "TODO":
        return None

    era = extract_era(content)
    era_position = extract_era_position(content)
    story_id = extract_story_id(content)

    # Unlocks
    unlocks_cards = extract_unlocks_cards(content)
    unlocks_relics = extract_unlocks_relics(content)
    unlocks_potions = extract_unlocks_potions(content)

    # Timeline expansion
    expands_timeline = extract_timeline_expansion(content)

    # Localization fields
    description_raw = localization.get(f"{epoch_id}.description", "")
    description = strip_rich_tags(description_raw) if description_raw else None

    unlock_info_raw = localization.get(f"{epoch_id}.unlockInfo", "")
    unlock_info = (
        strip_rich_tags(resolve_unlock_info(unlock_info_raw))
        if unlock_info_raw
        else None
    )

    unlock_text_raw = localization.get(f"{epoch_id}.unlockText", "")
    unlock_text = (
        strip_rich_tags(resolve_unlock_text(unlock_text_raw, content, title_map))
        if unlock_text_raw
        else None
    )

    # Sort order
    era_value = ERA_VALUES.get(era, 0) if era else 0
    sort_order = era_value * 100 + (era_position if era_position is not None else 0)

    slug = (
        re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
        if title
        else epoch_id.lower()
    )

    result = {
        "id": epoch_id,
        "slug": slug,
        "title": title,
        "era": era,
        "era_name": None,
        "era_year": None,
        "era_position": era_position,
        "story_id": story_id,
        "sort_order": sort_order,
        "description": description,
        "unlock_info": unlock_info,
        "unlock_text": unlock_text,
        "unlocks_cards": unlocks_cards if unlocks_cards else [],
        "unlocks_relics": unlocks_relics if unlocks_relics else [],
        "unlocks_potions": unlocks_potions if unlocks_potions else [],
        "expands_timeline": expands_timeline if expands_timeline else [],
    }
    return result


def parse_all_epochs(loc_dir: Path) -> list[dict]:
    localization = load_localization(loc_dir)
    eras_loc = load_eras_localization(loc_dir)
    title_map = load_all_titles(loc_dir)
    epochs = []
    for filepath in sorted(EPOCHS_DIR.glob("*.cs")):
        epoch = parse_single_epoch(filepath, localization, title_map)
        if epoch and epoch["era"]:
            # Add era display name and year from eras localization
            era_key = epoch["era"].upper()
            era_name = eras_loc.get(f"{era_key}.name", "")
            era_year = eras_loc.get(f"{era_key}.year", "")
            epoch["era_name"] = era_name if era_name else None
            epoch["era_year"] = era_year if era_year else None
            epochs.append(epoch)
        elif epoch:
            epochs.append(epoch)
    epochs.sort(key=lambda e: e["sort_order"])
    return epochs


def extract_story_id_from_content(content: str) -> str | None:
    """Extract story ID from: override string Id => "IRONCLAD" or protected override string Id => ..."""
    m = re.search(r'override\s+string\s+Id\s*=>\s*"([^"]+)"', content)
    return m.group(1) if m else None


def extract_story_epochs(content: str) -> list[str]:
    """Extract ordered epoch IDs from the Epochs array property using EpochModel.Get<XxxEpoch>()."""
    ids = []
    # Find the Epochs property body
    m = re.search(
        r"override\s+EpochModel\[\]\s+Epochs\s*=>\s*new\s+EpochModel\[\d+\]\s*\{(.*?)\}",
        content,
        re.DOTALL,
    )
    if not m:
        return ids
    body = m.group(1)
    for match in re.finditer(r"EpochModel\.Get<(\w+)>\(\)", body):
        ids.append(epoch_class_to_id(match.group(1)))
    return ids


def parse_single_story(filepath: Path, localization: dict) -> dict | None:
    content = filepath.read_text(encoding="utf-8")

    story_id = extract_story_id_from_content(content)
    if not story_id:
        return None

    # Story name from localization: STORY_{ID}
    name = localization.get(f"STORY_{story_id}", story_id)

    # Ordered epoch list
    epochs = extract_story_epochs(content)

    return {
        "id": story_id,
        "name": name,
        "epochs": epochs,
    }


def parse_all_stories(loc_dir: Path) -> list[dict]:
    localization = load_localization(loc_dir)
    stories = []
    for filepath in sorted(STORIES_DIR.glob("*.cs")):
        story = parse_single_story(filepath, localization)
        if story:
            stories.append(story)
    return stories


def main(lang: str = "eng"):
    loc_dir = _loc_dir(lang)
    output_dir = _data_dir(lang)
    output_dir.mkdir(parents=True, exist_ok=True)

    epochs = parse_all_epochs(loc_dir)
    with open(output_dir / "epochs.json", "w", encoding="utf-8") as f:
        json.dump(epochs, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(epochs)} epochs -> data/{lang}/epochs.json")

    stories = parse_all_stories(loc_dir)
    with open(output_dir / "stories.json", "w", encoding="utf-8") as f:
        json.dump(stories, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(stories)} stories -> data/{lang}/stories.json")


if __name__ == "__main__":
    main()
