"""Parse event data from decompiled C# files and localization JSON."""
import json
import re
from pathlib import Path
from description_resolver import resolve_description, extract_vars_from_source

BASE = Path(__file__).resolve().parents[3]
DECOMPILED = BASE / "extraction" / "decompiled"
LOCALIZATION = BASE / "extraction" / "raw" / "localization" / "eng"
EVENTS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Events"
ACTS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Acts"
OUTPUT = BASE / "data"


def class_name_to_id(name: str) -> str:
    s = re.sub(r'(?<=[a-z0-9])(?=[A-Z])', '_', name)
    s = re.sub(r'(?<=[A-Z])(?=[A-Z][a-z])', '_', s)
    return s.upper()


def load_localization() -> dict:
    loc_file = LOCALIZATION / "events.json"
    if loc_file.exists():
        with open(loc_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def strip_rich_tags(text: str) -> str:
    """Strip game rich text tags like [gold], [sine], [jitter], [rainbow ...], [b], [i], etc."""
    # Handle tags with attributes like [rainbow freq=0.3 sat=0.8 val=1]
    text = re.sub(r'\[rainbow[^\]]*\]', '', text)
    text = re.sub(r'\[font_size=\d+\]', '', text)
    # Strip simple open/close tags
    text = re.sub(r'\[/?(?:gold|blue|red|purple|green|orange|pink|aqua|sine|jitter|b|i|font_size)\]', '', text)
    return text


def build_act_mapping() -> dict[str, str]:
    """Map event class names to act names."""
    event_to_act = {}
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
        # Regular events
        for m in re.finditer(r'ModelDb\.Event<(\w+)>\(\)', content):
            event_to_act[m.group(1)] = act_name
        # Ancient events
        for m in re.finditer(r'ModelDb\.AncientEvent<(\w+)>\(\)', content):
            event_to_act[m.group(1)] = act_name
    return event_to_act


def extract_event_vars(content: str) -> dict[str, int]:
    """Extract constant values and DynamicVar declarations from event source."""
    vars_dict = {}

    # const int fields: private const int _uncoverFutureCost = 50;
    for m in re.finditer(r'const\s+int\s+_?(\w+)\s*=\s*(\d+)', content):
        vars_dict[m.group(1)] = int(m.group(2))

    # DynamicVar declarations: new DynamicVar("Name", 50m)
    for m in re.finditer(r'new\s+DynamicVar\("(\w+)",\s*(\d+)m?\)', content):
        vars_dict[m.group(1)] = int(m.group(2))

    # Also get vars from standard extraction
    vars_dict.update(extract_vars_from_source(content))

    return vars_dict


def parse_options_from_localization(event_id: str, localization: dict, vars_dict: dict) -> list[dict]:
    """Extract event options (choices) from localization keys."""
    options = []
    # Pattern: EVENT_ID.pages.INITIAL.options.OPTION_NAME.title
    prefix = f"{event_id}.pages.INITIAL.options."
    option_keys = set()
    for key in localization:
        if key.startswith(prefix):
            rest = key[len(prefix):]
            option_name = rest.split(".")[0]
            option_keys.add(option_name)

    for opt_name in sorted(option_keys):
        title = localization.get(f"{prefix}{opt_name}.title", opt_name)
        desc_raw = localization.get(f"{prefix}{opt_name}.description", "")
        desc_resolved = resolve_description(desc_raw, vars_dict) if desc_raw else ""
        desc_clean = strip_rich_tags(desc_resolved)
        # Keep [gold]...[/gold] for frontend rendering
        desc_clean = re.sub(r'\[/?(?:blue|red|purple|green|orange|pink|aqua)\]', '', desc_clean)
        options.append({
            "id": opt_name,
            "title": title,
            "description": desc_clean,
        })

    return options


def is_ancient_event(content: str) -> bool:
    """Check if the event extends AncientEventModel."""
    return "AncientEventModel" in content


def parse_single_event(filepath: Path, localization: dict, act_mapping: dict) -> dict | None:
    content = filepath.read_text(encoding="utf-8")
    class_name = filepath.stem

    if class_name.startswith("Deprecated"):
        return None

    event_id = class_name_to_id(class_name)

    # Check if this is an ancient event
    is_ancient = is_ancient_event(content)

    # Localization
    title = localization.get(f"{event_id}.title", class_name)

    # Description (initial page)
    desc_raw = localization.get(f"{event_id}.pages.INITIAL.description", "")
    vars_dict = extract_event_vars(content)
    desc_resolved = resolve_description(desc_raw, vars_dict) if desc_raw else ""
    desc_clean = strip_rich_tags(desc_resolved)
    desc_clean = re.sub(r'\[/?(?:blue|red|purple|green|orange|pink|aqua)\]', '', desc_clean)

    # Options (choices)
    options = parse_options_from_localization(event_id, localization, vars_dict)

    # Act mapping
    act = act_mapping.get(class_name)

    # Type
    event_type = "Ancient" if is_ancient else "Event"

    # For shared events that appear in multiple acts
    if not act and not is_ancient:
        # Check if it's referenced across multiple acts via encounter system
        event_type = "Shared"

    return {
        "id": event_id,
        "name": title,
        "type": event_type,
        "act": act,
        "description": desc_clean if desc_clean else None,
        "options": options if options else None,
    }


def parse_all_events() -> list[dict]:
    localization = load_localization()
    act_mapping = build_act_mapping()
    events = []
    for filepath in sorted(EVENTS_DIR.glob("*.cs")):
        event = parse_single_event(filepath, localization, act_mapping)
        if event:
            events.append(event)
    return events


def main():
    OUTPUT.mkdir(exist_ok=True)
    events = parse_all_events()
    with open(OUTPUT / "events.json", "w", encoding="utf-8") as f:
        json.dump(events, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(events)} events -> data/events.json")


if __name__ == "__main__":
    main()
