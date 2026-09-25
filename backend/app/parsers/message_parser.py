"""
Shared SmartFormat template parser for entity description and general localization templates.
Unlike description_resolver, this code does not finalize strings given game data.
Instead it parsers the templates, and there are optional helpers for exporting them to ICU for the frontend
description_resolver uses this logic internally (or will, as part of the PR)
"""

import re
from collections.abc import Iterator, Callable

def _lookup(name: str, vars_dict: dict[str, int | str], default=None):
    """Case-insensitive variable lookup."""
    if name in vars_dict:
        return vars_dict[name]
    for k, v in vars_dict.items():
        if k.lower() == name.lower():
            return v
    # Calculated* vars (base + extra * runtime state) display CalculationBase out
    # of combat; some cards (Expect a Fight) ship only the base in their vars.
    if name.startswith("Calculated"):
        return _lookup("CalculationBase", vars_dict, default)
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

"""Note: parameters with options always have as their options a sequence which is effectively a sub-parse, making them always 2d arrays"""
class TemplateParameter:
    name: str
    def __init__(self, name: str) -> None:
        self.name = name


class BareParameter(TemplateParameter):
    ...

class ParameterWithOptions(TemplateParameter):
    options: list[list[str | TemplateParameter]]
    def __init__(self, name: str) -> None:
        super().__init__(name)
        self.options = [[]]

class ChooseParameter(ParameterWithOptions):
    keys: list[str]
    def __init__(self, name: str, keys: list[str]):
        super().__init__(name)
        self.keys = keys

class ShowParameter(ParameterWithOptions):
    ...

class ConditionParameter(ParameterWithOptions):
    test: Callable[[int], bool]
    def __init__(self, name: str, test: Callable[[int], bool]):
        super().__init__(name)
        self.test = test

class DiffParameter(TemplateParameter):
    ...
class EnergyIcons(TemplateParameter):
    n: int | None
    def __init__(self, name: str, n: int = None):
            super().__init__(name)
            self.n = n
class StarIcons(TemplateParameter):
    n: int | None
    def __init__(self, name: str, n: int = None):
            super().__init__(name)
            self.n = n

def assert_delimiter(name: str, expected: str, actual: str):
     if actual != expected:
        raise SyntaxError(f"Expected the template function '{name}' to be followed by '{expected}' but got {actual}.")

def assert_closed(raw, position: int):    
    if raw[position] != "}":
        raise SyntaxError(f"@{position}: Expected the parameter to close here but it did not.")

def parse_condition_expression(expression: str):
        """Convert a SmartFormat condition like >1, ==1, >=5 into a callable lambda"""
        m = re.match(r"(>=|<=|!=|>|<|==)\s*(\d+)", expression)
        if not m:
            raise SyntaxError("Expected 'cond' function to be a numerical comparison but got {condition}.")
        op, threshold = m.group(1), int(m.group(2))
        match op:
            case ">":
                return lambda val: val > threshold
            case "<":
                return lambda val: val < threshold
            case ">=":
                return lambda val: val >= threshold
            case "<=":
                return lambda val: val <= threshold
            case "==":
                return lambda val: val == threshold
            case "!=":
                return lambda val: val != threshold
            case _:
                raise SyntaxError(f"Unexpected 'cond' operator {op}.")

 #todo: this is technically a marginally inefficient parser in that in limited cases it relies on lookahead instead of true token building, but we always have the whole string and the original wasn't token building either so optimisation can be considered later
def parse_message(
    raw: str
) -> Iterator[str | TemplateParameter]:
    """Resolve SmartFormat templates in descriptions."""
    work_stack: list[TemplateParameter | list[str | TemplateParameter]] = []
    length = len(raw)
    position = 0
    def open_param(param_start):
        position = param_start + 1
        delimiter_pos = raw.index(r"(?<!\\)[:\}]", position)
        name = raw[position:delimiter_pos]
    
        delimiter = raw[delimiter_pos]
        match delimiter:
            case "}":
                position = delimiter_pos + 1
                if name == "singleStarIcon":
                    yield StarIcons(name, 1)
                else:
                    yield BareParameter(name)
            case ":":
                position = delimiter_pos + 1
                delimiter_pos = raw.index(r"(?<!\\)[:\{\}|\(]", position)
                delimiter = raw[delimiter_pos]
                match delimiter:
                    case "{" | "}" | "|":
                        # as far as I can currently tell this is shorthand for a show parameter, and we aren't advancing to that delimiter as such because we need to process the content
                        work_stack.push(ShowParameter(name))
                        work_stack.push([])
                    case ':':
                        func_name = raw[position:delimiter_pos]
                        position = delimiter_pos + 1
                        match func_name:
                            case "cond":
                                delimiter_pos = raw.index(":", position)
                                expression = raw[position:delimiter_pos]
                                position = delimiter_pos + 1
                                work_stack.push(ConditionParameter(name, parse_condition_expression(expression)))
                                work_stack.push([])
                            case "show":
                                delimiter_pos = raw.index(":", position)
                                expression = raw[position:delimiter_pos]
                                position = delimiter_pos + 1
                                work_stack.push(ShowParameter(name))
                                work_stack.push([])
                            #todo: many other cases
                            case _:
                                raise SyntaxError(f"@{position}-{delimiter_pos}: Unexpected template function {func_name}.")
                    case '(':
                        func_name = raw[position:delimiter_pos]
                        position = delimiter_pos + 1

                        delimiter_pos = raw.index(r")", position)
                        args = raw[position:delimiter_pos]
                        match func_name:
                            case "choose":
                                keys = args.split("|")
                                if len(keys):
                                    raise SyntaxError(f"@{position}-{delimiter_pos}: Invalid 'choose' arguments: expected 1+ '|' seperated strings but got '{args}'.")
                                assert_closed(raw, delimiter_pos + 1)
                                position = delimiter_pos + 1
                                work_stack.push(ChooseParameter(name, keys))
                                work_stack.push([])
                            case "diff":
                                if args != "":
                                    raise SyntaxError(f"@{position}-{delimiter_pos}: Invalid 'diff' arguments: expected nothing but got '{args}'.")
                                assert_closed(raw, delimiter_pos + 1)
                                position = delimiter_pos + 1
                                yield DiffParameter(name)
                            case "starIcons":
                                assert_closed(raw, delimiter_pos + 1)
                                position = delimiter_pos + 1
                                yield StarIcons(name, None if args == "" else int(args))
                            case "energyIcons":
                                assert_closed(raw, delimiter_pos + 1)
                                position = delimiter_pos + 1
                                yield EnergyIcons(name, None if args == "" else int(args))
                            case _:
                                raise SyntaxError(f"@{position}-{delimiter_pos}: Unexpected template function {func_name}.")
                    case _:
                                raise SyntaxError(f"@{position}-{delimiter_pos}: Malformed parameter at: the first ':' should be following by a function name or sub-template, but neither could be found")
            case _:
                raise SyntaxError(f"@{position}-{delimiter_pos}: Unexpected character {delimiter} following a parameter name.")
    while position < length:
        current: TemplateParameter | None = work_stack[-1] if len(work_stack) > 0 else None
        if current is None:
            param_start = raw.find(r"(?<!\\)\{", position)
            if param_start == -1:
                if position < length:
                    yield raw[position:]
                position = length
            else:
                yield raw[position:param_start]
                open_param(param_start)
        else:
            if isinstance(current, list):
                # we are building a fragment, e.g. part of a | separated list
                # this is similar to seeking at the root, but there are different delimiters and they are garaunteed to exist
                delimiter_pos = raw.index(r"(?<!\\)[|\{\}]", position)
                delimiter = raw[delimiter_pos]
                if delimiter_pos - position > 1:
                    current.push(raw[position:delimiter_pos])
                
                position = delimiter_pos + 1
                if delimiter == "{":
                    open_param(delimiter_pos)
                else:
                    work_stack.pop()
                    parent = work_stack[-1]
                    if isinstance(parent, ParameterWithOptions):
                        parent.options.push(current)
                        match delimiter:
                            case "}":
                                work_stack.pop()   
                                if len(parent.options) == 1:
                                    raise SyntaxError(f"@{delimiter_pos}: Insufficient options for 'show' parameter: expected 2 options but got 1")
                                elif len(work_stack) == 0:
                                    yield parent
                                else:
                                    grandparent = work_stack[-1]
                                    if not isinstance(grandparent, list):
                                        raise TypeError(f"@{delimiter_pos}: Expected the parent of a parameter to be a content fragment (list[str | TemplateParameter]) but got {type(grandparent).name}")
                                    grandparent.push(parent)
                            case "|":
                                if len(current.options) == 2:
                                    raise SyntaxError(f"@{delimiter_pos}: Invalid 'show' parameter: expected 2 options but got {len(current.options)}")                        
                                else:
                                    work_stack.push([])
                            case _:
                                raise SyntaxError(f"@{delimiter_pos}: Unexpected character {delimiter} following a paramer option.")
                    else:
                        raise SyntaxError(f"@{delimiter_pos}: Unexpected parent type {type(parent).name}")
            # todo: are there any other cases here actually?


    # tbh it's not hard to write a brace balancer
    for match in PARAMETER_REGEX.finditer(raw):
        # first emit the string fragment between the last match and this one
        if match.pos > 0:
            yield raw[pos:match.pos]
            pos = match.pos

        # now figure out which type of parameter it is


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

    # Handle {Var:diff()} and {Var:inverseDiff()} -> value
    # Both formatters just output the value; the difference is only UI highlight direction in-game
    def resolve_diff(m):
        val = _lookup(m.group(1), vars_dict)
        return str(val) if val is not None else "X"

    text = re.sub(r"\{(\w+):(?:diff|inverseDiff)\(\)\}", resolve_diff, text)

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