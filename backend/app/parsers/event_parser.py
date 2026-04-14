"""Parse event data from decompiled C# files and localization JSON."""

import json
import re
from pathlib import Path
from description_resolver import resolve_description, extract_vars_from_source

from parser_paths import BASE, DECOMPILED, loc_dir as _loc_dir, data_dir as _data_dir

EVENTS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Events"
ACTS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Acts"
IMAGES_DIR = BASE / "backend" / "static" / "images" / "misc" / "ancients"


def class_name_to_id(name: str) -> str:
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name)
    s = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", "_", s)
    return s.upper()


def load_localization(loc_dir: Path) -> dict:
    loc = {}
    for filename in ("events.json", "ancients.json"):
        loc_file = loc_dir / filename
        if loc_file.exists():
            with open(loc_file, "r", encoding="utf-8") as f:
                loc.update(json.load(f))
    return loc


def strip_rich_tags(text: str) -> str:
    """Strip non-renderable rich text tags, preserving colors and effects for frontend."""
    # Strip tags with attributes like [rainbow freq=0.3 sat=0.8 val=1]
    text = re.sub(r"\[rainbow[^\]]*\]", "", text)
    text = re.sub(r"\[font_size=\d+\]", "", text)
    # Strip only non-renderable tags — keep colors (gold, blue, red, green, purple, orange, pink, aqua)
    # and effects (sine, jitter, b) for frontend rendering
    text = re.sub(r"\[/?(?:thinky_dots|i|font_size|rainbow)\]", "", text)
    return text


def build_act_mapping() -> dict[str, str]:
    """Map event class names to act names.

    Events appearing in multiple act files get a combined label (e.g. "Act 1 / Underdocks").
    """
    event_to_acts: dict[str, list[str]] = {}
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
        for m in re.finditer(r"ModelDb\.Event<(\w+)>\(\)", content):
            event_to_acts.setdefault(m.group(1), [])
            if act_name not in event_to_acts[m.group(1)]:
                event_to_acts[m.group(1)].append(act_name)
        # Ancient events
        for m in re.finditer(r"ModelDb\.AncientEvent<(\w+)>\(\)", content):
            event_to_acts.setdefault(m.group(1), [])
            if act_name not in event_to_acts[m.group(1)]:
                event_to_acts[m.group(1)].append(act_name)
    # Combine multi-act entries into a single string
    return {k: " / ".join(v) for k, v in event_to_acts.items()}


def load_all_titles(loc_dir: Path) -> dict[str, str]:
    """Load title mappings from all localization files for resolving StringVar model references."""
    titles = {}
    loc_files = [
        "cards.json",
        "relics.json",
        "potions.json",
        "enchantments.json",
        "powers.json",
    ]
    for filename in loc_files:
        loc_file = loc_dir / filename
        if not loc_file.exists():
            continue
        with open(loc_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        for key, value in data.items():
            if key.endswith(".title"):
                entity_id = key[:-6]  # Strip ".title"
                titles[entity_id] = value
    return titles


def extract_event_vars(
    content: str, title_map: dict[str, str], relic_descs: dict[str, str]
) -> dict[str, int | str]:
    """Extract constant values, DynamicVar, and StringVar declarations from event source."""
    vars_dict: dict[str, int | str] = {}

    # const int fields: private const int _uncoverFutureCost = 50;
    for m in re.finditer(r"const\s+int\s+_?(\w+)\s*=\s*(\d+)", content):
        vars_dict[m.group(1)] = int(m.group(2))

    # DynamicVar declarations: new DynamicVar("Name", 50m)
    for m in re.finditer(r'new\s+DynamicVar\("(\w+)",\s*(\d+)m?\)', content):
        vars_dict[m.group(1)] = int(m.group(2))

    # Typed vars with named keys: new GoldVar("Prize1", 35), new HpLossVar("Name", 11m)
    for m in re.finditer(
        r'new\s+\w+Var\(\s*"(\w+)"\s*,\s*(\d+)m?\s*(?:,\s*[^)]+)?\)', content
    ):
        vars_dict[m.group(1)] = int(m.group(2))

    # Unnamed typed vars: new GoldVar(60m), new HealVar(10m), new MaxHpVar(2m), new DamageVar(3m, ...)
    for m in re.finditer(r"new\s+(\w+)Var\((\d+)m?\s*(?:,\s*[^)]+)?\)", content):
        var_type = m.group(1)  # Gold, Heal, MaxHp, Damage, HpLoss, etc.
        var_val = int(m.group(2))
        if var_type not in vars_dict:
            vars_dict[var_type] = var_val

    # Typed vars with array references: new GoldVar(_prizeKeys[N], _prizeCosts[N])
    # First extract the arrays, then resolve the references
    arrays: dict[str, list] = {}
    for m in re.finditer(
        r"(?:static|readonly)\s+(?:.*?)(?:string|int|decimal)\[\]\s+(_\w+)\s*=\s*(?:new\s+\w+\[\d*\]\s*\{|new\s*\[\]\s*\{|\{)\s*([^}]+)\}",
        content,
    ):
        arr_name = m.group(1)
        raw_vals = m.group(2)
        if '"' in raw_vals:
            arrays[arr_name] = [v.strip().strip('"') for v in raw_vals.split(",")]
        else:
            arrays[arr_name] = [
                int(v.strip().rstrip("m"))
                for v in raw_vals.split(",")
                if v.strip().rstrip("m").isdigit()
            ]

    # Resolve array-indexed var declarations: new XxxVar(keysArr[i], valsArr[i])
    for m in re.finditer(
        r"new\s+\w+Var\((_\w+)\[(\d+)\]\s*,\s*(_\w+)\[(\d+)\]\)", content
    ):
        key_arr, key_idx, val_arr, val_idx = (
            m.group(1),
            int(m.group(2)),
            m.group(3),
            int(m.group(4)),
        )
        keys = arrays.get(key_arr, [])
        vals = arrays.get(val_arr, [])
        if key_idx < len(keys) and val_idx < len(vals):
            vars_dict[keys[key_idx]] = vals[val_idx]

    # CalculateVars: extract range patterns like Rng.NextInt(min, max)
    calc_match = re.search(r"CalculateVars\(\)\s*\{(.*?)\n\s*\}", content, re.DOTALL)
    if calc_match:
        calc_body = calc_match.group(1)
        # Helper regex fragment: matches DynamicVars.Foo or DynamicVars["Foo"]
        _dv = r'(?:base\.)?DynamicVars(?:\["(\w+)"\]|\.(\w+))'

        # Direct assignment: DynamicVars.Gold.BaseValue = Rng.NextInt(41, 69)
        for rm in re.finditer(
            _dv + r"\.BaseValue\s*=\s*(?:base\.)?Rng\.NextInt\((-?\d+),\s*(-?\d+)\)",
            calc_body,
        ):
            var_name = rm.group(1) or rm.group(2)
            low, high = (
                int(rm.group(3)),
                int(rm.group(4)) - 1,
            )  # NextInt upper is exclusive
            vars_dict[var_name] = f"{low}-{high}"
        # += with NextInt(min, max): BaseValue += (decimal)Rng.NextInt(min, max)
        for rm in re.finditer(
            _dv
            + r"\.BaseValue\s*\+=\s*\(decimal\)\s*(?:base\.)?Rng\.NextInt\((-?\d+),\s*(-?\d+)\)",
            calc_body,
        ):
            var_name = rm.group(1) or rm.group(2)
            base = vars_dict.get(var_name, 0)
            if isinstance(base, (int, float)):
                low, high = int(rm.group(3)), int(rm.group(4)) - 1
                vars_dict[var_name] = f"{int(base + low)}-{int(base + high)}"
        # += with NextInt(max) - offset: BaseValue += (decimal)(Rng.NextInt(range) - offset)
        for rm in re.finditer(
            _dv
            + r"\.BaseValue\s*\+=\s*\(decimal\)\s*\(\s*(?:base\.)?Rng\.NextInt\((\d+)\)\s*-\s*(\d+)\s*\)",
            calc_body,
        ):
            var_name = rm.group(1) or rm.group(2)
            base = vars_dict.get(var_name, 0)
            if isinstance(base, (int, float)):
                rng_max, offset = int(rm.group(3)), int(rm.group(4))
                vars_dict[var_name] = (
                    f"{int(base - offset)}-{int(base + rng_max - offset - 1)}"
                )
        # += with NextFloat: BaseValue += (decimal)Rng.NextFloat(-N, N)
        for rm in re.finditer(
            _dv
            + r"\.BaseValue\s*\+=\s*\(decimal\)\s*(?:base\.)?Rng\.NextFloat\((-?[\d.]+)f?,\s*(-?[\d.]+)f?\)",
            calc_body,
        ):
            var_name = rm.group(1) or rm.group(2)
            base = vars_dict.get(var_name, 0)
            if isinstance(base, (int, float)):
                low, high = float(rm.group(3)), float(rm.group(4))
                vars_dict[var_name] = f"{int(base + low)}-{int(base + high)}"
        # -= with NextInt: BaseValue -= (decimal)Rng.NextInt(min, max)
        for rm in re.finditer(
            _dv
            + r"\.BaseValue\s*-=\s*\(decimal\)\s*(?:base\.)?Rng\.NextInt\((-?\d+),\s*(-?\d+)\)",
            calc_body,
        ):
            var_name = rm.group(1) or rm.group(2)
            base = vars_dict.get(var_name, 0)
            if isinstance(base, (int, float)):
                low, high = int(rm.group(3)), int(rm.group(4)) - 1
                vars_dict[var_name] = f"{int(base - high)}-{int(base - low)}"
        # Percentage of max HP: DynamicVars.Heal.BaseValue = ... MaxHp * 0.33m
        for rm in re.finditer(
            r"DynamicVars\.(\w+)\.BaseValue\s*=.*?MaxHp\s*\*\s*(\d+(?:\.\d+)?)m",
            calc_body,
        ):
            var_name = rm.group(1)
            pct = float(rm.group(2))
            vars_dict[var_name] = f"{int(pct * 100)}% Max"
        # Heal to full: MaxHp - CurrentHp
        if re.search(r"Heal\.BaseValue\s*=.*MaxHp\s*-.*CurrentHp", calc_body):
            vars_dict["Heal"] = "Full"

    # Also check for HealRestSiteOption.GetHealAmount pattern (30% Max HP)
    if "HealRestSiteOption.GetHealAmount" in content:
        if "Heal" not in vars_dict or vars_dict.get("Heal") == 0:
            vars_dict["Heal"] = "30% Max"

    # Slippery Bridge pattern: CurrentHpLoss => N + NumberOfHoldOns
    for rm in re.finditer(r"Current(\w+)\s*=>\s*(\d+)\s*\+\s*(\w+)", content):
        var_name = rm.group(1)
        base_val = int(rm.group(2))
        if var_name not in vars_dict or vars_dict.get(var_name) == 0:
            vars_dict[var_name] = f"{base_val}+"

    # Trial: EntrantNumber placeholder — replace -1 with empty (cosmetic flavor)
    if vars_dict.get("EntrantNumber") == -1:
        vars_dict["EntrantNumber"] = "???"

    # StringVar with DynamicDescription from relics:
    # e.g. new StringVar("BoneTeaDescription", ModelDb.Relic<BoneTea>().DynamicDescription.GetFormattedText())
    for m in re.finditer(
        r'new\s+StringVar\("(\w+)",\s*ModelDb\.Relic<([^>]+)>\(\)\.DynamicDescription\.GetFormattedText\(\)\)',
        content,
    ):
        var_name = m.group(1)
        class_name = m.group(2)
        if "." in class_name:
            class_name = class_name.rsplit(".", 1)[1]
        entity_id = class_name_to_id(class_name)
        desc = relic_descs.get(entity_id)
        if desc:
            vars_dict[var_name] = desc

    # StringVar with model references:
    for m in re.finditer(
        r'new\s+StringVar\("(\w+)",\s*ModelDb\.(?:Card|Enchantment|Relic|Potion)<([^>]+)>\(\)\.Title(?:\.GetFormattedText\(\))?\)',
        content,
    ):
        var_name = m.group(1)
        class_name = m.group(2)
        if "." in class_name:
            class_name = class_name.rsplit(".", 1)[1]
        entity_id = class_name_to_id(class_name)
        title = title_map.get(entity_id, class_name)
        vars_dict[var_name] = title

    # StringVar with literal string: new StringVar("Name", "Value")
    for m in re.finditer(r'new\s+StringVar\("(\w+)",\s*"([^"]+)"\)', content):
        vars_dict[m.group(1)] = m.group(2)

    # Empty StringVar (runtime-populated): new StringVar("RandomRelic")
    # The closing ) is already matched, so no lookahead needed — the two-arg form
    # new StringVar("Name", value) won't match because "Name") requires ) right after "
    for m in re.finditer(r'new\s+StringVar\("(\w+)"\)', content):
        name = m.group(1)
        if name not in vars_dict:
            # Generate descriptive placeholders based on var name
            if "relic" in name.lower():
                if "owned" in name.lower():
                    vars_dict[name] = "one of your Relics"
                else:
                    vars_dict[name] = "a random Relic"
            elif "card" in name.lower():
                vars_dict[name] = "a random Card"
            elif "potion" in name.lower():
                vars_dict[name] = "a random Potion"
            else:
                readable = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", name)
                readable = re.sub(r"\d+", "", readable).strip()
                vars_dict[name] = readable

    # Dynamically-added vars via LocString.Add("VarName", value) — runtime-populated
    # These appear in GenerateInitialOptions/GameInfoOptions for events like TheFutureOfPotions
    # Only set values for vars we can provide meaningful placeholders for;
    # leave others unset so description_resolver produces [VarName] placeholders
    # (rendered as styled italic text by the frontend)
    for m in re.finditer(r'\.Add\(\s*"(\w+)"\s*,', content):
        name = m.group(1)
        if name not in vars_dict:
            nl = name.lower()
            if nl == "potion":
                vars_dict[name] = "a Potion"
            elif "relic" in nl:
                vars_dict[name] = "a random Relic"
            elif "card" in nl:
                vars_dict[name] = "a random Card"
            elif "potion" in nl:
                vars_dict[name] = "a random Potion"
            elif nl == "rarity":
                vars_dict[name] = "Common"
            elif nl == "type":
                vars_dict[name] = "Skill"

    # RelicOption patterns: RelicOption<ClassName>() — extract relic names for options
    for m in re.finditer(r"RelicOption<(\w+)>", content):
        relic_class = m.group(1)
        entity_id = class_name_to_id(relic_class)
        title = title_map.get(entity_id)
        if title:
            vars_dict[relic_class] = title

    # Also get vars from standard extraction
    standard_vars = extract_vars_from_source(content)
    for k, v in standard_vars.items():
        if k not in vars_dict:
            vars_dict[k] = v

    return vars_dict


def load_relic_descriptions(data_dir: Path) -> dict[str, str]:
    """Load relic descriptions for enriching RelicOption events."""
    relic_file = data_dir / "relics.json"
    if relic_file.exists():
        with open(relic_file, "r", encoding="utf-8") as f:
            relics = json.load(f)
        return {r["id"]: r["description"] for r in relics}
    return {}


def extract_option_order(content: str, event_id: str) -> dict[str, list[str]]:
    """Extract option order from C# source by finding localization keys in declaration order.

    Returns a dict of page_name -> [ordered option IDs].
    """
    order: dict[str, list[str]] = {}
    # Match localization keys like "EVENT_ID.pages.PAGE.options.OPTION_NAME"
    pattern = re.escape(event_id) + r"\.pages\.(\w+)\.options\.(\w+)"
    seen: dict[str, set[str]] = {}
    for m in re.finditer(pattern, content):
        page, opt = m.group(1), m.group(2)
        if page not in order:
            order[page] = []
            seen[page] = set()
        if opt not in seen[page]:
            seen[page].add(opt)
            order[page].append(opt)
    return order


def parse_options_from_localization(
    event_id: str,
    localization: dict,
    vars_dict: dict,
    relic_descs: dict[str, str],
    source_order: dict[str, list[str]] | None = None,
) -> list[dict]:
    """Extract event options (choices) from localization keys for INITIAL page."""
    return parse_page_options(
        event_id, "INITIAL", localization, vars_dict, relic_descs, source_order
    )


def parse_page_options(
    event_id: str,
    page_name: str,
    localization: dict,
    vars_dict: dict,
    relic_descs: dict[str, str],
    source_order: dict[str, list[str]] | None = None,
) -> list[dict]:
    """Extract options for a specific page."""
    options = []
    prefix = f"{event_id}.pages.{page_name}.options."
    option_keys = set()
    for key in localization:
        if key.startswith(prefix):
            rest = key[len(prefix) :]
            option_name = rest.split(".")[0]
            option_keys.add(option_name)

    # Use C# source order if available, fall back to alphabetical
    if source_order and page_name in source_order:
        ordered = [o for o in source_order[page_name] if o in option_keys]
        # Append any keys from localization not found in source (shouldn't happen, but safe)
        ordered += sorted(option_keys - set(ordered))
    else:
        ordered = sorted(option_keys)

    for opt_name in ordered:
        title_raw = localization.get(f"{prefix}{opt_name}.title", opt_name)
        title = strip_rich_tags(resolve_description(title_raw, vars_dict))
        desc_raw = localization.get(f"{prefix}{opt_name}.description", "")
        desc_resolved = resolve_description(desc_raw, vars_dict) if desc_raw else ""
        desc_clean = strip_rich_tags(desc_resolved)
        # If description is empty and option matches a relic ID, use relic description
        if not desc_clean:
            relic_desc = relic_descs.get(opt_name)
            if relic_desc:
                desc_clean = f"Obtain [gold]{title}[/gold]. {relic_desc}"
        options.append(
            {
                "id": opt_name,
                "title": title,
                "description": desc_clean,
            }
        )

    return options


def parse_all_pages(
    event_id: str,
    localization: dict,
    vars_dict: dict,
    relic_descs: dict[str, str],
    source_order: dict[str, list[str]] | None = None,
) -> list[dict] | None:
    """Extract all pages for an event, building the full decision tree."""
    # Discover all page names
    page_prefix = f"{event_id}.pages."
    page_names = set()
    for key in localization:
        if key.startswith(page_prefix):
            rest = key[len(page_prefix) :]
            page_name = rest.split(".")[0]
            page_names.add(page_name)

    if len(page_names) <= 1:
        return None  # Only INITIAL page, no multi-page flow

    pages = []
    for page_name in sorted(page_names):
        desc_raw = localization.get(f"{page_prefix}{page_name}.description", "")
        desc_resolved = resolve_description(desc_raw, vars_dict) if desc_raw else ""
        desc_clean = strip_rich_tags(desc_resolved)

        options = parse_page_options(
            event_id, page_name, localization, vars_dict, relic_descs, source_order
        )

        page = {
            "id": page_name,
            "description": desc_clean if desc_clean else None,
        }
        if options:
            page["options"] = options

        pages.append(page)

    return pages if len(pages) > 1 else None


def is_ancient_event(content: str) -> bool:
    """Check if the event extends AncientEventModel or uses ancients loc table."""
    return "AncientEventModel" in content or 'LocTable => "ancients"' in content


def extract_preconditions(content: str, vars_dict: dict) -> list[str] | None:
    """Extract event preconditions from IsAllowed() method in C# source.

    Returns a list of human-readable condition strings, or None if no conditions.
    """
    # Find IsAllowed override
    m = re.search(r"override\s+bool\s+IsAllowed\s*\(\s*RunState\s+\w+\s*\)", content)
    if not m:
        return None
    # Extract method body
    start = content.find("{", m.end())
    if start == -1:
        return None
    depth = 1
    i = start + 1
    while i < len(content) and depth > 0:
        if content[i] == "{":
            depth += 1
        elif content[i] == "}":
            depth -= 1
        i += 1
    body = content[start + 1 : i - 1]

    # If body is just "return true;" there are no conditions
    if re.match(r"\s*return\s+true\s*;\s*$", body):
        return None

    conditions: list[str] = []

    # Detect negated patterns: "if (condition) { return false; }" or "if (condition) return false;"
    # These invert the meaning — e.g., "if (ActIndex == 0) return false" means "NOT Act 1"
    negated_body = ""
    for nm in re.finditer(
        r"if\s*\(([^{]+?)\)\s*(?:\{[^}]*return\s+false\s*;[^}]*\}|return\s+false\s*;)",
        body,
        re.DOTALL,
    ):
        negated_body += nm.group(1) + "\n"

    # The positive body is the return statement (non-negated conditions)
    positive_body = body

    # --- Gold conditions (from positive/return context) ---
    # Match p.Gold >= N (literal), including (decimal) cast
    gold_seen = set()
    for gm in re.finditer(
        r"(?:\(decimal\)\s*)?p(?:layer)?\.Gold\s*>=\s*(\d+)", positive_body
    ):
        val = gm.group(1)
        if val not in gold_seen:
            gold_seen.add(val)
            conditions.append(f"Requires {val}+ gold")
    # DynamicVars reference for gold: p.Gold >= DynamicVars["X"].BaseValue
    for gm in re.finditer(
        r'(?:\(decimal\)\s*)?p(?:layer)?\.Gold\s*>=\s*(?:base\.)?DynamicVars(?:\["(\w+)"\]|\.(\w+))\.(?:BaseValue|IntValue)',
        positive_body,
    ):
        var_name = gm.group(1) or gm.group(2)
        if var_name not in gold_seen:
            gold_seen.add(var_name)
            val = vars_dict.get(var_name)
            if val is not None:
                # If val is a range like "100-149", show as "100-149 gold"
                val_str = str(val)
                if "-" in val_str and not val_str.startswith("-"):
                    conditions.append(f"Requires {val_str} gold")
                else:
                    conditions.append(f"Requires {val}+ gold")
            else:
                conditions.append(f"Requires enough gold ({var_name})")

    # --- HP conditions ---
    for hm in re.finditer(r"p\.Creature\.CurrentHp\s*>=\s*(\d+)", positive_body):
        conditions.append(f"Requires {hm.group(1)}+ HP")
    for hm in re.finditer(
        r"p\.Creature\.CurrentHp\s*<=.*?MaxHp\s*\*\s*([\d.]+)m?", positive_body
    ):
        pct = int(float(hm.group(1)) * 100)
        conditions.append(f"Requires ≤{pct}% HP")

    # --- Act conditions ---
    # Negated: "if (ActIndex == 0) return false" → Act 2+
    for am in re.finditer(r"CurrentActIndex\s*==\s*(\d+)", negated_body):
        act_num = int(am.group(1))
        conditions.append(f"Act {act_num + 2}+")
    # Negated: "if (ActIndex < 1) return false" → Act 2+
    for am in re.finditer(r"CurrentActIndex\s*<\s*(\d+)", negated_body):
        act_num = int(am.group(1))
        conditions.append(f"Act {act_num + 1}+")
    # Positive: "return ActIndex == 1" → Act 2 only
    for am in re.finditer(r"CurrentActIndex\s*==\s*(\d+)", positive_body):
        # Skip if also in negated body
        act_num = int(am.group(1))
        if f"CurrentActIndex == {act_num}" not in negated_body:
            conditions.append(f"Act {act_num + 1} only")
    # Positive: "return ActIndex > 0" → Act 2+
    for am in re.finditer(r"CurrentActIndex\s*>\s*(\d+)", positive_body):
        act_num = int(am.group(1))
        conditions.append(f"Act {act_num + 2}+")
    # Positive: "return ActIndex < 2" → Act 1-2 only
    for am in re.finditer(r"CurrentActIndex\s*<\s*(\d+)", positive_body):
        if f"CurrentActIndex < {am.group(1)}" not in negated_body:
            act_num = int(am.group(1))
            conditions.append(f"Act 1–{act_num} only")

    # --- Floor conditions ---
    for fm in re.finditer(r"TotalFloor\s*>\s*(\d+)", body):
        conditions.append(f"Floor {int(fm.group(1)) + 1}+")

    # --- Deck conditions ---
    if re.search(r"CardTag\.Strike.*>=\s*(\d+)", body):
        count = re.search(r"CardTag\.Strike.*>=\s*(\d+)", body).group(1)
        conditions.append(f"Requires {count}+ Strikes in deck")
    if re.search(r"CardTag\.Defend.*>=\s*(\d+)", body):
        count = re.search(r"CardTag\.Defend.*>=\s*(\d+)", body).group(1)
        conditions.append(f"Requires {count}+ Defends in deck")
    if re.search(r"Rarity\s*==\s*CardRarity\.Basic.*?IsRemovable", body):
        conditions.append("Requires a removable basic card")
    elif re.search(r"IsRemovable", body) and not re.search(r"CardTag", body):
        conditions.append("Requires removable cards in deck")

    # --- Relic conditions ---
    for rm in re.finditer(r"GetValidRelics.*?Count\(\)\s*>=\s*(\d+)", body):
        conditions.append(f"Requires {rm.group(1)}+ tradeable relics")
    if "HasEventPet" in body:
        conditions.append("Cannot have an event pet")

    # --- Potion conditions ---
    if re.search(r"player\.Potions\.Any\(\)", body) or re.search(
        r"p\.Potions\.Any\(\)", body
    ):
        conditions.append("Requires at least one potion")
    if "HasOpenPotionSlots" in body:
        conditions.append("Requires an empty potion slot")

    # --- Player count ---
    if re.search(r"Players\.Count\s*>\s*1.*?return\s+false", body, re.DOTALL):
        conditions.append("Single player only")

    # --- FoulPotion ---
    if "FoulPotion" in body:
        conditions.append("Requires 100+ gold or a Foul Potion")
        # Remove the simpler gold condition if we have the compound one
        conditions = [c for c in conditions if c != "Requires 100+ gold"]

    return conditions if conditions else None


CHARACTERS = ["IRONCLAD", "SILENT", "DEFECT", "NECROBINDER", "REGENT"]


def parse_ancient_dialogue(event_id: str, localization: dict) -> dict[str, list[dict]]:
    """Extract dialogue lines for an Ancient event, grouped by character."""
    dialogue: dict[str, list[dict]] = {}

    # Collect all talk keys for this event
    prefix = f"{event_id}.talk."
    for key, value in localization.items():
        if not key.startswith(prefix):
            continue
        rest = key[len(prefix) :]
        # Pattern: CHARACTER.VISIT-LINE.type (e.g. IRONCLAD.0-0.ancient, IRONCLAD.0-1.char)
        parts = rest.split(".")
        if len(parts) < 3:
            continue
        speaker_group = parts[0]  # Character name, "ANY", or "firstVisitEver"
        visit_line = parts[1]  # e.g. "0-0", "0-0r", "1-0r"
        line_type = parts[2]  # "ancient", "char", "next"

        if line_type == "next":
            continue  # Skip button labels

        # Map speaker groups to display names
        if speaker_group == "firstVisitEver":
            group_key = "First Visit"
        elif speaker_group == "ANY":
            group_key = "Returning"
        else:
            group_key = speaker_group.replace("_", " ").title()

        if group_key not in dialogue:
            dialogue[group_key] = []

        cleaned = strip_rich_tags(value)
        speaker = "ancient" if line_type == "ancient" else "character"
        dialogue[group_key].append(
            {
                "order": visit_line,
                "speaker": speaker,
                "text": cleaned,
            }
        )

    # Sort each group's lines by order
    for group in dialogue:
        dialogue[group].sort(key=lambda x: x["order"])

    return dialogue


def extract_ancient_relics(content: str) -> list[str]:
    """Extract relic class names offered by an Ancient from C# source."""
    relic_ids = []
    seen = set()
    # Pattern: RelicOption<ClassName>() or ModelDb.Relic<ClassName>()
    for m in re.finditer(r"(?:RelicOption|ModelDb\.Relic)<(\w+)>", content):
        name = m.group(1)
        relic_id = class_name_to_id(name)
        if relic_id not in seen:
            seen.add(relic_id)
            relic_ids.append(relic_id)
    return relic_ids


def parse_single_event(
    filepath: Path,
    localization: dict,
    act_mapping: dict,
    title_map: dict[str, str],
    relic_descs: dict[str, str],
) -> dict | None:
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
    vars_dict = extract_event_vars(content, title_map, relic_descs)
    desc_resolved = resolve_description(desc_raw, vars_dict) if desc_raw else ""
    desc_clean = strip_rich_tags(desc_resolved)

    # Extract option order from C# source
    source_order = extract_option_order(content, event_id)

    # Options (choices) — skip for Ancient events, their offerings are in the relics list
    options = (
        []
        if is_ancient
        else parse_options_from_localization(
            event_id, localization, vars_dict, relic_descs, source_order
        )
    )

    # Act mapping
    act = act_mapping.get(class_name)

    # Type
    event_type = "Ancient" if is_ancient else "Event"

    # For shared events that appear in multiple acts
    if not act and not is_ancient:
        # Check if it's referenced across multiple acts via encounter system
        event_type = "Shared"

    # Parse all pages (multi-page events)
    pages = parse_all_pages(
        event_id, localization, vars_dict, relic_descs, source_order
    )

    # Event preconditions (IsAllowed)
    preconditions = extract_preconditions(content, vars_dict)

    result = {
        "id": event_id,
        "name": title,
        "type": event_type,
        "act": act,
        "description": desc_clean if desc_clean else None,
        "preconditions": preconditions,
        "options": options if options else None,
        "pages": pages,
    }

    # Enrich Ancient events with epithet, dialogue, image, and relics
    if is_ancient:
        epithet = localization.get(f"{event_id}.epithet", "")
        if epithet:
            result["epithet"] = epithet
        dialogue = parse_ancient_dialogue(event_id, localization)
        if dialogue:
            result["dialogue"] = dialogue

        # Image URL — check ancients dir first, then monsters
        img_name = event_id.lower()
        image_file = IMAGES_DIR / f"{img_name}.webp"
        if not image_file.exists():
            image_file = IMAGES_DIR / f"{img_name}.png"
        if image_file.exists():
            result["image_url"] = f"/static/images/misc/ancients/{image_file.name}"
        else:
            # Fall back to monster sprite (e.g. The Architect)
            monster_name = img_name.replace("the_", "")
            monster_dir = BASE / "backend" / "static" / "images" / "monsters"
            monster_file = monster_dir / f"{monster_name}.webp"
            if not monster_file.exists():
                monster_file = monster_dir / f"{monster_name}.png"
            if monster_file.exists():
                result["image_url"] = f"/static/images/monsters/{monster_file.name}"

        # Relic offerings
        relics = extract_ancient_relics(content)
        if relics:
            result["relics"] = relics

        # Use first-visit dialogue as description if none exists
        if not result["description"]:
            first_visit = localization.get(
                f"{event_id}.talk.firstVisitEver.0-0.ancient", ""
            )
            if first_visit:
                result["description"] = strip_rich_tags(first_visit)
            else:
                # Try character-specific first dialogue (e.g. The Architect)
                for char in CHARACTERS:
                    line = (
                        localization.get(f"{event_id}.talk.{char}.0-0.ancient")
                        or localization.get(f"{event_id}.talk.{char}.0-0r.ancient")
                        or localization.get(f"{event_id}.talk.{char}.0-0.char")
                    )
                    if line:
                        result["description"] = strip_rich_tags(line)
                        break

    return result


def _fix_battleworn_dummy(event: dict, localization: dict) -> dict:
    """Fix Battleworn Dummy — resolve Setting HP values from BattleFriend monster models."""
    if event["id"] != "BATTLEWORN_DUMMY":
        return event
    # HP values from BattleFriendV1/V2/V3.MinInitialHp (single-player base values)
    hp_vars = {"Setting1Hp": 75, "Setting2Hp": 150, "Setting3Hp": 300}

    def resolve_opt(page_id: str, opt_id: str) -> str | None:
        key = f"BATTLEWORN_DUMMY.pages.{page_id}.options.{opt_id}.description"
        template = localization.get(key, "")
        if not template:
            return None
        return strip_rich_tags(resolve_description(template, hp_vars))

    for opt in event.get("options") or []:
        desc = resolve_opt("INITIAL", opt["id"])
        if desc:
            opt["description"] = desc
    for page in event.get("pages") or []:
        for opt in page.get("options") or []:
            desc = resolve_opt(page.get("id", ""), opt["id"])
            if desc:
                opt["description"] = desc
    return event


def _fix_spiraling_whirlpool(event: dict) -> dict:
    """Remove ghost REACH_IN option — removed from C# but still in localization."""
    if event["id"] != "SPIRALING_WHIRLPOOL":
        return event
    valid_options = {"OBSERVE", "DRINK"}
    if event.get("options"):
        event["options"] = [o for o in event["options"] if o["id"] in valid_options]
    for page in event.get("pages") or []:
        if page.get("options"):
            page["options"] = [o for o in page["options"] if o["id"] in valid_options]
    # Remove the REACH_IN result page
    if event.get("pages"):
        event["pages"] = [p for p in event["pages"] if p["id"] != "REACH_IN"]
        if len(event["pages"]) <= 1:
            event["pages"] = None
    return event


def _fix_colorful_philosophers(event: dict) -> dict:
    """Remove ghost EQUALITY option — removed from C# but still in localization."""
    if event["id"] != "COLORFUL_PHILOSOPHERS":
        return event
    if event.get("options"):
        event["options"] = [o for o in event["options"] if o["id"] != "EQUALITY"]
    for page in event.get("pages") or []:
        if page.get("options"):
            page["options"] = [o for o in page["options"] if o["id"] != "EQUALITY"]
    return event


def _fix_slippery_bridge(event: dict, localization: dict) -> dict:
    """Fix Slippery Bridge — HP loss starts at 3 and increases by 1 per Hold On."""
    if event["id"] != "SLIPPERY_BRIDGE":
        return event
    # Damage = 3 + NumberOfHoldOns. The option on each page shows the NEXT step's damage.
    # INITIAL → HOLD_ON_0 costs 3, HOLD_ON_0 page → HOLD_ON_1 costs 4, etc.
    page_damage = {
        "INITIAL": 3,
        "HOLD_ON_0": 4,
        "HOLD_ON_1": 5,
        "HOLD_ON_2": 6,
        "HOLD_ON_3": 7,
        "HOLD_ON_4": 8,
        "HOLD_ON_5": 9,
        "HOLD_ON_6": 10,
        "HOLD_ON_LOOP": 11,
    }

    def resolve_hold_on(page_id: str, opt_id: str) -> str | None:
        key = f"SLIPPERY_BRIDGE.pages.{page_id}.options.{opt_id}.description"
        template = localization.get(key, "")
        if not template:
            return None
        dmg = page_damage.get(page_id, 11)
        suffix = "+" if dmg >= 11 else ""
        return strip_rich_tags(
            resolve_description(template, {"HpLoss": f"{dmg}{suffix}"})
        )

    for opt in event.get("options") or []:
        if opt["id"].startswith("HOLD_ON"):
            desc = resolve_hold_on("INITIAL", opt["id"])
            if desc:
                opt["description"] = desc
    for page in event.get("pages") or []:
        page_id = page.get("id", "")
        for opt in page.get("options") or []:
            if opt["id"].startswith("HOLD_ON"):
                desc = resolve_hold_on(page_id, opt["id"])
                if desc:
                    opt["description"] = desc
    return event


def _fix_abyssal_baths(event: dict, localization: dict) -> dict:
    """Fix Abyssal Baths — damage starts at 3 and increases by 1 after each immerse."""
    if event["id"] != "ABYSSAL_BATHS":
        return event
    # Immerse = 3 dmg, then OnImmerse increments damage by 1.
    # LINGER1 = 4, LINGER2 = 5, ... LINGER9 = 12
    # Use the localized template with resolved vars for each step.
    linger_template = localization.get(
        "ABYSSAL_BATHS.pages.ALL.options.LINGER.description", ""
    )
    linger_title = localization.get(
        "ABYSSAL_BATHS.pages.ALL.options.LINGER.title", "Linger"
    )
    exit_title = localization.get(
        "ABYSSAL_BATHS.pages.ALL.options.EXIT_BATHS.title", "Exit Baths"
    )
    exit_desc = localization.get(
        "ABYSSAL_BATHS.pages.ALL.options.EXIT_BATHS.description", ""
    )
    death_desc = localization.get("ABYSSAL_BATHS.pages.DEATH_WARNING.description", "")

    def resolve_linger(damage: int) -> str:
        return resolve_description(linger_template, {"MaxHp": 2, "Damage": damage})

    pages = event.get("pages") or []
    for page in pages:
        page_id = page.get("id", "")
        if page_id.startswith("LINGER") and page_id[6:].isdigit():
            step = int(page_id[6:])
            dmg = 3 + step + 1  # after step+1 immersions
            page["options"] = [
                {
                    "id": "LINGER",
                    "title": linger_title,
                    "description": resolve_linger(dmg),
                },
                {"id": "EXIT_BATHS", "title": exit_title, "description": exit_desc},
            ]
        elif page_id == "DEATH_WARNING":
            page["options"] = [
                {"id": "LINGER", "title": linger_title, "description": death_desc},
                {"id": "EXIT_BATHS", "title": exit_title, "description": exit_desc},
            ]
        elif page_id == "IMMERSE":
            page["options"] = [
                {
                    "id": "LINGER",
                    "title": linger_title,
                    "description": resolve_linger(4),
                },
                {"id": "EXIT_BATHS", "title": exit_title, "description": exit_desc},
            ]

    return event


def _fix_tablet_of_truth(event: dict) -> dict:
    """Fix Tablet of Truth escalating decipher costs (runtime-computed in GetDecipherCost)."""
    if event["id"] != "TABLET_OF_TRUTH":
        return event
    # Costs per page: DECIPHER_1 shows cost for step 2, DECIPHER_2 for step 3, etc.
    # Step 1 (initial) = 3, step 2 = 6, step 3 = 12, step 4 = 24, step 5 = MaxHP-1
    page_costs = {"DECIPHER_1": "6", "DECIPHER_2": "12", "DECIPHER_3": "24"}
    for page in event.get("pages") or []:
        page_id = page.get("id", "")
        for opt in page.get("options") or []:
            if opt.get("id") != "DECIPHER":
                continue
            if page_id in page_costs:
                opt["description"] = re.sub(
                    r"Lose \[red\]\d+\[/red\]",
                    f"Lose [red]{page_costs[page_id]}[/red]",
                    opt["description"],
                )
            elif page_id == "DECIPHER_4":
                opt["description"] = (
                    "Set Max HP to [red]1[/red]. [gold]Upgrade ALL[/gold] cards."
                )
    return event


def _fix_option_order(event: dict, correct_order: list[str]) -> dict:
    """Reorder INITIAL options to match the C# runtime order."""

    def _reorder(options: list[dict]) -> list[dict]:
        by_id = {o["id"]: o for o in options}
        ordered = [by_id[oid] for oid in correct_order if oid in by_id]
        # Append any remaining options not in the explicit order
        ordered += [o for o in options if o["id"] not in correct_order]
        return ordered

    if event.get("options"):
        event["options"] = _reorder(event["options"])
    for page in event.get("pages") or []:
        if page.get("id") == "INITIAL" and page.get("options"):
            page["options"] = _reorder(page["options"])
    return event


def _fix_amalgamator(event: dict) -> dict:
    """Fix Amalgamator option order — C# has Strikes before Defends."""
    if event["id"] != "AMALGAMATOR":
        return event
    return _fix_option_order(event, ["COMBINE_STRIKES", "COMBINE_DEFENDS"])


def _fix_wood_carvings(event: dict) -> dict:
    """Fix Wood Carvings option order — C# array is [BIRD, SNAKE/SNAKE_LOCKED, TORUS]."""
    if event["id"] != "WOOD_CARVINGS":
        return event
    return _fix_option_order(event, ["BIRD", "SNAKE", "SNAKE_LOCKED", "TORUS"])


def _fix_ranwid_the_elder(event: dict) -> dict:
    """Fix Ranwid option order — C# builds [POTION/LOCKED, GOLD, RELIC/LOCKED]."""
    if event["id"] != "RANWID_THE_ELDER":
        return event
    return _fix_option_order(
        event, ["POTION", "POTION_LOCKED", "GOLD", "RELIC", "RELIC_LOCKED"]
    )


def _fix_lost_wisp(event: dict) -> dict:
    """Remove ghost CLAIM_LOCKED option — not in C# source, only in localization."""
    if event["id"] != "LOST_WISP":
        return event
    if event.get("options"):
        event["options"] = [o for o in event["options"] if o["id"] != "CLAIM_LOCKED"]
    for page in event.get("pages") or []:
        if page.get("options"):
            page["options"] = [o for o in page["options"] if o["id"] != "CLAIM_LOCKED"]
    return event


def _fix_fake_merchant(event: dict) -> dict:
    """Enrich Fake Merchant — custom shop event with no localized description."""
    if event["id"] != "FAKE_MERCHANT":
        return event
    event["description"] = (
        "A suspicious merchant offers 9 fake relics at 42–58 gold each. "
        "Throwing a [gold]Foul Potion[/gold] starts a fight against The Merchant??? (165 HP). "
        "Winning rewards [gold]Fake Merchant's Rug[/gold] plus all unsold relics."
    )
    return event


def parse_all_events(loc_dir: Path, data_dir: Path) -> list[dict]:
    localization = load_localization(loc_dir)
    act_mapping = build_act_mapping()
    title_map = load_all_titles(loc_dir)
    relic_descs = load_relic_descriptions(data_dir)
    events = []
    for filepath in sorted(EVENTS_DIR.glob("*.cs")):
        event = parse_single_event(
            filepath, localization, act_mapping, title_map, relic_descs
        )
        if event:
            event = _fix_tablet_of_truth(event)
            event = _fix_abyssal_baths(event, localization)
            event = _fix_battleworn_dummy(event, localization)
            event = _fix_spiraling_whirlpool(event)
            event = _fix_colorful_philosophers(event)
            event = _fix_slippery_bridge(event, localization)
            event = _fix_amalgamator(event)
            event = _fix_wood_carvings(event)
            event = _fix_ranwid_the_elder(event)
            event = _fix_lost_wisp(event)
            event = _fix_fake_merchant(event)
            events.append(event)
    return events


def main(lang: str = "eng"):
    loc_dir = _loc_dir(lang)
    output_dir = _data_dir(lang)
    output_dir.mkdir(parents=True, exist_ok=True)
    events = parse_all_events(loc_dir, output_dir)
    with open(output_dir / "events.json", "w", encoding="utf-8") as f:
        json.dump(events, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(events)} events -> data/{lang}/events.json")


if __name__ == "__main__":
    main()
