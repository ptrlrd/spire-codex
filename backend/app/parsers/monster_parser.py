"""Parse monster data from decompiled C# files and localization JSON."""

import json
import re
from pathlib import Path

from parser_paths import BASE, DECOMPILED, loc_dir as _loc_dir, data_dir as _data_dir

MONSTERS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Monsters"
ENCOUNTERS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Encounters"
IMAGES_DIR = BASE / "backend" / "static" / "images" / "monsters"


def class_name_to_id(name: str) -> str:
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name)
    s = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", "_", s)
    return s.upper()


def power_class_to_id(name: str) -> str:
    """Convert power class name like 'StrengthPower' to 'STRENGTH'."""
    name = re.sub(r"Power$", "", name)
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name)
    s = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", "_", s)
    return s.upper()


def load_localization(loc_dir: Path) -> dict:
    loc_file = loc_dir / "monsters.json"
    if loc_file.exists():
        with open(loc_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def parse_encounter_data(
    data_dir: Path,
) -> tuple[dict[str, str], dict[str, list[dict]]]:
    """Parse encounter data to map monsters to types and encounter details.

    Uses already-parsed encounters.json for act/name data, falls back to C# for type mapping.
    """
    monster_types: dict[str, str] = {}
    monster_encounters: dict[str, list[dict]] = {}

    # First, load parsed encounters.json for act/name data
    encounters_file = data_dir / "encounters.json"
    if encounters_file.exists():
        with open(encounters_file, "r", encoding="utf-8") as f:
            encounters = json.load(f)
        for enc in encounters:
            room_type = enc.get("room_type", "Monster")
            mtype = (
                "Boss"
                if room_type == "Boss"
                else "Elite"
                if room_type == "Elite"
                else "Normal"
            )
            for m in enc.get("monsters", []):
                mid = m["id"]
                # Convert ID back to class name for type lookup
                # Boss/Elite takes priority
                if mid not in monster_types or mtype in ("Boss", "Elite"):
                    if (
                        mid in monster_types
                        and monster_types[mid] == "Boss"
                        and mtype == "Elite"
                    ):
                        continue
                    monster_types[mid] = mtype

                if mid not in monster_encounters:
                    monster_encounters[mid] = []
                # Deduplicate by encounter_id
                enc_id = enc["id"]
                if not any(
                    e["encounter_id"] == enc_id for e in monster_encounters[mid]
                ):
                    monster_encounters[mid].append(
                        {
                            "encounter_id": enc_id,
                            "encounter_name": enc.get("name", enc_id),
                            "room_type": room_type,
                            "act": enc.get("act"),
                            "is_weak": enc.get("is_weak", False),
                        }
                    )

    # Also parse C# encounter files for any monsters not in JSON
    for f in sorted(ENCOUNTERS_DIR.glob("*.cs")):
        if f.stem.startswith("Mock") or f.stem.startswith("Deprecated"):
            continue
        content = f.read_text(encoding="utf-8")
        room_match = re.search(r"RoomType\s*=>\s*RoomType\.(\w+)", content)
        if not room_match:
            continue
        room_type = room_match.group(1)
        mtype = (
            "Boss"
            if room_type == "Boss"
            else "Elite"
            if room_type == "Elite"
            else "Normal"
        )

        for m in re.finditer(r"ModelDb\.Monster<(\w+)>", content):
            class_name = m.group(1)
            mid = class_name_to_id(class_name)
            if mid not in monster_types or mtype in ("Boss", "Elite"):
                if (
                    mid in monster_types
                    and monster_types[mid] == "Boss"
                    and mtype == "Elite"
                ):
                    continue
                monster_types[mid] = mtype

    # Convert class-name-keyed types to ID-keyed
    # (the C# loop already uses class names, we need both)
    types_by_class = {}
    for f in sorted(ENCOUNTERS_DIR.glob("*.cs")):
        if f.stem.startswith("Mock") or f.stem.startswith("Deprecated"):
            continue
        content = f.read_text(encoding="utf-8")
        room_match = re.search(r"RoomType\s*=>\s*RoomType\.(\w+)", content)
        if not room_match:
            continue
        room_type = room_match.group(1)
        mtype = (
            "Boss"
            if room_type == "Boss"
            else "Elite"
            if room_type == "Elite"
            else "Normal"
        )
        for m in re.finditer(r"ModelDb\.Monster<(\w+)>", content):
            class_name = m.group(1)
            if class_name not in types_by_class or mtype in ("Boss", "Elite"):
                if (
                    class_name in types_by_class
                    and types_by_class[class_name] == "Boss"
                    and mtype == "Elite"
                ):
                    continue
                types_by_class[class_name] = mtype

    return types_by_class, monster_encounters


def extract_move_effects(content: str) -> dict[str, dict]:
    """Extract per-move intents, powers applied, and block from C# source."""
    move_effects: dict[str, dict] = {}

    # Map move IDs to their method names
    move_to_method: dict[str, str] = {}
    for m in re.finditer(r'new MoveState\(\s*"(\w+)"\s*,\s*(\w+)', content):
        move_id = m.group(1)
        method_name = m.group(2)
        move_to_method[move_id] = method_name

    # Extract intents per move from MoveState constructor
    # Use semicolon-terminated match to capture full constructor including all intents
    for m in re.finditer(r'new MoveState\(\s*"(\w+)"[^;]*;', content, re.DOTALL):
        text = m.group()
        move_id_match = re.match(r'new MoveState\(\s*"(\w+)"', text)
        if not move_id_match:
            continue
        move_id = move_id_match.group(1)
        intent_types = re.findall(r"new (\w+Intent)", text)
        move_effects[move_id] = {"intents": intent_types}

    # Extract method bodies
    method_pattern = re.compile(
        r"(?:private|public)\s+async\s+Task\s+(\w+)\s*\([^)]*\)\s*\{(.*?)\n\t\}",
        re.DOTALL,
    )
    method_bodies: dict[str, str] = {}
    for mm in method_pattern.finditer(content):
        method_bodies[mm.group(1)] = mm.group(2)

    # For each move, extract powers from its method body
    for move_id, method_name in move_to_method.items():
        if move_id not in move_effects:
            move_effects[move_id] = {"intents": []}

        body = method_bodies.get(method_name, "")
        if not body:
            continue

        # Extract PowerCmd.Apply<PowerType>(target, amount, ...)
        # target can be: targets, base.Creature, or a variable
        powers = []
        for pm in re.finditer(
            r"PowerCmd\.Apply<(\w+)>\(\s*([\w.]+)\s*,\s*(\d+)m?", body
        ):
            power_class = pm.group(1)
            target_var = pm.group(2)
            amount = int(pm.group(3))
            target = "player" if target_var == "targets" else "self"
            powers.append(
                {
                    "power_id": power_class_to_id(power_class),
                    "target": target,
                    "amount": amount,
                }
            )

        # Also check for PowerCmd.Apply with variable amounts
        for pm in re.finditer(
            r"PowerCmd\.Apply<(\w+)>\(\s*([\w.]+)\s*,\s*([A-Za-z_]\w*)\s*,", body
        ):
            power_class = pm.group(1)
            target_var = pm.group(2)
            amount_var = pm.group(3)
            target = "player" if target_var == "targets" else "self"
            # Try to resolve the variable
            var_match = re.search(
                rf"{amount_var}\s*=>\s*(?:AscensionHelper\.GetValueIfAscension\(\w+\.\w+,\s*\d+,\s*(\d+)\)|(\d+))",
                content,
            )
            amount = None
            if var_match:
                amount = int(var_match.group(1) or var_match.group(2))
            if not amount:
                const_match = re.search(
                    rf"const\s+int\s+\w*{amount_var}\w*\s*=\s*(\d+)",
                    content,
                    re.IGNORECASE,
                )
                if const_match:
                    amount = int(const_match.group(1))
            if amount is not None:
                # Check if already captured
                pid = power_class_to_id(power_class)
                already = any(
                    p["power_id"] == pid and p["target"] == target for p in powers
                )
                if not already:
                    powers.append(
                        {
                            "power_id": pid,
                            "target": target,
                            "amount": amount,
                        }
                    )

        if powers:
            move_effects[move_id]["powers"] = powers

        # Extract damage from move method body: DamageCmd.Attack(VarName) or DamageCmd.Attack(N)
        dmg_match = re.search(r"DamageCmd\.Attack\((\w+)\)", body)
        if dmg_match:
            dmg_ref = dmg_match.group(1)
            # Check if it's a literal number with 'm' suffix
            if dmg_ref.endswith("m") and dmg_ref[:-1].isdigit():
                move_effects[move_id]["damage"] = {"normal": int(dmg_ref[:-1])}
            elif dmg_ref.isdigit():
                move_effects[move_id]["damage"] = {"normal": int(dmg_ref)}
            else:
                # Resolve variable — look for property or field definition
                # Pattern: private int VarName => AscensionHelper.GetValueIfAscension(..., asc, normal)
                asc_match = re.search(
                    rf"{dmg_ref}\s*=>\s*AscensionHelper\.GetValueIfAscension\(\w+\.\w+,\s*(\d+),\s*(\d+)\)",
                    content,
                )
                if asc_match:
                    move_effects[move_id]["damage"] = {
                        "normal": int(asc_match.group(2)),
                        "ascension": int(asc_match.group(1)),
                    }
                else:
                    # Simple property: private int VarName => N;
                    simple_match = re.search(rf"{dmg_ref}\s*=>\s*(\d+)\s*;", content)
                    if simple_match:
                        move_effects[move_id]["damage"] = {
                            "normal": int(simple_match.group(1))
                        }
                    else:
                        # Const: private const int _varName = N;
                        const_match = re.search(
                            rf"const\s+int\s+\w*{dmg_ref}\w*\s*=\s*(\d+)",
                            content,
                            re.IGNORECASE,
                        )
                        if const_match:
                            move_effects[move_id]["damage"] = {
                                "normal": int(const_match.group(1))
                            }

            # Check for hit count: .WithHitCount(N or Var)
            hit_match = re.search(r"Attack\(\w+\)\.WithHitCount\((\w+)\)", body)
            if hit_match and "damage" in move_effects[move_id]:
                hit_val = hit_match.group(1)
                if hit_val.isdigit():
                    move_effects[move_id]["damage"]["hit_count"] = int(hit_val)
                else:
                    # Resolve hit count variable
                    hc_asc = re.search(
                        rf"{hit_val}\s*=>\s*AscensionHelper\.GetValueIfAscension\(\w+\.\w+,\s*(\d+),\s*(\d+)\)",
                        content,
                    )
                    if hc_asc:
                        move_effects[move_id]["damage"]["hit_count"] = int(
                            hc_asc.group(2)
                        )
                        move_effects[move_id]["damage"]["hit_count_ascension"] = int(
                            hc_asc.group(1)
                        )
                    else:
                        hc_match = re.search(rf"{hit_val}\s*=>\s*(\d+)", content)
                        if hc_match:
                            move_effects[move_id]["damage"]["hit_count"] = int(
                                hc_match.group(1)
                            )
                        else:
                            hc_const = re.search(
                                rf"const\s+int\s+\w*{hit_val}\w*\s*=\s*(\d+)",
                                content,
                                re.IGNORECASE,
                            )
                            if hc_const:
                                move_effects[move_id]["damage"]["hit_count"] = int(
                                    hc_const.group(1)
                                )

        # Extract block from move methods — support both literal and variable references
        block_match = re.search(r"GainBlock\([\w.]+,\s*(\w+)", body)
        if block_match:
            blk_ref = block_match.group(1)
            if blk_ref.endswith("m") and blk_ref[:-1].isdigit():
                move_effects[move_id]["block"] = int(blk_ref[:-1])
            elif blk_ref.isdigit():
                move_effects[move_id]["block"] = int(blk_ref)
            else:
                # Resolve variable
                asc_match = re.search(
                    rf"{blk_ref}\s*=>\s*AscensionHelper\.GetValueIfAscension\(\w+\.\w+,\s*(\d+),\s*(\d+)\)",
                    content,
                )
                if asc_match:
                    move_effects[move_id]["block"] = int(asc_match.group(2))
                else:
                    simple_match = re.search(rf"{blk_ref}\s*=>\s*(\d+)\s*;", content)
                    if simple_match:
                        move_effects[move_id]["block"] = int(simple_match.group(1))
                    else:
                        const_match = re.search(
                            rf"const\s+int\s+\w*{blk_ref}\w*\s*=\s*(\d+)",
                            content,
                            re.IGNORECASE,
                        )
                        if const_match:
                            move_effects[move_id]["block"] = int(const_match.group(1))

        # Extract healing
        heal_match = re.search(r"CreatureCmd\.Heal\(base\.Creature,\s*(\d+)", body)
        if heal_match:
            move_effects[move_id]["heal"] = int(heal_match.group(1))

    return move_effects


def _extract_method_body(content: str, method_sig: str) -> str | None:
    """Extract a method body by matching its signature and brace-counting."""
    m = re.search(method_sig, content)
    if not m:
        return None
    # Find the opening brace (may be on next line)
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
    return content[start + 1 : i - 1]


def extract_attack_pattern(
    content: str, localization: dict, monster_id: str
) -> dict | None:
    """Extract attack pattern / move AI from GenerateMoveStateMachine() in C# source.

    Returns a structured dict describing the state machine:
    {
        "type": "cycle" | "random" | "conditional" | "mixed",
        "initial_move": "MOVE_ID",
        "states": [...],
        "description": "Human-readable summary"
    }
    """
    body = _extract_method_body(content, r"GenerateMoveStateMachine\(\)")
    if not body:
        return None

    # --- Parse all state declarations ---
    # MoveState: local vars (moveState, moveState2, ...) and class properties (DeadState, BeastCryState)
    states: dict[str, dict] = {}  # var_name -> {id, type, ...}

    # Local MoveState: MoveState moveState = new MoveState("ID", ...)
    for m in re.finditer(r'MoveState\s+(\w+)\s*=\s*new\s+MoveState\(\s*"(\w+)"', body):
        states[m.group(1)] = {"id": m.group(2), "type": "move"}

    # Class property MoveState: PropertyName = new MoveState("ID", ...)
    for m in re.finditer(r'(\w+)\s*=\s*new\s+MoveState\(\s*"(\w+)"', body):
        var_name = m.group(1)
        if var_name not in states and var_name[0].isupper():
            states[var_name] = {"id": m.group(2), "type": "move"}

    # MustPerformOnceBeforeTransitioning
    for m in re.finditer(r"MustPerformOnceBeforeTransitioning\s*=\s*true", body):
        # Find which state this belongs to — it's in an initializer block
        preceding = body[: m.start()]
        # Find the last MoveState declaration before this
        last_state = None
        for sm in re.finditer(
            r'(?:MoveState\s+)?(\w+)\s*=\s*new\s+MoveState\(\s*"(\w+)"', preceding
        ):
            last_state = sm.group(1)
        if last_state and last_state in states:
            states[last_state]["must_perform_once"] = True

    # RandomBranchState
    for m in re.finditer(
        r'(?:RandomBranchState\s+)?(\w+)\s*=\s*(?:\(RandomBranchState\))?\s*(?:\([^)]*\)\s*=\s*)*new\s+RandomBranchState\(\s*"(\w+)"',
        body,
    ):
        states[m.group(1)] = {"id": m.group(2), "type": "random", "branches": []}

    # Chained assignment pattern: randomBranchState = (RandomBranchState)(x.FollowUpState = (y.FollowUpState = new RandomBranchState(...)))
    for m in re.finditer(
        r'(\w+)\s*=\s*\(RandomBranchState\)\((.+?)new\s+RandomBranchState\(\s*"(\w+)"\s*\)',
        body,
        re.DOTALL,
    ):
        var_name = m.group(1)
        if var_name not in states:
            states[var_name] = {"id": m.group(3), "type": "random", "branches": []}
        # Also extract chained FollowUpState assignments
        chain_text = m.group(2)
        for fm in re.finditer(r"(\w+)\.FollowUpState", chain_text):
            chained_var = fm.group(1)
            if chained_var in states:
                states[chained_var]["follow_up"] = var_name

    # ConditionalBranchState
    for m in re.finditer(
        r'(?:ConditionalBranchState\s+)?(\w+)\s*=\s*new\s+ConditionalBranchState\(\s*"(\w+)"',
        body,
    ):
        states[m.group(1)] = {"id": m.group(2), "type": "conditional", "branches": []}

    if not states:
        return None

    # --- Parse FollowUpState assignments ---
    for m in re.finditer(r"(\w+)\.FollowUpState\s*=\s*(\w+)\s*;", body):
        src_var = m.group(1)
        tgt_var = m.group(2)
        if src_var in states and tgt_var in states:
            states[src_var]["follow_up"] = tgt_var

    # --- Parse AddBranch calls (RandomBranchState) ---
    # Patterns:
    #   .AddBranch(moveState, MoveRepeatType.X, 1f)
    #   .AddBranch(moveState, MoveRepeatType.X, () => 0.4f)
    #   .AddBranch(moveState, 2, 1f)  — int is CanRepeatXTimes maxTimes
    for m in re.finditer(
        r"(\w+)\.AddBranch\(\s*(\w+)\s*,\s*(?:MoveRepeatType\.(\w+)|(\d+))\s*,\s*(?:\(\)\s*=>\s*)?(\d+(?:\.\d+)?)f?\s*\)",
        body,
    ):
        branch_state_var = m.group(1)
        move_var = m.group(2)
        repeat_type = m.group(3)  # Named enum
        repeat_count = m.group(4)  # Int (CanRepeatXTimes)
        weight = float(m.group(5))

        if branch_state_var in states and states[branch_state_var]["type"] == "random":
            branch = {
                "move_var": move_var,
                "move_id": states[move_var]["id"] if move_var in states else move_var,
                "weight": weight,
            }
            if repeat_type:
                branch["repeat"] = repeat_type
            elif repeat_count:
                branch["repeat"] = "CanRepeatXTimes"
                branch["max_times"] = int(repeat_count)
            states[branch_state_var]["branches"].append(branch)

    # --- Parse AddState calls (ConditionalBranchState) ---
    for m in re.finditer(
        r"(\w+)\.AddState\(\s*(\w+)\s*,\s*\(\)\s*=>\s*([^)]+)\)", body
    ):
        cond_state_var = m.group(1)
        move_var = m.group(2)
        condition = m.group(3).strip()

        if cond_state_var in states and states[cond_state_var]["type"] == "conditional":
            states[cond_state_var]["branches"].append(
                {
                    "move_var": move_var,
                    "move_id": states[move_var]["id"]
                    if move_var in states
                    else move_var,
                    "condition": condition,
                }
            )

    # --- Determine initial state ---
    initial_var = None
    # Conditional initial: (condition ? stateA : stateB)
    cond_init = re.search(r"(\w+)\s*=\s*\(.*?\?\s*(\w+)\s*:\s*(\w+)\s*\)", body)
    if cond_init:
        # Use the first option as default
        initial_var = cond_init.group(2)
    # Standard: return new MonsterMoveStateMachine(list, moveState);
    ret_match = re.search(
        r"return\s+new\s+MonsterMoveStateMachine\(\s*\w+\s*,\s*(\w+)\s*\)", body
    )
    if ret_match:
        ret_var = ret_match.group(1)
        if ret_var in states:
            initial_var = ret_var
        elif not initial_var:
            initial_var = ret_var

    # --- Determine pattern type ---
    has_random = any(s["type"] == "random" for s in states.values())
    has_conditional = any(s["type"] == "conditional" for s in states.values())

    if has_random and has_conditional:
        pattern_type = "mixed"
    elif has_random:
        pattern_type = "random"
    elif has_conditional:
        pattern_type = "conditional"
    else:
        pattern_type = "cycle"

    # --- Build move name lookup ---
    def _move_name(move_id: str) -> str:
        loc_move = re.sub(r"_MOVE$", "", move_id)
        loc_key = f"{monster_id}.moves.{loc_move}.title"
        return localization.get(loc_key, loc_move.replace("_", " ").title())

    # --- Generate human-readable description ---
    description = _build_pattern_description(states, initial_var, _move_name)

    # --- Build output ---
    initial_move_id = None
    if initial_var and initial_var in states:
        s = states[initial_var]
        initial_move_id = (
            re.sub(r"_MOVE$", "", s["id"]) if s["type"] == "move" else s["id"]
        )

    output_states = []
    for var_name, state in states.items():
        entry: dict = {"id": state["id"], "type": state["type"]}
        if state["type"] == "move":
            entry["move_id"] = re.sub(r"_MOVE$", "", state["id"])
            if state.get("must_perform_once"):
                entry["must_perform_once"] = True
            if "follow_up" in state:
                follow = states.get(state["follow_up"])
                if follow:
                    entry["next"] = follow["id"]
        elif state["type"] == "random":
            entry["branches"] = []
            for b in state.get("branches", []):
                branch_entry = {
                    "move_id": re.sub(r"_MOVE$", "", b["move_id"]),
                    "weight": b["weight"],
                }
                if b.get("repeat"):
                    branch_entry["repeat"] = b["repeat"]
                if b.get("max_times"):
                    branch_entry["max_times"] = b["max_times"]
                entry["branches"].append(branch_entry)
        elif state["type"] == "conditional":
            entry["branches"] = []
            for b in state.get("branches", []):
                entry["branches"].append(
                    {
                        "move_id": re.sub(r"_MOVE$", "", b["move_id"]),
                        "condition": b["condition"],
                    }
                )
        output_states.append(entry)

    return {
        "type": pattern_type,
        "initial_move": initial_move_id,
        "states": output_states,
        "description": description,
    }


def _build_pattern_description(
    states: dict, initial_var: str | None, move_name_fn
) -> str:
    """Generate a human-readable attack pattern description from the state graph."""
    if not initial_var or initial_var not in states:
        return ""

    random_states = {k: v for k, v in states.items() if v["type"] == "random"}
    conditional_states = {k: v for k, v in states.items() if v["type"] == "conditional"}

    # --- Pure cycle ---
    if not random_states and not conditional_states:
        # Follow the chain from initial state
        chain = []
        visited = set()
        current = initial_var
        while current and current in states and current not in visited:
            visited.add(current)
            s = states[current]
            if s["type"] == "move":
                move_id = re.sub(r"_MOVE$", "", s["id"])
                chain.append(move_name_fn(move_id))
            current = s.get("follow_up")
        if len(chain) > 1:
            return " → ".join(chain) + " → repeat"
        elif chain:
            return f"Always uses {chain[0]}"
        return ""

    # --- Pure random ---
    if random_states and not conditional_states and len(random_states) == 1:
        rand_state = list(random_states.values())[0]
        branches = rand_state.get("branches", [])
        if branches:
            # Check if all weights are equal
            weights = [b["weight"] for b in branches]
            all_equal = len(set(weights)) == 1
            parts = []
            for b in branches:
                move_id = re.sub(r"_MOVE$", "", b["move_id"])
                name = move_name_fn(move_id)
                qualifiers = []
                repeat = b.get("repeat", "")
                if repeat == "CannotRepeat":
                    qualifiers.append("no repeat")
                elif repeat == "UseOnlyOnce":
                    qualifiers.append("once")
                elif repeat == "CanRepeatXTimes":
                    qualifiers.append(f"max {b.get('max_times', '?')}×")
                if not all_equal:
                    total = sum(weights)
                    pct = int(b["weight"] / total * 100)
                    qualifiers.append(f"{pct}%")
                if qualifiers:
                    name += f" ({', '.join(qualifiers)})"
                parts.append(name)

            # Check if there's an initial move before the random
            init_state = states.get(initial_var, {})
            if init_state.get("type") == "move":
                init_name = move_name_fn(re.sub(r"_MOVE$", "", init_state["id"]))
                return f"Starts with {init_name}, then random: " + ", ".join(parts)
            return "Random: " + ", ".join(parts)

    # --- Mixed / complex patterns ---
    parts = []
    # Describe initial move or sequence before branching
    visited = set()
    current = initial_var
    pre_branch = []
    while current and current in states and current not in visited:
        visited.add(current)
        s = states[current]
        if s["type"] == "move":
            move_id = re.sub(r"_MOVE$", "", s["id"])
            pre_branch.append(move_name_fn(move_id))
            current = s.get("follow_up")
        else:
            break  # Hit a branch state

    if pre_branch:
        if len(pre_branch) == 1:
            parts.append(f"Starts with {pre_branch[0]}")
        else:
            parts.append("Starts: " + " → ".join(pre_branch))

    # Describe branch states
    for var_name, s in random_states.items():
        branches = s.get("branches", [])
        weights = [b["weight"] for b in branches]
        all_equal = len(set(weights)) <= 1
        branch_parts = []
        for b in branches:
            move_id = re.sub(r"_MOVE$", "", b["move_id"])
            name = move_name_fn(move_id)
            quals = []
            repeat = b.get("repeat", "")
            if repeat == "CannotRepeat":
                quals.append("no repeat")
            elif repeat == "UseOnlyOnce":
                quals.append("once")
            if not all_equal:
                total = sum(weights)
                pct = int(b["weight"] / total * 100)
                quals.append(f"{pct}%")
            if quals:
                name += f" ({', '.join(quals)})"
            branch_parts.append(name)
        if branch_parts:
            parts.append("then random: " + ", ".join(branch_parts))

    for var_name, s in conditional_states.items():
        branches = s.get("branches", [])
        cond_parts = []
        for b in branches:
            move_id = re.sub(r"_MOVE$", "", b["move_id"])
            name = move_name_fn(move_id)
            cond_parts.append(f"{name} (if {b['condition']})")
        if cond_parts:
            parts.append("then conditional: " + " / ".join(cond_parts))

    return "; ".join(parts) if parts else ""


def parse_single_monster(
    filepath: Path, localization: dict, encounter_types: dict, monster_encounters: dict
) -> dict | None:
    content = filepath.read_text(encoding="utf-8")
    class_name = filepath.stem

    # Skip test/mock/deprecated monsters
    skip_prefixes = ("Mock", "Deprecated")
    skip_names = {
        "BigDummy",
        "MultiAttackMoveMonster",
        "OneHpMonster",
        "SingleAttackMoveMonster",
        "TenHpMonster",
    }
    if class_name.startswith(skip_prefixes) or class_name in skip_names:
        return None

    monster_id = class_name_to_id(class_name)

    # HP - try various patterns
    min_hp = None
    max_hp = None

    # Pattern: override int MinInitialHp => AscensionHelper.GetValueIfAscension(level, asc_val, normal_val)
    min_hp_asc = re.search(
        r"MinInitialHp\s*=>\s*AscensionHelper\.GetValueIfAscension\(\w+\.(\w+),\s*(\d+),\s*(\d+)\)",
        content,
    )
    max_hp_asc = re.search(
        r"MaxInitialHp\s*=>\s*AscensionHelper\.GetValueIfAscension\(\w+\.(\w+),\s*(\d+),\s*(\d+)\)",
        content,
    )

    if min_hp_asc:
        min_hp = int(min_hp_asc.group(3))  # Normal value
        min_hp_asc_val = int(min_hp_asc.group(2))  # Ascension value
    else:
        min_hp_simple = re.search(r"MinInitialHp\s*=>\s*(\d+)", content)
        if min_hp_simple:
            min_hp = int(min_hp_simple.group(1))
        min_hp_asc_val = None

    if max_hp_asc:
        max_hp = int(max_hp_asc.group(3))
        max_hp_asc_val = int(max_hp_asc.group(2))
    else:
        max_hp_simple = re.search(r"MaxInitialHp\s*=>\s*(\d+)", content)
        if max_hp_simple:
            max_hp = int(max_hp_simple.group(1))
        max_hp_asc_val = None

    # Moves - extract from MoveState definitions
    moves = []
    # Pattern: new MoveState("NAME", method, new IntentType(args))
    for m in re.finditer(r'new MoveState\(\s*"(\w+)"', content):
        move_name = m.group(1)
        moves.append(move_name)

    # Extract move effects (intents, powers, block, heal)
    move_effects = extract_move_effects(content)

    # Damage values from move methods
    damage_values = {}
    # Pattern: GetValueIfAscension(level, asc_val, normal_val) for damage
    for dm in re.finditer(
        r"(\w+)Damage\s*=>\s*AscensionHelper\.GetValueIfAscension\(\w+\.\w+,\s*(\d+),\s*(\d+)\)",
        content,
    ):
        damage_values[dm.group(1)] = {
            "normal": int(dm.group(3)),
            "ascension": int(dm.group(2)),
        }
    # Simple damage: private int XDamage => N;
    for dm in re.finditer(r"(\w+)Damage\s*=>\s*(\d+)\s*;", content):
        if dm.group(1) not in damage_values:
            damage_values[dm.group(1)] = {"normal": int(dm.group(2))}
    # Const damage: private const int _xDamage = N;
    for dm in re.finditer(
        r"private\s+const\s+int\s+_(\w*)[Dd]amage\s*=\s*(\d+)", content
    ):
        name = dm.group(1) or "base"
        if name not in damage_values:
            damage_values[name] = {"normal": int(dm.group(2))}

    # Hit counts — extract from WithHitCount(N) or WithHitCount(VarName)
    hit_counts: dict[str, int] = {}
    # First, extract named repeat constants: private int XRepeat => N; or const int _xRepeat = N;
    repeat_vars: dict[str, int] = {}
    for rm in re.finditer(r"(\w+)(?:Repeat|Times|TotalCount)\s*=>\s*(\d+)", content):
        repeat_vars[
            rm.group(1) + re.search(r"(Repeat|Times|TotalCount)", rm.group(0)).group()
        ] = int(rm.group(2))
    for rm in re.finditer(
        r"private\s+const\s+int\s+_(\w*(?:Repeat|Times|TotalCount))\s*=\s*(\d+)",
        content,
    ):
        repeat_vars[rm.group(1)] = int(rm.group(2))
    # Also check AscensionHelper for repeat values
    for rm in re.finditer(
        r"(\w+(?:Repeat|Times|TotalCount))\s*=>\s*AscensionHelper\.GetValueIfAscension\(\w+\.\w+,\s*(\d+),\s*(\d+)\)",
        content,
    ):
        repeat_vars[rm.group(1)] = int(rm.group(3))  # Use normal value

    # Now match WithHitCount to damage vars: DamageCmd.Attack(XDamage).WithHitCount(N_or_Var)
    for hm in re.finditer(r"Attack\((\w+)Damage\)\.WithHitCount\((\w+)\)", content):
        dmg_name = hm.group(1)
        hit_val = hm.group(2)
        if hit_val.isdigit():
            hit_counts[dmg_name] = int(hit_val)
        elif hit_val in repeat_vars:
            hit_counts[dmg_name] = repeat_vars[hit_val]

    # Merge hit counts into damage_values
    for dmg_name, count in hit_counts.items():
        if dmg_name in damage_values:
            damage_values[dmg_name]["hit_count"] = count

    # Block values
    block_values = {}
    for bm in re.finditer(r"(\w+)Block\s*=>\s*(\d+)", content):
        block_values[bm.group(1)] = int(bm.group(2))
    for bm in re.finditer(
        r"private\s+const\s+int\s+_(\w*)[Bb]lock\s*=\s*(\d+)", content
    ):
        name = bm.group(1) or "base"
        block_values[name] = int(bm.group(2))

    # Monster type from encounter data (keyed by class name)
    # Some parent classes aren't directly referenced in encounters but should inherit child type
    TYPE_OVERRIDES = {"DecimillipedeSegment": "Elite"}
    monster_type = TYPE_OVERRIDES.get(
        class_name, encounter_types.get(class_name, "Normal")
    )

    # Encounter appearances (keyed by monster ID)
    encounters = monster_encounters.get(monster_id, [])

    # Localization - get name and move names
    name = localization.get(f"{monster_id}.name", class_name)
    # Resolve runtime template vars in names (e.g. "Test Subject #C{Count}" → "Test Subject #C14")
    name = re.sub(r"\{Count\}", "14", name)
    move_details = []
    for move in moves:
        # Localization keys omit the _MOVE suffix (e.g. "INCANTATION" not "INCANTATION_MOVE")
        loc_move = re.sub(r"_MOVE$", "", move)
        loc_key = f"{monster_id}.moves.{loc_move}.title"
        move_title = localization.get(loc_key, loc_move.replace("_", " ").title())

        # Merge effects into move detail
        effects = move_effects.get(move, {})
        intents = effects.get("intents", [])
        # Categorize the move
        intent_label = _intent_label(intents)

        move_entry: dict = {"id": loc_move, "name": move_title, "intent": intent_label}
        if effects.get("powers"):
            move_entry["powers"] = effects["powers"]
        if effects.get("block"):
            move_entry["block"] = effects["block"]
        if effects.get("heal"):
            move_entry["heal"] = effects["heal"]
        if effects.get("damage"):
            move_entry["damage"] = effects["damage"]
        else:
            # Fallback: link damage value by name matching
            for dmg_name, dmg_val in damage_values.items():
                dmg_upper = class_name_to_id(dmg_name)
                if dmg_upper in loc_move or loc_move.startswith(dmg_upper):
                    move_entry["damage"] = dmg_val
                    break

        move_details.append(move_entry)

    # Innate powers — applied in AfterAddedToRoom or constructor
    innate_powers = []
    init_block = ""
    init_match = re.search(r"AfterAddedToRoom\(\)\s*\{", content)
    if init_match:
        start = init_match.end()
        depth = 1
        i = start
        while i < len(content) and depth > 0:
            if content[i] == "{":
                depth += 1
            elif content[i] == "}":
                depth -= 1
            i += 1
        init_block = content[start : i - 1]
    for pm in re.finditer(
        r"PowerCmd\.Apply<(\w+)>\([\w.]+\s*,\s*(\w+)m?\b", init_block
    ):
        power_name = pm.group(1).replace("Power", "")
        amount_ref = pm.group(2)
        amount = None
        amount_asc = None
        if amount_ref.isdigit():
            amount = int(amount_ref)
        else:
            # Resolve variable — check for AscensionHelper pattern
            asc_match = re.search(
                rf"{amount_ref}\s*=>\s*AscensionHelper\.GetValueIfAscension\(\w+\.\w+,\s*(\d+),\s*(\d+)\)",
                content,
            )
            if asc_match:
                amount = int(asc_match.group(2))
                amount_asc = int(asc_match.group(1))
            else:
                simple = re.search(rf"{amount_ref}\s*=>\s*(\d+)\s*;", content)
                if simple:
                    amount = int(simple.group(1))
                else:
                    const = re.search(
                        rf"const\s+int\s+\w*{amount_ref}\w*\s*=\s*(\d+)",
                        content,
                        re.IGNORECASE,
                    )
                    if const:
                        amount = int(const.group(1))
        if amount is not None:
            entry = {"power_id": class_name_to_id(power_name), "amount": amount}
            if amount_asc is not None and amount_asc != amount:
                entry["amount_ascension"] = amount_asc
            innate_powers.append(entry)

    # Attack pattern / move AI
    attack_pattern = extract_attack_pattern(content, localization, monster_id)

    # Skip monsters with no meaningful data (segments, stubs)
    if not min_hp and not move_details and not damage_values:
        return None

    # Image URL - check if a matching image exists
    IMAGE_ALIASES = {
        "CALCIFIED_CULTIST": "calcified_cultist",
        "DAMP_CULTIST": "damp_cultist",
        "GLOBE_HEAD": "orb_head",
        "TORCH_HEAD_AMALGAM": "amalgam",
        "SKULKING_COLONY": "skulkling_colomy",
        "LIVING_FOG": "living_smog",
        "THE_ADVERSARY_MK_ONE": "the_adversary_placeholder",
        "THE_ADVERSARY_MK_TWO": "the_adversary_placeholder",
        "THE_ADVERSARY_MK_THREE": "the_adversary_placeholder",
        "BOWLBUG_EGG": "bowlbug_egg",
        "BOWLBUG_NECTAR": "bowlbug_nectar",
        "BOWLBUG_ROCK": "bowlbug_rock",
        "BOWLBUG_SILK": "bowlbug_silk",
        "CRUSHER": "crusher",
        "ROCKET": "rocket",
        "DOORMAKER": "doormaker",
        "FLYCONID": "flyconid",
        "OVICOPTER": "ovicopter",
        "DECIMILLIPEDE_SEGMENT": "decimillipede",
        "DECIMILLIPEDE_SEGMENT_BACK": "decimillipede_segment_back",
        "DECIMILLIPEDE_SEGMENT_FRONT": "decimillipede_segment_front",
        "DECIMILLIPEDE_SEGMENT_MIDDLE": "decimillipede_segment_middle",
        "FAKE_MERCHANT_MONSTER": "fake_merchant",
        "MYSTERIOUS_KNIGHT": "flail_knight",
    }
    img_name = IMAGE_ALIASES.get(monster_id, monster_id.lower())
    image_file = IMAGES_DIR / f"{img_name}.webp"
    if not image_file.exists():
        image_file = IMAGES_DIR / f"{img_name}.png"
    image_url = (
        f"/static/images/monsters/{image_file.name}" if image_file.exists() else None
    )

    # Beta/concept art — check beta/ subdirectory
    BETA_ALIASES = {
        "DOOR": "door",
        "DOORMAKER": "door_maker_placeholder_2",
        "PAELS_LEGION": "paels_legion",
    }
    beta_name = BETA_ALIASES.get(monster_id)
    beta_file = IMAGES_DIR / "beta" / f"{beta_name}.png" if beta_name else None
    beta_image_url = (
        f"/static/images/monsters/beta/{beta_name}.png"
        if beta_file and beta_file.exists()
        else None
    )

    return {
        "id": monster_id,
        "name": name,
        "type": monster_type,
        "min_hp": min_hp,
        "max_hp": max_hp,
        "min_hp_ascension": min_hp_asc_val if min_hp_asc else None,
        "max_hp_ascension": max_hp_asc_val if max_hp_asc else None,
        "moves": move_details if move_details else None,
        "damage_values": damage_values if damage_values else None,
        "block_values": block_values if block_values else None,
        "encounters": encounters if encounters else None,
        "innate_powers": innate_powers if innate_powers else None,
        "attack_pattern": attack_pattern,
        "image_url": image_url,
        "beta_image_url": beta_image_url,
    }


def _intent_label(intents: list[str]) -> str:
    """Convert a list of intent class names to a human-readable label."""
    if not intents:
        return "Unknown"
    labels = []
    for i in intents:
        i_lower = i.lower()
        if "attack" in i_lower:
            labels.append("Attack")
        elif "defend" in i_lower:
            labels.append("Defend")
        elif "debuff" in i_lower:
            labels.append("Debuff")
        elif "buff" in i_lower:
            labels.append("Buff")
        elif "status" in i_lower:
            labels.append("Status")
        elif "summon" in i_lower:
            labels.append("Summon")
        elif "heal" in i_lower:
            labels.append("Heal")
        elif "escape" in i_lower:
            labels.append("Escape")
        elif "sleep" in i_lower:
            labels.append("Sleep")
        elif "stun" in i_lower:
            labels.append("Stun")
        elif "hidden" in i_lower:
            labels.append("Unknown")
        elif "deathblow" in i_lower or "death_blow" in i_lower:
            labels.append("Special")
        elif "carddebuff" in i_lower or "card_debuff" in i_lower:
            labels.append("Debuff")
        elif "hex" in i_lower:
            labels.append("Debuff")
        elif "shriek" in i_lower:
            labels.append("Debuff")
        else:
            labels.append("Unknown")
    # Deduplicate while preserving order
    seen = set()
    unique = []
    for lb in labels:
        if lb not in seen:
            seen.add(lb)
            unique.append(lb)
    return " + ".join(unique)


def _detect_parent_class(filepath: Path) -> str | None:
    """Detect if a monster C# class inherits from another monster (not MonsterModel)."""
    content = filepath.read_text(encoding="utf-8")
    m = re.search(r"class\s+\w+\s*:\s*(\w+)", content)
    if m and m.group(1) != "MonsterModel":
        return m.group(1)
    return None


# Monsters that inherit from another monster and should copy parent data
INHERITANCE_MAP: dict[str, str] = {
    "DecimillipedeSegmentBack": "DecimillipedeSegment",
    "DecimillipedeSegmentFront": "DecimillipedeSegment",
    "DecimillipedeSegmentMiddle": "DecimillipedeSegment",
    "MysteriousKnight": "FlailKnight",
}

# Display name overrides for inherited monsters (game only has parent's name)
NAME_OVERRIDES: dict[str, str] = {
    "DECIMILLIPEDE_SEGMENT_BACK": "Decimillipede Segment (Back)",
    "DECIMILLIPEDE_SEGMENT_FRONT": "Decimillipede Segment (Front)",
    "DECIMILLIPEDE_SEGMENT_MIDDLE": "Decimillipede Segment (Middle)",
}


def parse_all_monsters(loc_dir: Path, data_dir: Path) -> list[dict]:
    localization = load_localization(loc_dir)
    encounter_types, monster_encounters = parse_encounter_data(data_dir)
    monsters = []
    monsters_by_class: dict[str, dict] = {}

    for filepath in sorted(MONSTERS_DIR.glob("*.cs")):
        monster = parse_single_monster(
            filepath, localization, encounter_types, monster_encounters
        )
        if monster:
            monsters.append(monster)
            monsters_by_class[filepath.stem] = monster

    # Handle inheritance — fill in missing data from parent
    for child_class, parent_class in INHERITANCE_MAP.items():
        child_id = class_name_to_id(child_class)
        parent = monsters_by_class.get(parent_class)
        if not parent:
            continue

        # Check if child already exists
        existing = next((m for m in monsters if m["id"] == child_id), None)
        if existing:
            # Fill in missing fields from parent
            for field in [
                "min_hp",
                "max_hp",
                "min_hp_ascension",
                "max_hp_ascension",
                "moves",
                "damage_values",
                "block_values",
            ]:
                if not existing.get(field) and parent.get(field):
                    existing[field] = parent[field]
        else:
            # Create new entry based on parent
            child_filepath = MONSTERS_DIR / f"{child_class}.cs"
            child_monster_id = child_id
            name = NAME_OVERRIDES.get(
                child_monster_id,
                localization.get(
                    f"{child_monster_id}.name", child_class.replace("_", " ")
                ),
            )

            # Determine image
            IMAGE_ALIASES_LOCAL = {
                "DECIMILLIPEDE_SEGMENT_BACK": "decimillipede_segment_back",
                "DECIMILLIPEDE_SEGMENT_FRONT": "decimillipede_segment_front",
                "DECIMILLIPEDE_SEGMENT_MIDDLE": "decimillipede_segment_middle",
                "MYSTERIOUS_KNIGHT": "flail_knight",
            }
            img_name = IMAGE_ALIASES_LOCAL.get(
                child_monster_id, child_monster_id.lower()
            )
            image_file = IMAGES_DIR / f"{img_name}.webp"
            if not image_file.exists():
                image_file = IMAGES_DIR / f"{img_name}.png"
            image_url = (
                f"/static/images/monsters/{image_file.name}"
                if image_file.exists()
                else None
            )

            new_monster = {
                "id": child_monster_id,
                "name": name,
                "type": encounter_types.get(child_class, parent["type"]),
                "min_hp": parent.get("min_hp"),
                "max_hp": parent.get("max_hp"),
                "min_hp_ascension": parent.get("min_hp_ascension"),
                "max_hp_ascension": parent.get("max_hp_ascension"),
                "moves": parent.get("moves"),
                "damage_values": parent.get("damage_values"),
                "block_values": parent.get("block_values"),
                "encounters": monster_encounters.get(child_monster_id, []) or None,
                "image_url": image_url,
            }

            # Extract any additional powers from child's AfterAddedToRoom
            if child_filepath.exists():
                child_content = child_filepath.read_text(encoding="utf-8")
                # Look for powers applied in AfterAddedToRoom (like MysteriousKnight)
                init_powers = []
                for pm in re.finditer(
                    r"PowerCmd\.Apply<(\w+)>\([\w.]+\s*,\s*(\d+)m?", child_content
                ):
                    init_powers.append(
                        {
                            "power_id": power_class_to_id(pm.group(1)),
                            "amount": int(pm.group(2)),
                        }
                    )
                if init_powers:
                    new_monster["innate_powers"] = init_powers

            monsters.append(new_monster)
            monsters_by_class[child_class] = new_monster

    return monsters


def main(lang: str = "eng"):
    loc_dir = _loc_dir(lang)
    output_dir = _data_dir(lang)
    output_dir.mkdir(parents=True, exist_ok=True)
    monsters = parse_all_monsters(loc_dir, output_dir)
    with open(output_dir / "monsters.json", "w", encoding="utf-8") as f:
        json.dump(monsters, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(monsters)} monsters -> data/{lang}/monsters.json")


if __name__ == "__main__":
    main()
