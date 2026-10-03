"""
Structural validation of ICU MessageFormat strings as next-intl (intl-messageformat) reads
them: quoting, balanced braces, argument syntax, option lists with an "other" case, and
angle brackets that would start a tag.
"""

import re

ARGUMENT_TYPES = frozenset(
    {"plural", "selectordinal", "select", "number", "date", "time"}
)
OPTION_TYPES = frozenset({"plural", "selectordinal", "select"})
PLURAL_TYPES = frozenset({"plural", "selectordinal"})
NAME_REGEX = re.compile(r"[A-Za-z_][A-Za-z0-9_]*|[0-9]+")
WORD_REGEX = re.compile(r"[A-Za-z]+")
KEY_REGEX = re.compile(r"=[0-9]+|[^\s{}]+")
OFFSET_REGEX = re.compile(r"offset\s*:\s*[0-9]+")


def validate_icu(message: str) -> list[str]:
    errors: list[str] = []
    end = _parse_message(message, 0, None, 0, errors)
    if end < len(message):
        errors.append(f"unbalanced '}}' at {end}")
    return errors


def _skip_ws(s: str, i: int) -> int:
    while i < len(s) and s[i].isspace():
        i += 1
    return i


def _parse_message(
    s: str, i: int, parent_type: str | None, depth: int, errors: list[str]
) -> int:
    n = len(s)
    while i < n:
        char = s[i]
        if char == "'":
            following = s[i + 1 : i + 2]
            if following == "'":
                i += 2
            elif following in ("{", "}", "<") or (
                following == "#" and parent_type in PLURAL_TYPES
            ):
                j = i + 2
                while j < n:
                    if s[j] == "'":
                        if s[j + 1 : j + 2] == "'":
                            j += 2
                            continue
                        break
                    j += 1
                if j >= n:
                    errors.append(f"unterminated quote at {i}")
                    return n
                i = j + 1
            else:
                i += 1
        elif char == "{":
            i = _parse_argument(s, i, depth, errors)
        elif char == "}":
            if depth > 0:
                return i
            errors.append(f"unbalanced '}}' at {i}")
            i += 1
        elif char == "<" and re.match(r"[A-Za-z/]", s[i + 1 : i + 2]):
            errors.append(f"unquoted '<' starts a tag at {i}")
            i += 1
        else:
            i += 1
    return n


def _recover(s: str, i: int) -> int:
    j = s.find("}", i)
    return len(s) if j < 0 else j + 1


def _parse_argument(s: str, i: int, depth: int, errors: list[str]) -> int:
    start = i
    i = _skip_ws(s, i + 1)
    name = NAME_REGEX.match(s, i)
    if not name:
        errors.append(f"bad argument name at {start}")
        return _recover(s, i)
    i = _skip_ws(s, name.end())
    if s[i : i + 1] == "}":
        return i + 1
    if s[i : i + 1] != ",":
        errors.append(f"expected ',' or '}}' after argument name at {i}")
        return _recover(s, i)
    i = _skip_ws(s, i + 1)
    kind = WORD_REGEX.match(s, i)
    if not kind or kind.group() not in ARGUMENT_TYPES:
        errors.append(f"unknown argument type at {i}")
        return _recover(s, i)
    arg_type = kind.group()
    i = _skip_ws(s, kind.end())
    if s[i : i + 1] == "}":
        if arg_type in OPTION_TYPES:
            errors.append(f"{arg_type} argument without options at {start}")
        return i + 1
    if s[i : i + 1] != ",":
        errors.append(f"expected ',' after argument type at {i}")
        return _recover(s, i)
    i = _skip_ws(s, i + 1)
    if arg_type not in OPTION_TYPES:
        return _recover(s, i)
    if arg_type in PLURAL_TYPES:
        offset = OFFSET_REGEX.match(s, i)
        if offset:
            i = _skip_ws(s, offset.end())
    keys: list[str] = []
    while True:
        i = _skip_ws(s, i)
        if i >= len(s):
            errors.append(f"unterminated {arg_type} argument at {start}")
            return len(s)
        if s[i] == "}":
            break
        key = KEY_REGEX.match(s, i)
        if not key:
            errors.append(f"bad {arg_type} option key at {i}")
            return _recover(s, i)
        keys.append(key.group())
        i = _skip_ws(s, key.end())
        if s[i : i + 1] != "{":
            errors.append(f"expected '{{' after option key '{key.group()}' at {i}")
            return _recover(s, i)
        i = _parse_message(s, i + 1, arg_type, depth + 1, errors)
        if i >= len(s):
            errors.append(f"unterminated option body for '{key.group()}' at {start}")
            return len(s)
        i += 1
    if "other" not in keys:
        errors.append(f"{arg_type} argument without an 'other' option at {start}")
    return i + 1
