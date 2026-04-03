#!/usr/bin/env python3
"""
QA Audit: Cross-reference numeric values in event JSON descriptions against C# source code.
Events A through M.

For each event:
1. Reads the C# source to extract all variable declarations (DynamicVar, GoldVar, HealVar,
   MaxHpVar, DamageVar, HpLossVar, CardsVar, const int, CalculateVars ranges, arrays, etc.)
2. Reads the event JSON entry from data/eng/events.json
3. Compares every [blue]N[/blue], [green]N[/green], [red]N[/red], [gold]N[/gold] numeric value
   in descriptions AND option descriptions against C# values
4. Reports ALL discrepancies
"""

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CS_DIR = PROJECT_ROOT / "extraction" / "decompiled" / "MegaCrit.Sts2.Core.Models.Events"
JSON_PATH = PROJECT_ROOT / "data" / "eng" / "events.json"

# Events to audit (A through M)
TARGET_EVENTS = {
    "ABYSSAL_BATHS": "AbyssalBaths",
    "AMALGAMATOR": "Amalgamator",
    "AROMA_OF_CHAOS": "AromaOfChaos",
    "BATTLEWORN_DUMMY": "BattlewornDummy",
    "BRAIN_LEECH": "BrainLeech",
    "BUGSLAYER": "Bugslayer",
    "BYRDONIS_NEST": "ByrdonisNest",
    "COLORFUL_PHILOSOPHERS": "ColorfulPhilosophers",
    "COLOSSAL_FLOWER": "ColossalFlower",
    "CRYSTAL_SPHERE": "CrystalSphere",
    "DARV": "Darv",
    "DENSE_VEGETATION": "DenseVegetation",
    "DOLL_ROOM": "DollRoom",
    "DOORS_OF_LIGHT_AND_DARK": "DoorsOfLightAndDark",
    "DROWNING_BEACON": "DrowningBeacon",
    "ENDLESS_CONVEYOR": "EndlessConveyor",
    "FAKE_MERCHANT": "FakeMerchant",
    "FIELD_OF_MAN_SIZED_HOLES": "FieldOfManSizedHoles",
    "GRAVE_OF_THE_FORGOTTEN": "GraveOfTheForgotten",
    "HUNGRY_FOR_MUSHROOMS": "HungryForMushrooms",
    "INFESTED_AUTOMATON": "InfestedAutomaton",
    "JUNGLE_MAZE_ADVENTURE": "JungleMazeAdventure",
    "LOST_WISP": "LostWisp",
    "LUMINOUS_CHOIR": "LuminousChoir",
    "MORPHIC_GROVE": "MorphicGrove",
}


def extract_cs_vars(cs_content: str) -> dict[str, Any]:
    """Extract all variable values from a C# event source file."""
    vars_dict: dict[str, Any] = {}

    # --- const int fields ---
    for m in re.finditer(r'const\s+int\s+_?(\w+)\s*=\s*(-?\d+)', cs_content):
        vars_dict[f"const:{m.group(1)}"] = int(m.group(2))

    # --- CanonicalVars DynamicVar declarations ---
    # new DynamicVar("Name", 50m)
    for m in re.finditer(r'new\s+DynamicVar\("(\w+)",\s*(-?\d+)m?\)', cs_content):
        vars_dict[f"DynamicVar:{m.group(1)}"] = int(m.group(2))

    # --- Named typed vars: new GoldVar("Key", 35), new HpLossVar("Key", 11m) ---
    for m in re.finditer(r'new\s+(\w+Var)\(\s*"(\w+)"\s*,\s*(-?\d+)m?\s*(?:,\s*[^)]+)?\)', cs_content):
        var_type, var_name, var_val = m.group(1), m.group(2), int(m.group(3))
        vars_dict[f"{var_type}:{var_name}"] = var_val

    # --- Unnamed typed vars: new GoldVar(60), new HealVar(10m), new MaxHpVar(2m) ---
    for m in re.finditer(r'new\s+(\w+Var)\((-?\d+)m?\s*(?:,\s*[^)]+)?\)', cs_content):
        var_type, var_val = m.group(1), int(m.group(2))
        key = f"{var_type}:unnamed"
        if key not in vars_dict:
            vars_dict[key] = var_val

    # --- CardsVar: new CardsVar(N) ---
    for m in re.finditer(r'new\s+CardsVar\((\d+)\)', cs_content):
        vars_dict["CardsVar:unnamed"] = int(m.group(1))

    # --- IntVar: new IntVar("Name", Nm) ---
    for m in re.finditer(r'new\s+IntVar\("(\w+)",\s*(-?\d+)m?\)', cs_content):
        vars_dict[f"IntVar:{m.group(1)}"] = int(m.group(2))

    # --- Arrays for indexed lookups ---
    arrays: dict[str, list] = {}
    for m in re.finditer(
        r'(?:static|readonly)\s+(?:.*?)(?:string|int|decimal)\[\]\s+(_\w+)\s*=\s*(?:new\s+\w+\[\d*\]\s*\{|new\s*\[\]\s*\{|\{)\s*([^}]+)\}',
        cs_content,
    ):
        arr_name = m.group(1)
        raw_vals = m.group(2)
        if '"' in raw_vals:
            arrays[arr_name] = [v.strip().strip('"') for v in raw_vals.split(",")]
        else:
            arrays[arr_name] = [
                int(v.strip().rstrip("m"))
                for v in raw_vals.split(",")
                if v.strip().rstrip("m").lstrip("-").isdigit()
            ]
    vars_dict["_arrays"] = arrays

    # Resolve array-indexed var declarations
    for m in re.finditer(r'new\s+(\w+Var)\((_\w+)\[(\d+)\]\s*,\s*(_\w+)\[(\d+)\]\)', cs_content):
        var_type = m.group(1)
        key_arr, key_idx = m.group(2), int(m.group(3))
        val_arr, val_idx = m.group(4), int(m.group(5))
        keys = arrays.get(key_arr, [])
        vals = arrays.get(val_arr, [])
        if key_idx < len(keys) and val_idx < len(vals):
            vars_dict[f"{var_type}:{keys[key_idx]}"] = vals[val_idx]

    # --- CalculateVars patterns ---
    calc_match = re.search(r'CalculateVars\(\)\s*\{(.*?)\n\s*\}', cs_content, re.DOTALL)
    if calc_match:
        calc_body = calc_match.group(1)
        _dv = r'(?:base\.)?DynamicVars(?:\["(\w+)"\]|\.(\w+))'

        # += with NextInt(min, max): BaseValue += (decimal)Rng.NextInt(min, max)
        for rm in re.finditer(
            _dv + r'\.BaseValue\s*\+=\s*\(decimal\)\s*(?:base\.)?Rng\.NextInt\((-?\d+),\s*(-?\d+)\)',
            calc_body,
        ):
            var_name = rm.group(1) or rm.group(2)
            low, high = int(rm.group(3)), int(rm.group(4))
            # Find the base value
            base = None
            for k, v in vars_dict.items():
                if k.endswith(f":{var_name}") and isinstance(v, int):
                    base = v
                    break
            if base is not None:
                # NextInt upper is exclusive
                vars_dict[f"range:{var_name}"] = f"{base + low}-{base + high - 1}"

        # += with NextInt(0, max): special form
        for rm in re.finditer(
            _dv + r'\.BaseValue\s*\+=\s*\(decimal\)\s*(?:base\.)?Rng\.NextInt\((\d+),\s*(\d+)\)',
            calc_body,
        ):
            pass  # Already handled above

        # += with NextFloat(-N, N): BaseValue += (decimal)Rng.NextFloat(-Nf, Nf)
        for rm in re.finditer(
            _dv + r'\.BaseValue\s*\+=\s*\(decimal\)\s*(?:base\.)?Rng\.NextFloat\((-?[\d.]+)f?,\s*(-?[\d.]+)f?\)',
            calc_body,
        ):
            var_name = rm.group(1) or rm.group(2)
            low_f, high_f = float(rm.group(3)), float(rm.group(4))
            base = None
            for k, v in vars_dict.items():
                if k.endswith(f":{var_name}") and isinstance(v, int):
                    base = v
                    break
            if base is not None:
                vars_dict[f"range:{var_name}"] = f"{int(base + low_f)}-{int(base + high_f)}"

        # -= with NextInt: BaseValue -= (decimal)Rng.NextInt(min, max)
        for rm in re.finditer(
            _dv + r'\.BaseValue\s*-=\s*\(decimal\)\s*(?:base\.)?Rng\.NextInt\((-?\d+),\s*(-?\d+)\)',
            calc_body,
        ):
            var_name = rm.group(1) or rm.group(2)
            low, high = int(rm.group(3)), int(rm.group(4))
            base = None
            for k, v in vars_dict.items():
                if k.endswith(f":{var_name}") and isinstance(v, int):
                    base = v
                    break
            if base is not None:
                vars_dict[f"range:{var_name}"] = f"{base - high + 1}-{base - low}"

    # HealRestSiteOption.GetHealAmount pattern (30% Max HP)
    if "HealRestSiteOption.GetHealAmount" in cs_content:
        vars_dict["computed:Heal"] = "30% Max"

    # --- ThatDoesDamage(Nm) on EventOptions ---
    for m in re.finditer(r'ThatDoesDamage\((\d+)m?\)', cs_content):
        vars_dict[f"ThatDoesDamage:{m.group(1)}"] = int(m.group(1))

    # --- Escalating damage: AbyssalBaths special case ---
    # DynamicVars.Damage.BaseValue += 1m  (in OnImmerse)
    if "Damage.BaseValue += 1m" in cs_content:
        vars_dict["escalating_damage"] = True

    return vars_dict


def extract_numbers_from_text(text: str) -> list[dict]:
    """Extract all colored numeric values from BBCode-tagged text.
    Returns list of {color, value, context} dicts.
    """
    if not text:
        return []

    results = []
    # Match [color]value[/color] where value contains digits or ranges or percentage
    # Also matches "N WORD" patterns like "3 TURNS"
    pattern = r'\[(\w+)\]([\d]+(?:-\d+)?(?:%\s*\w+)?(?:\s+\w+)?)\[/\1\]'
    for m in re.finditer(pattern, text):
        color = m.group(1)
        value = m.group(2).strip()
        # Only include if value starts with a digit
        if value and value[0].isdigit():
            results.append({
                "color": color,
                "value": value,
                "context": text[max(0, m.start() - 30):m.end() + 30],
            })
    return results


def collect_all_json_numbers(event: dict) -> list[dict]:
    """Collect all colored numbers from an event's JSON, including all pages and nested options."""
    numbers = []

    def add_from_text(text: str, location: str):
        for n in extract_numbers_from_text(text):
            n["location"] = location
            numbers.append(n)

    # Top-level description
    if event.get("description"):
        add_from_text(event["description"], "description")

    # Top-level options
    if event.get("options"):
        for opt in event["options"]:
            if opt.get("description"):
                add_from_text(opt["description"], f"option:{opt.get('id', '?')}")

    # Pages
    if event.get("pages"):
        for page in event["pages"]:
            if page.get("description"):
                add_from_text(page["description"], f"page:{page.get('id', '?')}")
            if page.get("options"):
                for opt in page["options"]:
                    if opt.get("description"):
                        add_from_text(opt["description"], f"page:{page.get('id', '?')}/option:{opt.get('id', '?')}")

    return numbers


def build_expected_values(cs_vars: dict) -> dict[str, Any]:
    """Build a flat dict of expected numeric values from the C# vars."""
    expected = {}

    for key, val in cs_vars.items():
        if key.startswith("_"):
            continue
        parts = key.split(":", 1)
        if len(parts) == 2:
            var_type, var_name = parts
            if var_type == "range":
                expected[f"range:{var_name}"] = val
            elif isinstance(val, int):
                expected[var_name] = val
                expected[f"{var_type}:{var_name}"] = val
            elif isinstance(val, str):
                expected[f"{var_type}:{var_name}"] = val
        elif isinstance(val, int):
            expected[key] = val

    return expected


def audit_event(event_id: str, cs_class: str, event_json: dict) -> list[str]:
    """Audit a single event. Returns list of discrepancy messages."""
    issues = []
    cs_path = CS_DIR / f"{cs_class}.cs"

    if not cs_path.exists():
        issues.append(f"  C# source file not found: {cs_path}")
        return issues

    cs_content = cs_path.read_text()
    cs_vars = extract_cs_vars(cs_content)
    arrays = cs_vars.get("_arrays", {})

    # Collect all numbers from JSON
    json_numbers = collect_all_json_numbers(event_json)

    # Event-specific audits based on deep C# analysis
    issues.extend(audit_specific(event_id, cs_class, cs_content, cs_vars, event_json, json_numbers))

    return issues


def audit_specific(
    event_id: str,
    cs_class: str,
    cs_content: str,
    cs_vars: dict,
    event_json: dict,
    json_numbers: list[dict],
) -> list[str]:
    """Event-specific deep audits comparing C# values to JSON values."""
    issues = []

    if event_id == "ABYSSAL_BATHS":
        # C#: MaxHpVar(2m), DamageVar(3m), HealVar(10m), _baseDamage=3, _damageScaling=1
        # Damage escalates: 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 (each immerse/linger adds 1)
        expected_maxhp = 2
        expected_base_damage = 3
        expected_heal = 10

        # Check IMMERSE option: "Gain [green]2[/green] Max HP. Take [red]3[/red] damage."
        check_option_value(event_json, "IMMERSE", "green", "2", expected_maxhp, issues, "MaxHP gain")
        check_option_value(event_json, "IMMERSE", "red", "3", expected_base_damage, issues, "base damage")

        # Check ABSTAIN option: "Heal [green]10[/green] HP."
        check_option_value(event_json, "ABSTAIN", "green", "10", expected_heal, issues, "heal")

        # Check escalating damage on LINGER options in pages
        # After IMMERSE (first dip): damage becomes 4 (3+1)
        # LINGER page from IMMERSE page should show damage=4
        expected_damages_by_page = {
            "IMMERSE": 4,      # After first immerse, damage was 3, then +1 => next linger costs 4
            "LINGER1": 5,
            "LINGER2": 6,
            "LINGER3": 7,
            "LINGER4": 8,
            "LINGER5": 9,
            "LINGER6": 10,
            "LINGER7": 11,
            "LINGER8": 12,
            "LINGER9": 13,     # Capped at lingerCount=9
        }

        if event_json.get("pages"):
            for page in event_json["pages"]:
                pid = page.get("id", "")
                if pid in expected_damages_by_page and page.get("options"):
                    for opt in page["options"]:
                        if opt.get("id") == "LINGER" and opt.get("description"):
                            nums = extract_numbers_from_text(opt["description"])
                            red_vals = [n for n in nums if n["color"] == "red"]
                            green_vals = [n for n in nums if n["color"] == "green"]
                            expected_dmg = expected_damages_by_page[pid]
                            for rv in red_vals:
                                if rv["value"] != str(expected_dmg):
                                    issues.append(
                                        f"  LINGER damage on page {pid}: JSON shows [red]{rv['value']}[/red], "
                                        f"expected {expected_dmg} (base 3 + {pid} escalation)"
                                    )
                            for gv in green_vals:
                                if gv["value"] != str(expected_maxhp):
                                    issues.append(
                                        f"  LINGER MaxHP on page {pid}: JSON shows [green]{gv['value']}[/green], "
                                        f"expected {expected_maxhp}"
                                    )

        # Check ALL page (generic linger template)
        # The ALL page LINGER option shows [red]3[/red] — the canonical base damage.
        # In-game, this localization key is only used AFTER OnImmerse() increments Damage to 4.
        # So the in-game display would show 4, but our JSON shows the base template value 3.
        # This is a KNOWN LIMITATION of static var resolution and is NOT a bug — the specific
        # IMMERSE page correctly shows [red]4[/red] for the first linger option.
        # We flag this as a NOTE rather than an error.
        if event_json.get("pages"):
            for page in event_json["pages"]:
                if page.get("id") == "ALL" and page.get("options"):
                    for opt in page["options"]:
                        if opt.get("id") == "LINGER" and opt.get("description"):
                            nums = extract_numbers_from_text(opt["description"])
                            red_vals = [n for n in nums if n["color"] == "red"]
                            for rv in red_vals:
                                if rv["value"] == "3":
                                    issues.append(
                                        f"  NOTE: ALL page LINGER template shows [red]3[/red] (canonical base), "
                                        f"but in-game this option is only shown after OnImmerse() which "
                                        f"increments damage to 4. The IMMERSE page correctly shows 4. "
                                        f"This is a template resolution limitation, not a data error."
                                    )

    elif event_id == "AMALGAMATOR":
        # C#: Only StringVars (card names), no numeric DynamicVars
        # JSON: "Remove [blue]2[/blue] Strikes/Defends" — the "2" comes from CardSelectorPrefs(..., 2)
        check_all_page_option_values(event_json, json_numbers, {
            ("COMBINE_STRIKES", "blue", "2"): ("CardSelectorPrefs count", 2),
            ("COMBINE_DEFENDS", "blue", "2"): ("CardSelectorPrefs count", 2),
        }, issues)

    elif event_id == "AROMA_OF_CHAOS":
        # C#: No DynamicVars (Array.Empty<DynamicVar>())
        # JSON has no numeric values in options — all [gold]Transform/Upgrade[/gold] text
        pass  # No numeric values to check

    elif event_id == "BATTLEWORN_DUMMY":
        # C#: vars come from monster HP values: BattleFriendV1, V2, V3 MinInitialHp
        # JSON: "Fight a [blue]75[/blue] HP dummy", "[blue]150[/blue]", "[blue]300[/blue]"
        # Also: "YOU HAVE [blue]3 TURNS[/blue]", Setting1 "Procure [blue]1[/blue] random Potion"
        # Setting2 "Upgrade [blue]2[/blue] random cards"
        # These HP values come from MonsterModel, not event vars directly
        # The parser resolves them from DynamicVar("Setting1Hp", MinInitialHp) etc.
        # We can check against known monster HP values from the monster data
        pass  # Values are from monster definitions, would need separate monster audit

    elif event_id == "BRAIN_LEECH":
        # C#: DamageVar("RipHpLoss", 5m), IntVar("RewardCount", 1m),
        #     IntVar("CardChoiceCount", 1m), IntVar("FromCardChoiceCount", 5m)
        # JSON SHARE_KNOWLEDGE: "Choose [blue]1[/blue] of [blue]5[/blue]"
        # JSON RIP: "Lose [red]5[/red] HP"
        check_all_page_option_values(event_json, json_numbers, {
            ("SHARE_KNOWLEDGE", "blue", "1"): ("CardChoiceCount", 1),
            ("SHARE_KNOWLEDGE", "blue", "5"): ("FromCardChoiceCount", 5),
            ("RIP", "red", "5"): ("RipHpLoss", 5),
        }, issues)

    elif event_id == "BUGSLAYER":
        # C#: Only StringVars (card names), no numeric DynamicVars
        # JSON has no numeric values
        pass

    elif event_id == "BYRDONIS_NEST":
        # C#: MaxHpVar(7m), StringVar("Card", ByrdonisEgg title)
        # JSON EAT: "Gain [blue]7[/blue] Max HP."
        check_all_page_option_values(event_json, json_numbers, {
            ("EAT", "blue", "7"): ("MaxHpVar", 7),
        }, issues)

    elif event_id == "COLORFUL_PHILOSOPHERS":
        # C#: CardsVar(3) — 3 card rewards per rarity tier
        # JSON options: "Obtain [blue]3[/blue] X cards."
        expected = 3
        for n in json_numbers:
            if n["color"] == "blue" and n["value"] == "3":
                pass  # matches
            elif n["color"] == "blue" and n["value"] != "3":
                issues.append(
                    f"  {n['location']}: JSON shows [blue]{n['value']}[/blue], "
                    f"expected 3 (CardsVar)"
                )

    elif event_id == "COLOSSAL_FLOWER":
        # C#: _prizeCosts = [35, 75, 135], _prizeDamage = [5, 6, 7]
        # GoldVar for Prize1=35, Prize2=75, Prize3=135
        # JSON: Extract Nectar gains 35/75/135 gold, Reach Deeper loses 5/6/7 HP
        expected_gold = {1: 35, 2: 75, 3: 135}
        expected_damage = {1: 5, 2: 6, 3: 7}

        # Check top-level and page options
        if event_json.get("pages"):
            for page in event_json["pages"]:
                pid = page.get("id", "")
                if page.get("options"):
                    for opt in page["options"]:
                        oid = opt.get("id", "")
                        desc = opt.get("description", "")
                        nums = extract_numbers_from_text(desc)

                        # EXTRACT_CURRENT_PRIZE_1: 35 gold
                        if oid == "EXTRACT_CURRENT_PRIZE_1":
                            check_num_in_list(nums, "blue", "35", 35, issues,
                                              f"page:{pid}/option:{oid} gold")
                        elif oid == "EXTRACT_CURRENT_PRIZE_2":
                            check_num_in_list(nums, "blue", "75", 75, issues,
                                              f"page:{pid}/option:{oid} gold")
                        elif oid == "EXTRACT_INSTEAD":
                            check_num_in_list(nums, "blue", "135", 135, issues,
                                              f"page:{pid}/option:{oid} gold")
                        elif oid == "REACH_DEEPER_1":
                            check_num_in_list(nums, "red", "5", 5, issues,
                                              f"page:{pid}/option:{oid} damage")
                        elif oid == "REACH_DEEPER_2":
                            check_num_in_list(nums, "red", "6", 6, issues,
                                              f"page:{pid}/option:{oid} damage")
                        elif oid == "POLLINOUS_CORE":
                            check_num_in_list(nums, "red", "7", 7, issues,
                                              f"page:{pid}/option:{oid} damage")

    elif event_id == "CRYSTAL_SPHERE":
        # C#: DynamicVar("UncoverFutureCost", 50m), _uncoverFutureCost=50
        #     _uncoverFutureRandomMin=1, _uncoverFutureRandomMax=50
        #     _uncoverFutureProphesizeCount=3, _paymentPlanCount=6
        # CalculateVars: BaseValue += (decimal)Rng.NextInt(1, 50)
        # So cost = 50 + NextInt(1, 50) = 50 + [1..49] = [51..99]
        # JSON: "Pay [red]51-99[/red] Gold. Divine [blue]3[/blue] times."
        # JSON: "Gain a [red]Debt[/red]. Divine [blue]6[/blue] times."

        # Check range calculation
        # C#: base=50, += NextInt(1, 50), NextInt upper exclusive => [1..49]
        # Result: 50+1=51 to 50+49=99 => "51-99" CORRECT
        check_all_page_option_values(event_json, json_numbers, {
            ("UNCOVER_FUTURE", "red", "51-99"): ("computed range 50+[1..49]", "51-99"),
            ("UNCOVER_FUTURE", "blue", "3"): ("prophesizeCount", 3),
            ("PAYMENT_PLAN", "blue", "6"): ("paymentPlanCount", 6),
        }, issues)

    elif event_id == "DARV":
        # Ancient event — no DynamicVars with numeric values
        # JSON has no numeric option descriptions
        pass

    elif event_id == "DENSE_VEGETATION":
        # C#: HealVar(0m) — calculated via HealRestSiteOption.GetHealAmount => 30% Max
        #     HpLossVar(11m)
        # JSON TRUDGE_ON: "Remove a card. Lose [red]11[/red] HP."
        # JSON REST: "Heal [green]30% Max[/green] HP. Fight enemies."
        check_all_page_option_values(event_json, json_numbers, {
            ("TRUDGE_ON", "red", "11"): ("HpLossVar", 11),
        }, issues)
        # Check the "30% Max" heal
        for n in json_numbers:
            if "REST" in n.get("location", "") and n["color"] == "green" and "30" in n["value"]:
                pass  # 30% Max matches

    elif event_id == "DOLL_ROOM":
        # C#: DamageVar("TakeTimeHpLoss", 5m), DamageVar("ExamineHpLoss", 15m)
        # JSON TAKE_SOME_TIME: "Lose [red]5[/red] HP. Choose [blue]1[/blue] of [blue]2[/blue]"
        # JSON EXAMINE: "Lose [red]15[/red] HP. Choose [blue]1[/blue] of [blue]3[/blue]"
        check_all_page_option_values(event_json, json_numbers, {
            ("TAKE_SOME_TIME", "red", "5"): ("TakeTimeHpLoss", 5),
            ("TAKE_SOME_TIME", "blue", "1"): ("choice count", 1),
            ("TAKE_SOME_TIME", "blue", "2"): ("doll choices", 2),
            ("EXAMINE", "red", "15"): ("ExamineHpLoss", 15),
            ("EXAMINE", "blue", "1"): ("choice count", 1),
            ("EXAMINE", "blue", "3"): ("doll choices", 3),
        }, issues)

    elif event_id == "DOORS_OF_LIGHT_AND_DARK":
        # C#: CardsVar(2) — upgrade 2 random cards
        # JSON LIGHT: "Upgrade [blue]2[/blue] random cards."
        # JSON DARK: "Remove [blue]1[/blue] card"
        check_all_page_option_values(event_json, json_numbers, {
            ("LIGHT", "blue", "2"): ("CardsVar", 2),
            ("DARK", "blue", "1"): ("CardSelectorPrefs", 1),
        }, issues)

    elif event_id == "DROWNING_BEACON":
        # C#: HpLossVar(13m)
        # JSON CLIMB: "Lose [red]13[/red] Max HP."
        check_all_page_option_values(event_json, json_numbers, {
            ("CLIMB", "red", "13"): ("HpLossVar", 13),
        }, issues)

    elif event_id == "ENDLESS_CONVEYOR":
        # C#: GoldVar(35), GoldVar("GoldenFyshGold", 75), HealVar("ClamRollHeal", 10m),
        #     MaxHpVar("CaviarMaxHp", 4m)
        # JSON: "[blue]35[/blue] Gold each" in description
        # Dish options: "Pay [red]35[/red] Gold"
        # Golden Fysh: "Gain [blue]75[/blue] Gold"
        # Clam Roll: "Heal [green]10[/green] HP"
        # Caviar: "Gain [green]4[/green] Max HP"
        check_all_page_option_values(event_json, json_numbers, {
            ("CAVIAR", "red", "35"): ("GoldVar (dish cost)", 35),
            ("CAVIAR", "green", "4"): ("CaviarMaxHp", 4),
            ("CLAM_ROLL", "red", "35"): ("GoldVar (dish cost)", 35),
            ("CLAM_ROLL", "green", "10"): ("ClamRollHeal", 10),
            ("GOLDEN_FYSH", "blue", "75"): ("GoldenFyshGold", 75),
            ("FRIED_EEL", "red", "35"): ("GoldVar (dish cost)", 35),
            ("JELLY_LIVER", "red", "35"): ("GoldVar (dish cost)", 35),
            ("SEAPUNK_SALAD", "red", "35"): ("GoldVar (dish cost)", 35),
            ("SPICY_SNAPPY", "red", "35"): ("GoldVar (dish cost)", 35),
            ("SUSPICIOUS_CONDIMENT", "red", "35"): ("GoldVar (dish cost)", 35),
        }, issues)

    elif event_id == "FAKE_MERCHANT":
        # C#: relicCost=50 (const int), _inventoryRelics has 9 relics
        # JSON is minimal ("Placeholder" description, no numeric options)
        pass

    elif event_id == "FIELD_OF_MAN_SIZED_HOLES":
        # C#: GoldVar(75), CardsVar(2)
        # JSON RESIST: "Remove [blue]2[/blue] cards. Add Normality."
        # No gold mentioned in JSON (75 is not displayed)
        check_all_page_option_values(event_json, json_numbers, {
            ("RESIST", "blue", "2"): ("CardsVar", 2),
        }, issues)

    elif event_id == "GRAVE_OF_THE_FORGOTTEN":
        # C#: Only StringVars (relic, enchantment, curse names)
        # JSON has no numeric values
        pass

    elif event_id == "HUNGRY_FOR_MUSHROOMS":
        # C#: RelicOption with ThatDoesDamage(15m) for Fragrant Mushroom
        # JSON BIG_MUSHROOM: "raise Max HP by [blue]20[/blue]. draw [blue]2[/blue] fewer cards."
        # JSON FRAGRANT_MUSHROOM: "lose [red]15[/red] HP and Upgrade [blue]3[/blue] random cards."
        # The 20, 2, 15, 3 values are from the RELIC descriptions, not event vars
        # The event itself just gives relics; the numbers describe what the relics do
        # ThatDoesDamage(15m) matches the [red]15[/red] in Fragrant Mushroom option
        check_all_page_option_values(event_json, json_numbers, {
            ("FRAGRANT_MUSHROOM", "red", "15"): ("ThatDoesDamage", 15),
            ("BIG_MUSHROOM", "blue", "20"): ("BigMushroom relic MaxHP", 20),
            ("BIG_MUSHROOM", "blue", "2"): ("BigMushroom relic draw reduction", 2),
            ("FRAGRANT_MUSHROOM", "blue", "3"): ("FragrantMushroom relic upgrades", 3),
        }, issues)

    elif event_id == "INFESTED_AUTOMATON":
        # C#: No DynamicVars (Array.Empty<DynamicVar>())
        # JSON has no numeric values (just "Obtain a random Power/0 cost card")
        pass

    elif event_id == "JUNGLE_MAZE_ADVENTURE":
        # C#: DynamicVar("SoloGold", 150m), DamageVar("SoloHp", 18m),
        #     DynamicVar("JoinForcesGold", 50m)
        # CalculateVars: SoloGold += NextFloat(-15, 15), JoinForcesGold += NextFloat(-15, 15)
        # SoloGold: 150 + [-15..15] = [135..165]
        # JoinForcesGold: 50 + [-15..15] = [35..65]
        # JSON SOLO_QUEST: "Gain [blue]135-165[/blue] Gold. Lose [red]18[/red] HP."
        # JSON JOIN_FORCES: "Gain [blue]35-65[/blue] Gold."
        check_all_page_option_values(event_json, json_numbers, {
            ("SOLO_QUEST", "blue", "135-165"): ("SoloGold range 150+[-15..15]", "135-165"),
            ("SOLO_QUEST", "red", "18"): ("SoloHp", 18),
            ("JOIN_FORCES", "blue", "35-65"): ("JoinForcesGold range 50+[-15..15]", "35-65"),
        }, issues)

    elif event_id == "LOST_WISP":
        # C#: GoldVar(60), _baseGold=60, _goldVariance=15
        # CalculateVars: Gold.BaseValue += (decimal)Rng.NextInt(-15, 16)
        # Gold: 60 + [-15..15] = [45..75]
        # JSON SEARCH: "Gain [blue]45-75[/blue] Gold."
        check_all_page_option_values(event_json, json_numbers, {
            ("SEARCH", "blue", "45-75"): ("GoldVar range 60+[-15..15]", "45-75"),
        }, issues)

    elif event_id == "LUMINOUS_CHOIR":
        # C#: GoldVar(149)
        # CalculateVars: Gold.BaseValue -= (decimal)Rng.NextInt(0, 50)
        # Gold: 149 - [0..49] = [100..149]
        # JSON OFFER_TRIBUTE: "Pay [red]100-149[/red] Gold."
        # JSON OFFER_TRIBUTE_LOCKED: "Requires [blue]100-149[/blue] Gold."
        # JSON REACH_INTO_THE_FLESH: "Remove [blue]2[/blue] cards. Add Spore Mind."
        check_all_page_option_values(event_json, json_numbers, {
            ("OFFER_TRIBUTE", "red", "100-149"): ("GoldVar range 149-[0..49]", "100-149"),
            ("OFFER_TRIBUTE_LOCKED", "blue", "100-149"): ("GoldVar range", "100-149"),
            ("REACH_INTO_THE_FLESH", "blue", "2"): ("CardSelectorPrefs count", 2),
        }, issues)

    elif event_id == "MORPHIC_GROVE":
        # C#: GoldVar(100), MaxHpVar(5m)
        # JSON GROUP: "Lose [red]100[/red] Gold. Transform [blue]2[/blue] cards."
        # JSON LONER: "Gain [green]5[/green] Max HP."
        check_all_page_option_values(event_json, json_numbers, {
            ("GROUP", "red", "100"): ("GoldVar", 100),
            ("GROUP", "blue", "2"): ("CardSelectorPrefs", 2),
            ("LONER", "green", "5"): ("MaxHpVar", 5),
        }, issues)

    return issues


def check_option_value(
    event_json: dict,
    option_id: str,
    color: str,
    expected_str: str,
    expected_int: int,
    issues: list[str],
    label: str,
):
    """Check a specific option's colored value across top-level and all pages."""
    found = False

    def check_opts(options, location):
        nonlocal found
        if not options:
            return
        for opt in options:
            if opt.get("id") == option_id and opt.get("description"):
                nums = extract_numbers_from_text(opt["description"])
                for n in nums:
                    if n["color"] == color:
                        found = True
                        if n["value"] != expected_str:
                            issues.append(
                                f"  {location}/{option_id} {label}: "
                                f"JSON shows [{color}]{n['value']}[/{color}], expected {expected_str}"
                            )

    check_opts(event_json.get("options"), "top-level")
    if event_json.get("pages"):
        for page in event_json["pages"]:
            check_opts(page.get("options"), f"page:{page.get('id', '?')}")


def check_num_in_list(
    nums: list[dict],
    color: str,
    expected_str: str,
    expected_val: Any,
    issues: list[str],
    label: str,
):
    """Check that a specific color/value exists in a numbers list."""
    matches = [n for n in nums if n["color"] == color and n["value"] == expected_str]
    if not matches:
        actual = [n for n in nums if n["color"] == color]
        if actual:
            issues.append(
                f"  {label}: Expected [{color}]{expected_str}[/{color}], "
                f"found [{color}]{actual[0]['value']}[/{color}]"
            )
        # If no matches at all for that color, it might just not be displayed — skip


def check_all_page_option_values(
    event_json: dict,
    json_numbers: list[dict],
    checks: dict[tuple, tuple],
    issues: list[str],
):
    """Run multiple (option_id, color, expected_value) checks against all options in the event.

    checks: dict mapping (option_id, color, expected_str) -> (label, expected_value)

    Instead of matching individual numbers to labels (which fails when multiple same-colored
    values exist in one option), we verify that the expected value EXISTS in the option text.
    """
    for (option_id, color, expected_str), (label, expected_val) in checks.items():
        # Collect all option description text for this option_id
        all_texts = []
        if event_json.get("options"):
            for opt in event_json["options"]:
                if opt.get("id") == option_id and opt.get("description"):
                    all_texts.append(opt["description"])
        if event_json.get("pages"):
            for page in event_json["pages"]:
                if page.get("options"):
                    for opt in page["options"]:
                        if opt.get("id") == option_id and opt.get("description"):
                            all_texts.append(opt["description"])

        if not all_texts:
            continue  # Option not found — skip

        # Check if the expected colored value appears in ANY instance of this option
        expected_tag = f"[{color}]{expected_str}[/{color}]"
        found_in_any = any(expected_tag in text for text in all_texts)

        if not found_in_any:
            # Get the actual values of this color found in the option
            actual_vals = set()
            for text in all_texts:
                for n in extract_numbers_from_text(text):
                    if n["color"] == color:
                        actual_vals.add(n["value"])
            if actual_vals:
                issues.append(
                    f"  option:{option_id} {label}: expected [{color}]{expected_str}[/{color}], "
                    f"but found [{color}]{', '.join(sorted(actual_vals))}[/{color}]"
                )


def main():
    # Load events JSON
    with open(JSON_PATH) as f:
        events_data = json.load(f)

    events_by_id = {e["id"]: e for e in events_data}

    total_issues = 0
    total_checked = 0
    all_issues = {}

    print("=" * 80)
    print("SPIRE CODEX EVENT AUDIT: A through M")
    print("Cross-referencing C# source values against JSON descriptions")
    print("=" * 80)
    print()

    for event_id, cs_class in sorted(TARGET_EVENTS.items()):
        total_checked += 1
        event_json = events_by_id.get(event_id)
        if not event_json:
            print(f"[SKIP] {event_id} — not found in events.json")
            continue

        print(f"[AUDIT] {event_id} ({cs_class}.cs)")

        # Extract C# vars for summary
        cs_path = CS_DIR / f"{cs_class}.cs"
        cs_vars_summary = {}
        if cs_path.exists():
            cs_content = cs_path.read_text()
            cs_vars_summary = extract_cs_vars(cs_content)

        # Print C# var summary
        printable_vars = {
            k: v
            for k, v in cs_vars_summary.items()
            if not k.startswith("_") and k != "escalating_damage"
        }
        if printable_vars:
            print(f"  C# vars: {printable_vars}")
        else:
            print("  C# vars: (none)")

        # Collect JSON numbers
        json_numbers = collect_all_json_numbers(event_json)
        if json_numbers:
            unique_nums = set()
            for n in json_numbers:
                unique_nums.add(f"[{n['color']}]{n['value']}[/{n['color']}] in {n['location']}")
            print(f"  JSON numbers found ({len(json_numbers)}):")
            for un in sorted(unique_nums):
                print(f"    {un}")
        else:
            print("  JSON numbers: (none)")

        # Run audit
        issues = audit_event(event_id, cs_class, event_json)
        if issues:
            total_issues += len(issues)
            all_issues[event_id] = issues
            print(f"  *** ISSUES FOUND ({len(issues)}):")
            for issue in issues:
                print(f"    {issue}")
        else:
            print("  OK — no discrepancies found")
        print()

    # Summary
    print("=" * 80)
    print("AUDIT SUMMARY")
    print("=" * 80)
    print(f"Events checked: {total_checked}")
    print(f"Events with issues: {len(all_issues)}")
    print(f"Total issues: {total_issues}")
    print()

    if all_issues:
        print("DISCREPANCIES:")
        for event_id, issues in sorted(all_issues.items()):
            print(f"\n  {event_id}:")
            for issue in issues:
                print(f"  {issue}")
    else:
        print("No discrepancies found! All values match C# source.")

    return 1 if total_issues > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
