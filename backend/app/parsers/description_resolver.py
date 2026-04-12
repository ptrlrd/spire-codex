"""Shared SmartFormat template resolver for card/relic/potion descriptions."""

import re


def _lookup(name: str, vars_dict: dict[str, int | str], default=None):
    """Case-insensitive variable lookup."""
    if name in vars_dict:
        return vars_dict[name]
    for k, v in vars_dict.items():
        if k.lower() == name.lower():
            return v
    return default


def _split_pipes_at_depth0(s):
    """Split string on | at brace depth 0."""
    parts = []
    depth = 0
    current = []
    for ch in s:
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        elif ch == "|" and depth == 0:
            parts.append("".join(current))
            current = []
            continue
        current.append(ch)
    parts.append("".join(current))
    return parts


def resolve_description(
    raw: str, vars_dict: dict[str, int | str], is_upgraded: bool = False
) -> str:
    """Resolve SmartFormat templates in descriptions."""
    text = raw

    # Handle {Var:choose(Option1|Option2|...):result1|result2|...}
    # Picks the branch matching the variable's value (e.g. CardType -> "Attack" picks first branch)
    def resolve_all_choose(text):
        while True:
            m = re.search(r"\{(\w+):choose\(([^)]+)\):", text)
            if not m:
                break
            start = m.start()
            var_name = m.group(1)
            options = m.group(2).split("|")
            rest_start = m.end()
            # Find matching closing } by counting braces
            depth = 1
            i = rest_start
            while i < len(text) and depth > 0:
                if text[i] == "{":
                    depth += 1
                elif text[i] == "}":
                    depth -= 1
                i += 1
            if depth != 0:
                break
            inner = text[rest_start : i - 1]
            branches = _split_pipes_at_depth0(inner)
            val = _lookup(var_name, vars_dict)
            # Find matching branch index
            result = None
            if val is not None:
                val_str = str(val)
                for idx, opt in enumerate(options):
                    if opt.strip().lower() == val_str.strip().lower() and idx < len(
                        branches
                    ):
                        result = branches[idx]
                        break
            if result is None and branches:
                result = branches[0]  # fallback to first only if no match found
            text = text[:start] + (result or "") + text[i:]
        return text

    text = resolve_all_choose(text)

    # Handle {IfUpgraded:show:A|B} or {IfUpgraded:show:A}
    def resolve_if_upgraded(m):
        parts = m.group(1)
        if "|" in parts:
            a, b = parts.split("|", 1)
            return a if is_upgraded else b
        return parts if is_upgraded else ""

    text = re.sub(r"\{IfUpgraded:show:([^}]*)\}", resolve_if_upgraded, text)

    # Handle {Var:energyIcons()} and {Var:energyIcons(N)} -> [energy:N]
    def resolve_energy_icons(m):
        var_name = m.group(1)
        explicit_count = m.group(2)
        if explicit_count:
            return f"[energy:{explicit_count}]"
        val = vars_dict.get(var_name, 1)
        return f"[energy:{val}]"

    text = re.sub(r"\{(\w+):energyIcons\((\d*)\)\}", resolve_energy_icons, text)

    # Handle {Var:starIcons()} -> [star:N]
    def resolve_star_icons(m):
        var_name = m.group(1)
        val = vars_dict.get(var_name, 1)
        return f"[star:{val}]"

    text = re.sub(r"\{(\w+):starIcons\(\)\}", resolve_star_icons, text)

    # Handle {SingleStarIcon} -> [star:1]
    text = re.sub(r"\{SingleStarIcon\}", "[star:1]", text, flags=re.IGNORECASE)

    # Handle {Var:plural:singular|plural} — {} in the form is replaced with the value
    # Must handle {} inside plural forms, so we manually parse these
    def resolve_all_plurals(text):
        while True:
            m = re.search(r"\{(\w+):plural:", text)
            if not m:
                break
            start = m.start()
            var_name = m.group(1)
            rest_start = m.end()  # position after ":plural:"
            # Find the matching closing } by counting braces
            depth = 1
            i = rest_start
            while i < len(text) and depth > 0:
                if text[i] == "{":
                    depth += 1
                elif text[i] == "}":
                    depth -= 1
                i += 1
            if depth != 0:
                break
            inner = text[rest_start : i - 1]  # content between :plural: and closing }
            pipe = inner.index("|") if "|" in inner else len(inner)
            singular = inner[:pipe]
            plural_form = inner[pipe + 1 :] if pipe < len(inner) else ""
            val = _lookup(var_name, vars_dict, 2)
            result = singular if val == 1 else plural_form
            result = result.replace("{}", str(val))
            # Handle {:diff()} and {:formatter} self-references (current context var)
            result = re.sub(r"\{:\w+\(\)\}", str(val), result)
            text = text[:start] + result + text[i:]
        return text

    text = resolve_all_plurals(text)

    # Handle SmartFormat :cond: conditionals with nested braces:
    # {Var.Property:cond:trueVal|falseVal} or {Var:cond:>N?result|==N?result|default}
    # e.g. {StarterRelic.StringValue:cond:[gold]{StarterRelic}[/gold]|generic text}
    # e.g. {Attacks:cond:>1?{Attacks:diff()} Attacks are|Attack is}
    def _eval_cond(op_str, val):
        """Evaluate a SmartFormat condition like >1, ==1, >=5 against a numeric value."""
        m = re.match(r"(>=|<=|!=|>|<|==)\s*(\d+)", op_str)
        if not m or not isinstance(val, (int, float)):
            return False
        op, threshold = m.group(1), int(m.group(2))
        if op == ">":
            return val > threshold
        if op == "<":
            return val < threshold
        if op == ">=":
            return val >= threshold
        if op == "<=":
            return val <= threshold
        if op == "==":
            return val == threshold
        if op == "!=":
            return val != threshold
        return False

    def resolve_all_cond(text):
        while True:
            m = re.search(r"\{([\w.]+):cond:", text)
            if not m:
                break
            start = m.start()
            var_name = m.group(1)
            rest_start = m.end()
            # Find matching closing } by counting braces
            depth = 1
            i = rest_start
            while i < len(text) and depth > 0:
                if text[i] == "{":
                    depth += 1
                elif text[i] == "}":
                    depth -= 1
                i += 1
            if depth != 0:
                break
            inner = text[rest_start : i - 1]
            parts = _split_pipes_at_depth0(inner)
            base_var = var_name.split(".")[0]
            val = _lookup(base_var, vars_dict)

            # Check if parts use comparison operators (>N?, ==N?, etc.)
            result = ""
            if any(re.match(r"[><=!]+\d+\?", p) for p in parts):
                # Comparison-based conditionals
                matched = False
                for part in parts:
                    cond_m = re.match(r"([><=!]+\d+)\?(.*)", part, re.DOTALL)
                    if cond_m:
                        if not matched and _eval_cond(
                            cond_m.group(1), val if isinstance(val, (int, float)) else 0
                        ):
                            result = cond_m.group(2)
                            matched = True
                    elif not matched:
                        # Default branch (no condition prefix)
                        result = part
                        matched = True
            else:
                # Simple truthy/falsy: trueVal|falseVal
                true_val = parts[0] if parts else ""
                false_val = parts[1] if len(parts) > 1 else ""
                result = true_val if (val is not None and val) else false_val

            text = text[:start] + result + text[i:]
        return text

    text = resolve_all_cond(text)

    # Handle nested SmartFormat conditionals: {Var:trueValue|falseValue}
    # where trueValue/falseValue can contain nested {braces}
    # e.g. {HasRider:{Sapping:...|}{Choking:...|}|} or {Violence: 3 times|}
    def resolve_all_nested_cond(text):
        while True:
            # Match {Word: or {Word. pattern (conditional with nested braces)
            m = re.search(
                r"\{(\w[\w.]*?)(?::(?!choose\(|cond:|diff\(\)|energyIcons|starIcons|plural:|show:|percentMore\(\)|percentLess\(\)))",
                text,
            )
            if not m:
                break
            start = m.start()
            var_name = m.group(1)
            rest_start = m.end()
            # Find matching closing } by counting braces
            depth = 1
            i = rest_start
            while i < len(text) and depth > 0:
                if text[i] == "{":
                    depth += 1
                elif text[i] == "}":
                    depth -= 1
                i += 1
            if depth != 0:
                break
            inner = text[rest_start : i - 1]
            parts = _split_pipes_at_depth0(inner)
            val = _lookup(var_name, vars_dict)
            true_val = parts[0] if parts else ""
            false_val = parts[1] if len(parts) > 1 else ""
            result = true_val if (val is not None and val) else false_val
            text = text[:start] + result + text[i:]
        return text

    text = resolve_all_nested_cond(text)

    # Handle {Var:percentMore()} -> convert multiplier to percentage (e.g. 1.25 -> "25")
    # The "%" is typically a literal character after the closing brace in the template
    def resolve_percent_more(m):
        val = _lookup(m.group(1), vars_dict)
        if val is not None:
            if isinstance(val, (int, float)):
                return str(int((val - 1) * 100))
            return str(val)
        return ""

    text = re.sub(r"\{(\w+):percentMore\(\)\}", resolve_percent_more, text)

    # Handle {Var:percentLess()} -> convert multiplier to percentage reduction (e.g. 0.75 -> "25")
    def resolve_percent_less(m):
        val = _lookup(m.group(1), vars_dict)
        if val is not None:
            if isinstance(val, (int, float)):
                return str(int((1 - val) * 100))
            return str(val)
        return ""

    text = re.sub(r"\{(\w+):percentLess\(\)\}", resolve_percent_less, text)

    # Handle {Var:diff()} -> value
    def resolve_diff(m):
        val = _lookup(m.group(1), vars_dict)
        return str(val) if val is not None else "X"

    text = re.sub(r"\{(\w+):diff\(\)\}", resolve_diff, text)

    # Strip trailing standalone "???" lines (unresolved rider enchantment slots)
    text = re.sub(r"\n\?\?\?$", "", text.strip())
    text = re.sub(r"^\?\?\?$", "", text.strip(), flags=re.MULTILINE)

    # Handle remaining {Var} without formatter
    def _make_readable(name: str) -> str:
        # Strip trailing digits (e.g. Enchantment1 -> Enchantment) but keep
        # CamelCase intact so [OwnerName] stays a single token for the
        # frontend tokenizer (spaces would break it into a false BBCode tag).
        readable = re.sub(r"\d+$", "", name).strip()
        return readable

    def resolve_bare(m):
        val = _lookup(m.group(1), vars_dict)
        if val is not None:
            return str(val)
        return f"[{_make_readable(m.group(1))}]"

    text = re.sub(r"\{(\w+)\}", resolve_bare, text)

    # Handle {Var:cond:...} and other complex formatters -> just show value
    def resolve_remaining(m):
        var_name = m.group(1).split(":")[0]
        val = _lookup(var_name, vars_dict)
        if val is not None:
            return str(val)
        return f"[{_make_readable(var_name)}]"

    text = re.sub(r"\{([^}]+)\}", resolve_remaining, text)

    return text


def extract_vars_from_source(content: str) -> dict[str, int]:
    """Extract DynamicVar values from C# source code."""
    all_vars: dict[str, int] = {}

    # Pattern: new XxxVar("Name", Nm, ...) — named typed vars (events use this heavily)
    # e.g. new DamageVar("RipHpLoss", 5m, ValueProp.Unblockable)
    # Also handles generic types: new PowerVar<WeakPower>("SappingWeak", 2m)
    for m in re.finditer(
        r'new\s+\w+Var(?:<\w+>)?\(\s*"(\w+)"\s*,\s*(\d+(?:\.\d+)?)m?(?:\s*,\s*[^)]+)?\)',
        content,
    ):
        raw_val = m.group(2)
        all_vars[m.group(1)] = float(raw_val) if "." in raw_val else int(raw_val)

    # Pattern: new IntVar("Name", Nm) — named int vars
    # e.g. new IntVar("RewardCount", 1m)
    for m in re.finditer(r'new\s+IntVar\(\s*"(\w+)"\s*,\s*(\d+)m?\)', content):
        all_vars[m.group(1)] = int(m.group(2))

    # Pattern: new XxxVar(Nm) or new XxxVar(N) — unnamed typed vars (cards use this)
    # Captures the type name (before "Var") and the numeric value
    for m in re.finditer(r"new\s+(\w+)Var\((\d+)m?(?:\s*,\s*[^)]+)?\)", content):
        var_type = m.group(
            1
        )  # e.g. "Damage", "Block", "Energy", "Cards", "MaxHp", "Power", "Heal"
        var_val = int(m.group(2))
        if var_type not in all_vars:
            all_vars[var_type] = var_val

    # Pattern: new PowerVar<XxxPower>(Nm) — power vars with generic type
    for m in re.finditer(r"new\s+PowerVar<(\w+?)(?:Power)?>\((\d+)m?\)", content):
        power_name = m.group(1)
        # Strip trailing "Power" if present in the name
        if power_name.endswith("Power"):
            power_name = power_name[:-5]
        power_val = int(m.group(2))
        # Store as both "XxxPower" and "Xxx" for template matching
        all_vars[f"{power_name}Power"] = power_val
        all_vars[power_name] = power_val

    # Pattern: new DynamicVar("Name", Nm) — named dynamic vars
    for m in re.finditer(
        r'new\s+DynamicVar\(\s*"(\w+)"\s*,\s*(\d+(?:\.\d+)?)m?\)', content
    ):
        name = m.group(1)
        raw_val = m.group(2)
        all_vars[name] = float(raw_val) if "." in raw_val else int(raw_val)

    # Pattern: new DynamicVar("Name", PropertyName) — named vars with property reference
    # e.g. new DynamicVar("Combats", CombatsLeft) with private int _combatsLeft = 5
    for m in re.finditer(r'new\s+DynamicVar\(\s*"(\w+)"\s*,\s*([A-Z]\w+)\)', content):
        name = m.group(1)
        prop_name = m.group(2)
        if name not in all_vars:
            field_name = "_" + prop_name[0].lower() + prop_name[1:]
            field_match = re.search(
                rf"private\s+int\s+{re.escape(field_name)}\s*=\s*(\d+)", content
            )
            if field_match:
                all_vars[name] = int(field_match.group(1))

    # Pattern: new EnergyVar("Name", N) — named energy vars
    for m in re.finditer(r'new\s+EnergyVar\(\s*"(\w+)"\s*,\s*(\d+)\)', content):
        name = m.group(1)
        val = int(m.group(2))
        all_vars[name] = val

    # Pattern: new IntVar(N)
    for m in re.finditer(r"(\w+)\s*=\s*new\s+IntVar\((\d+)\)", content):
        all_vars[m.group(1)] = int(m.group(2))

    # Pattern: new CardsVar("Name", N) — named cards vars
    for m in re.finditer(r'new\s+CardsVar\(\s*"(\w+)"\s*,\s*(\d+)\)', content):
        all_vars[m.group(1)] = int(m.group(2))

    # Pattern: new XxxVar(ValueProp...) with no numeric — CalculatedDamageVar etc.
    # CalculatedDamage in-game shows the BASE value, not base+extra (extra is runtime-multiplied)
    if "CalculatedDamageVar" in content and "CalculatedDamage" not in all_vars:
        base_val = all_vars.get("CalculationBase", 0)
        if base_val is not None:
            all_vars["CalculatedDamage"] = base_val

    # Pattern: new XxxVar(PropertyName, ...) where property is backed by a private field
    # e.g. new DamageVar(CurrentDamage, ValueProp.Move) with private int _currentDamage = 13
    for m in re.finditer(r"new\s+(\w+)Var\(([A-Z]\w+)\s*(?:,\s*[^)]+)?\)", content):
        var_type = m.group(1)  # e.g. "Damage", "Block"
        prop_name = m.group(2)  # e.g. "CurrentDamage"
        if var_type not in all_vars and prop_name not in ("ValueProp",):
            field_name = "_" + prop_name[0].lower() + prop_name[1:]
            field_match = re.search(
                rf"private\s+int\s+{re.escape(field_name)}\s*=\s*(\d+)", content
            )
            if field_match:
                all_vars[var_type] = int(field_match.group(1))

    # Const values: private const int _varName = N;
    for m in re.finditer(r"private\s+const\s+int\s+_?(\w+)\s*=\s*(\d+)", content):
        name = m.group(1)
        if name not in all_vars:
            all_vars[name] = int(m.group(2))

    # Static array values: private static readonly int[] _name = new int[] { N, N, N };
    for m in re.finditer(
        r"(?:static|readonly)\s+(?:.*?)(?:int|decimal)\[\]\s+_?(\w+)\s*=\s*(?:new\s+\w+\[\d*\]\s*\{|new\s*\[\]\s*\{|\{)\s*([\d,\s m]+)\s*\}",
        content,
    ):
        arr_name = m.group(1)
        values = [
            int(v.strip().rstrip("m"))
            for v in m.group(2).split(",")
            if v.strip().rstrip("m").isdigit()
        ]
        for i, val in enumerate(values):
            all_vars[f"{arr_name}_{i}"] = val

    return all_vars
