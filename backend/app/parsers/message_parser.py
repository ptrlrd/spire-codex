"""
SmartFormat message templates: lexer, parser, unparser, and ICU MessageFormat export.

The game localizes its text with a SmartFormat subset. This module parses those templates
into a ParsedMessage tree without resolving any game data (description_resolver does that),
reproduces the original syntax from the tree (unparse), and exports the tree as an ICU
MessageFormat string that next-intl can load directly (to_icu / message_to_icu / convert_table).

Grammar, as far as the game data shows it:
    TEMPLATE                 = { text | PLACEHOLDER }
    PLACEHOLDER              = "{", [ variable ], [ ":", FUNCTION_OR_SUBTEMPLATE ], "}"
    FUNCTION_OR_SUBTEMPLATE  = "cond", ":", CONDITIONAL_OPTIONS
                             | function, [ "(", [ ARGUMENTS ], ")" ], [ ":", SUBTEMPLATE ]
                             | SUBTEMPLATE
    ARGUMENTS                = word, { "|", word }
    CONDITIONAL_OPTIONS      = { CONDITION, "?", TEMPLATE, "|" }, SUBTEMPLATE
    SUBTEMPLATE              = TEMPLATE, { "|", TEMPLATE }
    CONDITION                = ( ">" | "<" | ">=" | "<=" | "==" | "!=" ), int
"{{" and "}}" are literal braces in text; a backslash before a delimiter also makes it literal.

ICU export conventions:
- {Var} and every value-only formatter ({Var:diff()}, inverseDiff, n, abs, percentMore,
  percentLess, list) become {Var}. Coloring and sign display are a UI concern.
- {} (the current value) becomes # inside a plural body, otherwise the enclosing
  conditional's variable, otherwise {value}.
- {Var:plural:a|b} follows SmartFormat's plural rule for the table's language (pass it as
  language=; an explicit {Var:plural(ru):...} argument overrides it, as in the engine).
  English-style languages: two options -> one/other, three -> =0/one/other, four ->
  =0/=1/other (pt-BR uses =1 since CLDR "one" covers 0 there; French the same for three
  and four). Polish and Russian: one/few/many with other repeating the last option.
  Chinese, Japanese, Korean, Thai and Indonesian use the engine's "singular" rule, which
  always renders the first option, so only that option is emitted (plural_singular_rule).
- {Var:choose:a|b} with no key list is what translators use as a count switch; it becomes
  {Var, plural, =1 {a} other {b}} (three options -> =0/=1/other). In the engine it is a
  select on the empty key and always shows the last option.
- {Var:choose(1):a|b} with integer keys -> {Var, plural, =1 {a} other {b}}, with {} -> #.
  Other keys that are not \\w+ are sanitised the same way as variables and listed in
  renamed_keys; the caller must sanitise the value it passes with the same rule.
- Numeric conditions become plurals with exact matches when the whole chain can be decided
  from the values 0..N (operators >, >=, ==, != with thresholds up to EXACT_MATCH_LIMIT).
  Chains that cannot (any < or <=, a negative threshold, or a large one) select on derived
  booleans: {Var_cond, select, true {a} other {b}}. Derived names are unique within a
  message and numbered in source order across every chain and truthiness select on that
  variable: Var_cond, Var_cond2, Var_cond3. The caller computes each one from Var using the
  (var, op, threshold, derived_name) rows the report lists under derived_conditions.
- Bare {X:a|b}, {X:show:a|b} and conditions without a comparison select on the variable:
  {X, select, true {a} other {b}}. When the body also prints the value ({} inside), the
  selector is a derived X_cond instead, reported as (var, "truthy", None, derived_name), so
  the value can still be interpolated.
- {Key:choose(A|B):x|y|z} -> {Key, select, A {x} B {y} other {z}}.
- {V:energyIcons(n)} -> "[E]" repeated n times, starIcons -> "[S]". Without a count the
  caller supplies the rendered icons as {V}; the report counts these as energyIcons_variable.
- Variable names outside [A-Za-z_][A-Za-z0-9_]* are sanitised and listed in
  renamed_variables.
- Every exported string is checked with icu_check.validate_icu; one that fails is counted
  under invalid_icu and unconvertible and falls back to the quoted literal.
"""

import re
from collections import Counter
from collections.abc import Generator
from dataclasses import MISSING, dataclass, field
from enum import IntEnum, StrEnum, auto

try:
    from app.parsers.icu_check import validate_icu
except ImportError:
    from icu_check import validate_icu


class ComparisonOperator(StrEnum):
    GREATER_THAN = ">"
    LESS_THAN = "<"
    GREATER_THAN_OR_EQUAL = ">="
    LESS_THAN_OR_EQUAL = "<="
    EQUAL = "=="
    NOT_EQUAL = "!="

    def evaluate(self, value: int, threshold: int) -> bool:
        match self:
            case ComparisonOperator.GREATER_THAN:
                return value > threshold
            case ComparisonOperator.LESS_THAN:
                return value < threshold
            case ComparisonOperator.GREATER_THAN_OR_EQUAL:
                return value >= threshold
            case ComparisonOperator.LESS_THAN_OR_EQUAL:
                return value <= threshold
            case ComparisonOperator.EQUAL:
                return value == threshold
            case ComparisonOperator.NOT_EQUAL:
                return value != threshold
        raise ValueError(self)


@dataclass(frozen=True)
class MessageCondition:
    operator: ComparisonOperator
    threshold: int


class DelimiterKind(StrEnum):
    BRACE_OPEN = "{"
    BRACE_CLOSE = "}"
    PAREN_OPEN = "("
    PAREN_CLOSE = ")"
    BAR = "|"
    COLON = ":"
    END = ""


class TextKind(IntEnum):
    GENERIC = 0
    VARIABLE = auto()
    FUNCTION = auto()
    ARGUMENT = auto()


class ConditionKind(StrEnum):
    CONDITION = "cond"


class LexerState(IntEnum):
    TEMPLATE = 0
    PLACEHOLDER = auto()
    ARGUMENTS = auto()
    ARGUMENTS_END = auto()
    ARGUMENTS_END_SCANNED = auto()
    SUBTEMPLATE = auto()
    SUBTEMPLATE_SCANNED = auto()
    FUNCTION_OR_SUBTEMPLATE = auto()
    CONDITION_OPTION_START = auto()
    CONDITION_OPTION = auto()
    CONDITION_OPTION_SCANNED = auto()


type TokenKind = DelimiterKind | TextKind | ConditionKind
type Token = (
    tuple[DelimiterKind, None, int]
    | tuple[TextKind, str, int]
    | tuple[ConditionKind, MessageCondition, int]
)


class MessageSyntaxError(Exception):
    """A None position means the end of the message."""

    def __init__(self, message: str, position: int | None = None):
        super().__init__(message)
        self.position = position


class LexicalError(MessageSyntaxError):
    def __init__(self, state: LexerState, position: int | None = None):
        super().__init__(
            f"Could not find a delimiter that satisfies the state/rule: {state.name}.",
            position,
        )


class UnexpectedTokenError(MessageSyntaxError):
    def __init__(self, token: Token | None, expectation: str):
        match token:
            case None:
                result = "end of message"
                position = None
            case (kind, value, pos):
                position = pos
                if isinstance(kind, DelimiterKind):
                    result = f"'{kind.value}'"
                else:
                    result = f"{kind.name}({value})"
            case bad:
                raise ValueError(f"Not a token: {bad}")
        super().__init__(f"Expected {expectation} but got {result}.", position)


type ParsedMessage = list[str | Placeholder]


def fn_name_field(value: str | None = None):
    return field(default=value, kw_only=True)


@dataclass(frozen=True)
class ConditionalMessage:
    condition: MessageCondition | None
    content: ParsedMessage


@dataclass(frozen=True)
class Placeholder:
    """{variable}; the variable is None for the current-value placeholder {}."""

    variable: str | None


@dataclass(frozen=True)
class FunctionPlaceholder(Placeholder):
    """{variable:name()} formatters that only change how the value is displayed."""

    fn_name: str | None = fn_name_field(MISSING)


@dataclass(frozen=True)
class RepeatPlaceholder(FunctionPlaceholder):
    """energyIcons(n) and starIcons(n); n is None when the count comes from the variable."""

    n: int | None


@dataclass(frozen=True)
class ConditionalPlaceholder(FunctionPlaceholder):
    """
    Option lists chosen by the value: bare {X:a|b}, {X::a|b}, show, plural and list.
    fn_name is None for the bare form and "" for an explicitly empty formatter name.
    """

    fn_name: str | None = fn_name_field(None)
    args: list[str] | None = field(default=None, kw_only=True)
    options: list[ParsedMessage]


@dataclass(frozen=True)
class NumericConditionPlaceholder(FunctionPlaceholder):
    """{X:cond:>1?a|==1?b|c}: options guarded by comparisons, the last one unguarded."""

    fn_name: str = fn_name_field("cond")
    options: list[ConditionalMessage]


@dataclass(frozen=True)
class ChoosePlaceholder(ConditionalPlaceholder):
    fn_name: str = fn_name_field("choose")
    keys: list[str]


SIMPLE_FUNCTIONS = frozenset(
    {"diff", "inverseDiff", "percentLess", "percentMore", "n", "abs"}
)
REPEAT_FUNCTIONS = frozenset({"energyIcons", "starIcons"})
OPTION_FUNCTIONS = frozenset({"show", "cond", "plural", "list"})

CONDITION_REGEX = re.compile(r"\s*(>=|<=|!=|>|<|==)\s*(-?\d+)\s*")
CONDITION_PREFIX_REGEX = re.compile(r"\s*(>=|<=|!=|>|<|==)\s*(-?\d+)\s*\?")
IDENTIFIER_REGEX = re.compile(r"\w+")
WORD_CHAR_REGEX = re.compile(r"\w")


def parse_cond_expression(
    expression: str, position: int | None = None
) -> MessageCondition:
    parts = CONDITION_REGEX.fullmatch(expression)
    if not parts:
        raise MessageSyntaxError(
            f"Expected a numerical comparison such as >1 but got '{expression}'.",
            position,
        )
    return MessageCondition(ComparisonOperator(parts.group(1)), int(parts.group(2)))


def _unescape_text(fragment: str, top_level: bool) -> str:
    fragment = fragment.replace("{{", "{")
    if top_level:
        fragment = fragment.replace("}}", "}")
    return fragment


def _escape_text(text: str) -> str:
    return text.replace("{", "{{").replace("}", "}}")


def lex(message: str) -> Generator[Token, None, None]:
    """
    Generates a stream of tokens from the original message.
    The lexer carries a state stack so it knows which delimiters end the current fragment,
    and it stays permissive where that gives better error positions than failing early.
    """
    states: list[LexerState] = [LexerState.TEMPLATE]
    state = LexerState.TEMPLATE
    delimiter = ""
    fragment = ""
    fragment_pos = 0
    position = 0
    delimiter_pos = -1

    def scan(*targets: str):
        nonlocal delimiter, fragment, fragment_pos, delimiter_pos
        i = position
        while i < len(message):
            char = message[i]
            if char == "\\":
                i += 2
                continue
            if char == "{" and message[i + 1 : i + 2] == "{":
                i += 2
                continue
            if char in targets:
                delimiter = char
                fragment = message[position:i]
                fragment_pos = position
                delimiter_pos = i
                return
            i += 1
        raise LexicalError(state, position)

    while states:
        position = delimiter_pos + 1
        state = states.pop()
        match state:
            case LexerState.TEMPLATE:
                try:
                    scan("{")
                except LexicalError:
                    if position < len(message):
                        yield (
                            TextKind.GENERIC,
                            _unescape_text(message[position:], True),
                            position,
                        )
                    continue
                states.append(LexerState.TEMPLATE)
                if fragment:
                    yield (TextKind.GENERIC, _unescape_text(fragment, True), position)
                yield (DelimiterKind.BRACE_OPEN, None, delimiter_pos)
                states.append(LexerState.PLACEHOLDER)
            case LexerState.PLACEHOLDER:
                scan(":", "}")
                if fragment:
                    yield (TextKind.VARIABLE, fragment, position)
                match delimiter:
                    case ":":
                        yield (DelimiterKind.COLON, None, delimiter_pos)
                        states.append(LexerState.FUNCTION_OR_SUBTEMPLATE)
                    case "}":
                        yield (DelimiterKind.BRACE_CLOSE, None, delimiter_pos)
            case LexerState.FUNCTION_OR_SUBTEMPLATE:
                head = message[position : position + 1]
                if head == ":":
                    delimiter_pos = position
                    yield (TextKind.FUNCTION, "", position)
                    yield (DelimiterKind.COLON, None, position)
                    states.append(LexerState.SUBTEMPLATE)
                elif head and WORD_CHAR_REGEX.match(head):
                    scan("(", ":", "|", "{", "}")
                    if delimiter in ("(", ":") and IDENTIFIER_REGEX.fullmatch(fragment):
                        yield (TextKind.FUNCTION, fragment, position)
                        if delimiter == "(":
                            yield (DelimiterKind.PAREN_OPEN, None, delimiter_pos)
                            states.append(LexerState.ARGUMENTS)
                        else:
                            yield (DelimiterKind.COLON, None, delimiter_pos)
                            states.append(
                                LexerState.CONDITION_OPTION_START
                                if fragment == "cond"
                                else LexerState.SUBTEMPLATE
                            )
                    else:
                        if delimiter in ("(", ":"):
                            scan("|", "{", "}")
                        states.append(LexerState.SUBTEMPLATE_SCANNED)
                else:
                    states.append(LexerState.SUBTEMPLATE)
            case LexerState.ARGUMENTS:
                scan("|", ")", ":", "{", "}")
                match delimiter:
                    case ":" | "{" | "}":
                        states.append(LexerState.ARGUMENTS_END_SCANNED)
                    case _:
                        if fragment:
                            yield (TextKind.ARGUMENT, fragment, position)
                        match delimiter:
                            case "|":
                                yield (DelimiterKind.BAR, None, delimiter_pos)
                                states.append(LexerState.ARGUMENTS)
                            case ")":
                                yield (DelimiterKind.PAREN_CLOSE, None, delimiter_pos)
                                states.append(LexerState.ARGUMENTS_END)
            case LexerState.ARGUMENTS_END:
                scan(":", "|", "{", "}")
                states.append(LexerState.ARGUMENTS_END_SCANNED)
            case LexerState.ARGUMENTS_END_SCANNED:
                match delimiter:
                    case ":":
                        yield (DelimiterKind.COLON, None, delimiter_pos)
                        states.append(LexerState.SUBTEMPLATE)
                    case _:
                        states.append(LexerState.SUBTEMPLATE_SCANNED)
            case LexerState.CONDITION_OPTION_START:
                condition = CONDITION_PREFIX_REGEX.match(message, position)
                if condition:
                    yield (
                        ConditionKind.CONDITION,
                        parse_cond_expression(condition.group()[:-1], position),
                        position,
                    )
                    delimiter_pos = condition.end() - 1
                states.append(LexerState.CONDITION_OPTION)
            case LexerState.CONDITION_OPTION:
                scan("|", "{", "}")
                states.append(LexerState.CONDITION_OPTION_SCANNED)
            case LexerState.SUBTEMPLATE:
                scan("|", "{", "}")
                states.append(LexerState.SUBTEMPLATE_SCANNED)
            case LexerState.SUBTEMPLATE_SCANNED | LexerState.CONDITION_OPTION_SCANNED:
                if fragment:
                    yield (
                        TextKind.GENERIC,
                        _unescape_text(fragment, False),
                        fragment_pos,
                    )
                conditional = state == LexerState.CONDITION_OPTION_SCANNED
                match delimiter:
                    case "}":
                        yield (DelimiterKind.BRACE_CLOSE, None, delimiter_pos)
                    case "|":
                        states.append(
                            LexerState.CONDITION_OPTION_START
                            if conditional
                            else LexerState.SUBTEMPLATE
                        )
                        yield (DelimiterKind.BAR, None, delimiter_pos)
                    case "{":
                        states.append(
                            LexerState.CONDITION_OPTION
                            if conditional
                            else LexerState.SUBTEMPLATE
                        )
                        yield (DelimiterKind.BRACE_OPEN, None, delimiter_pos)
                        states.append(LexerState.PLACEHOLDER)


def parse(message: str) -> ParsedMessage:
    """Parse a SmartFormat template into a ParsedMessage. Raises MessageSyntaxError."""
    tokens = lex(message)
    current: Token | None = None

    def advance():
        nonlocal current
        current = next(tokens, None)
        return current

    def consume(expected: DelimiterKind):
        match advance():
            case (kind, _, _) if kind == expected:
                pass
            case bad:
                raise UnexpectedTokenError(bad, f"'{expected.value}'")

    def collect_message() -> ParsedMessage:
        result = []
        while True:
            match current:
                case (TextKind.GENERIC, value, _):
                    result.append(value)
                    advance()
                case (DelimiterKind.BRACE_OPEN, _, _):
                    result.append(collect_placeholder())
                case _:
                    return result

    def generate_options() -> Generator[ParsedMessage, None, None]:
        while True:
            template = collect_message()
            match current:
                case (DelimiterKind.BRACE_CLOSE, _, _):
                    yield template
                    break
                case (DelimiterKind.BAR, _, _):
                    advance()
                    yield template
                case _:
                    raise UnexpectedTokenError(
                        current, "a template option made of text or placeholders"
                    )

    def collect_options() -> list[ParsedMessage]:
        return list(generate_options())

    def collect_conditional_options() -> list[ConditionalMessage]:
        result = []
        options = generate_options()
        saw_unconditional = False
        while True:
            match current:
                case (ConditionKind.CONDITION, condition, _):
                    if saw_unconditional:
                        raise UnexpectedTokenError(
                            current,
                            "no further conditions after the unconditional option",
                        )
                    advance()
                case _:
                    saw_unconditional = True
                    condition = None
            option = next(options, None)
            if option is None:
                break
            result.append(ConditionalMessage(condition, option))
        return result

    def collect_keys() -> list[str]:
        had_arg = False
        seen: set[str] = set()
        result: list[str] = []
        while True:
            match advance():
                case (DelimiterKind.PAREN_CLOSE, _, _) if had_arg:
                    break
                case (DelimiterKind.BAR, _, _) if had_arg:
                    had_arg = False
                case (TextKind.ARGUMENT, arg, _) if not had_arg and arg not in seen:
                    seen.add(arg)
                    result.append(arg)
                    had_arg = True
                case bad if had_arg:
                    raise UnexpectedTokenError(bad, "'|' or ')'")
                case bad:
                    raise UnexpectedTokenError(bad, "a unique and non-empty argument")
        return result

    def collect_function(var_name: str | None, fn_name: str, position: int):
        if fn_name in OPTION_FUNCTIONS or fn_name in ("", "choose"):
            args = None
            match advance():
                case (DelimiterKind.PAREN_OPEN, _, _):
                    args = collect_keys()
                    consume(DelimiterKind.COLON)
                case (DelimiterKind.COLON, _, _):
                    pass
                case bad:
                    raise UnexpectedTokenError(
                        bad, "':' or '(' after the formatter name"
                    )
            advance()
            if fn_name == "cond":
                if args is not None:
                    raise MessageSyntaxError("'cond' takes no arguments.", position)
                return NumericConditionPlaceholder(
                    var_name, collect_conditional_options()
                )
            options = collect_options()
            if fn_name == "choose" and args is not None:
                if len(options) < len(args) or len(options) > len(args) + 1:
                    raise MessageSyntaxError(
                        f"Expected {len(args)} or {len(args) + 1} options for "
                        f"{len(args)} 'choose' keys but got {len(options)}.",
                        current[2] if current else None,
                    )
                return ChoosePlaceholder(var_name, options, args)
            return ConditionalPlaceholder(var_name, options, fn_name=fn_name, args=args)
        consume(DelimiterKind.PAREN_OPEN)
        if fn_name in REPEAT_FUNCTIONS:
            match advance():
                case (TextKind.ARGUMENT, arg, arg_position):
                    try:
                        n = int(arg)
                    except ValueError as error:
                        raise MessageSyntaxError(
                            f"Expected an integer argument but got '{arg}'.",
                            arg_position,
                        ) from error
                    consume(DelimiterKind.PAREN_CLOSE)
                case (DelimiterKind.PAREN_CLOSE, _, _):
                    n = None
                case bad:
                    raise UnexpectedTokenError(bad, "an integer or ')'")
            result = RepeatPlaceholder(var_name, n, fn_name=fn_name)
        elif fn_name in SIMPLE_FUNCTIONS:
            consume(DelimiterKind.PAREN_CLOSE)
            result = FunctionPlaceholder(var_name, fn_name=fn_name)
        else:
            raise MessageSyntaxError(
                f"Unrecognised template function '{fn_name}'.", position
            )
        advance()
        return result

    def collect_placeholder() -> Placeholder:
        match advance():
            case (TextKind.VARIABLE | DelimiterKind.COLON, var_name, _):
                if current[0] == TextKind.VARIABLE:
                    advance()
                match current:
                    case (DelimiterKind.COLON, _, _):
                        match advance():
                            case (TextKind.FUNCTION, fn_name, position):
                                result = collect_function(var_name, fn_name, position)
                            case _:
                                result = ConditionalPlaceholder(
                                    var_name, collect_options()
                                )
                    case (DelimiterKind.BRACE_CLOSE, _, _):
                        result = Placeholder(var_name)
                    case bad:
                        raise UnexpectedTokenError(
                            bad, "':' or '}' after a placeholder's variable name"
                        )
            case (DelimiterKind.BRACE_CLOSE, _, _):
                result = Placeholder(None)
            case bad:
                raise UnexpectedTokenError(bad, "a variable name")
        match current:
            case (DelimiterKind.BRACE_CLOSE, _, _):
                advance()
            case bad:
                raise UnexpectedTokenError(bad, "a '}' to end the placeholder")
        return result

    try:
        advance()
        result = collect_message()
        if current is not None:
            raise UnexpectedTokenError(current, "end of message")
        return result
    except MessageSyntaxError as error:
        position = len(message) if error.position is None else error.position
        single_line = message.replace("\n", " ")
        raise MessageSyntaxError(
            f"Failed to parse message at position {position}: {error}\n"
            f"{single_line}\n{'-' * max(0, position)}^",
            position,
        ) from error


def unparse(parsed: ParsedMessage) -> str:
    """Compile a ParsedMessage back into the game's original syntax."""
    return "".join(unparse_recursively(parsed))


def unparse_recursively(parsed: ParsedMessage) -> Generator[str, None, None]:
    def inject_bars(content):
        first = True
        for each in content:
            if not first:
                yield "|"
            first = False
            yield from each

    for part in parsed:
        match part:
            case RepeatPlaceholder(variable, n, fn_name=fn_name):
                yield "{"
                if variable:
                    yield variable
                yield ":"
                yield fn_name
                yield "("
                yield "" if n is None else str(n)
                yield ")}"
            case ChoosePlaceholder(variable, options, keys, fn_name=fn_name):
                yield "{"
                if variable:
                    yield variable
                yield ":"
                yield fn_name
                yield "("
                yield from inject_bars(keys)
                yield "):"
                yield from inject_bars(map(unparse_recursively, options))
                yield "}"
            case NumericConditionPlaceholder(variable, options, fn_name=fn_name):
                yield "{"
                if variable:
                    yield variable
                yield ":"
                yield fn_name
                yield ":"
                yield from inject_bars(
                    map(unparse_conditional_message_recursively, options)
                )
                yield "}"
            case ConditionalPlaceholder(variable, options, fn_name=fn_name, args=args):
                yield "{"
                if variable:
                    yield variable
                yield ":"
                if fn_name is not None:
                    yield fn_name
                    if args is not None:
                        yield "("
                        yield from inject_bars(args)
                        yield ")"
                    yield ":"
                yield from inject_bars(map(unparse_recursively, options))
                yield "}"
            case FunctionPlaceholder(variable, fn_name=fn_name):
                yield "{"
                if variable:
                    yield variable
                yield ":"
                yield fn_name
                yield "()}"
            case Placeholder(variable):
                yield "{"
                if variable:
                    yield variable
                yield "}"
            case text if isinstance(text, str):
                yield _escape_text(text)
            case bad:
                raise ValueError(f"Unrecognised message part: {bad}")


def unparse_conditional_message_recursively(
    message: ConditionalMessage,
) -> Generator[str, None, None]:
    if message.condition is not None:
        yield message.condition.operator.value
        yield str(message.condition.threshold)
        yield "?"
    yield from unparse_recursively(message.content)


ICU_IDENTIFIER_REGEX = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
ICU_UNSAFE_CHAR_REGEX = re.compile(r"[^A-Za-z0-9_]")
BACKSLASH_ESCAPE_REGEX = re.compile(r"\\([{}|:()?\\])")
TAG_START_REGEX = re.compile(r"<(?=[A-Za-z/])")
EXACT_MATCH_LIMIT = 10
PLURAL_SAFE_OPERATORS = frozenset(
    {
        ComparisonOperator.GREATER_THAN,
        ComparisonOperator.GREATER_THAN_OR_EQUAL,
        ComparisonOperator.EQUAL,
        ComparisonOperator.NOT_EQUAL,
    }
)
REPEAT_ICONS = {"energyIcons": "[E]", "starIcons": "[S]"}
LANGUAGE_CODES = {
    "eng": "en",
    "zhs": "zh",
    "zht": "zh",
    "deu": "de",
    "esp": "es",
    "fra": "fr",
    "ind": "id",
    "ita": "it",
    "jpn": "ja",
    "kor": "ko",
    "pol": "pl",
    "ptb": "pt",
    "rus": "ru",
    "spa": "es",
    "tha": "th",
    "tur": "tr",
}
PLURAL_RULES = {
    "en": "dual",
    "de": "dual",
    "es": "dual",
    "it": "dual",
    "tr": "dual",
    "pt": "dual_exact",
    "fr": "french",
    "pl": "slavic",
    "ru": "slavic",
    "zh": "singular",
    "ja": "singular",
    "ko": "singular",
    "th": "singular",
    "id": "singular",
}
DEFAULT_PLURAL_RULE = "dual"
ICU_KEY_REGEX = re.compile(r"\w+")
ICU_UNSAFE_KEY_CHAR_REGEX = re.compile(r"\W")
INTEGER_REGEX = re.compile(r"[0-9]+")
MAX_EXAMPLES = 20


class IcuConversionError(Exception):
    pass


class ConversionReport:
    def __init__(self):
        self.constructs: Counter[str] = Counter()
        self.unconvertible = 0
        self.unconvertible_examples: list[str] = []
        self.invalid_icu = 0
        self.invalid_icu_examples: list[str] = []
        self.derived_conditions: list[tuple[str, str, int | None, str]] = []
        self.renamed_variables: dict[str, str] = {}
        self.renamed_keys: dict[str, str] = {}

    def merge(self, other: "ConversionReport"):
        self.constructs.update(other.constructs)
        self.unconvertible += other.unconvertible
        for example in other.unconvertible_examples:
            if len(self.unconvertible_examples) < MAX_EXAMPLES:
                self.unconvertible_examples.append(example)
        self.invalid_icu += other.invalid_icu
        for example in other.invalid_icu_examples:
            if len(self.invalid_icu_examples) < MAX_EXAMPLES:
                self.invalid_icu_examples.append(example)
        self.derived_conditions.extend(other.derived_conditions)
        self.renamed_variables.update(other.renamed_variables)
        self.renamed_keys.update(other.renamed_keys)

    def as_dict(self) -> dict:
        return {
            "constructs": dict(sorted(self.constructs.items())),
            "unconvertible": self.unconvertible,
            "unconvertible_examples": list(self.unconvertible_examples),
            "invalid_icu": self.invalid_icu,
            "invalid_icu_examples": list(self.invalid_icu_examples),
            "derived_conditions": list(self.derived_conditions),
            "renamed_variables": dict(self.renamed_variables),
            "renamed_keys": dict(self.renamed_keys),
        }


def escape_icu_text(text: str, in_plural: bool = False) -> str:
    """Quote ICU syntax characters in literal text. Newlines pass through unchanged."""
    special = "{}<" if not in_plural else "{}<#"
    out: list[str] = []
    quoting = False
    for i, char in enumerate(text):
        if char == "'":
            out.append("''")
        elif char in special and (char != "<" or TAG_START_REGEX.match(text, i)):
            if not quoting:
                out.append("'")
                quoting = True
            out.append(char)
        else:
            if quoting:
                out.append("'")
                quoting = False
            out.append(char)
    if quoting:
        out.append("'")
    return "".join(out)


def _references_current_value(parts: ParsedMessage) -> bool:
    for part in parts:
        match part:
            case ConditionalPlaceholder() | NumericConditionPlaceholder():
                continue
            case Placeholder(variable=None):
                return True
    return False


def plural_rule(language: str | None) -> str | None:
    """The SmartFormat plural rule family for a game language code or culture name."""
    if not language:
        return None
    code = language.strip().lower()
    code = LANGUAGE_CODES.get(code, code.split("-")[0])
    return PLURAL_RULES.get(code)


def _plural_cases(rule: str, bodies: list[str]) -> list[tuple[str, str]]:
    n = len(bodies)
    match rule:
        case "dual" | "dual_exact":
            one = "one" if rule == "dual" else "=1"
            if n == 2:
                return [(one, bodies[0]), ("other", bodies[1])]
            if n == 3:
                return [("=0", bodies[0]), (one, bodies[1]), ("other", bodies[2])]
            if n == 4:
                return [("=0", bodies[1]), ("=1", bodies[2]), ("other", bodies[3])]
        case "french":
            if n == 2:
                return [("one", bodies[0]), ("other", bodies[1])]
            if n == 3:
                return [("=0", bodies[0]), ("=1", bodies[1]), ("other", bodies[2])]
            if n == 4:
                return [("=0", bodies[1]), ("=1", bodies[2]), ("other", bodies[3])]
        case "slavic":
            if n == 2:
                return [("one", bodies[0]), ("other", bodies[1])]
            if n in (3, 4):
                return [
                    ("one", bodies[0]),
                    ("few", bodies[1]),
                    ("many", bodies[2]),
                    ("other", bodies[-1]),
                ]
    raise IcuConversionError(f"plural with {n} options under the {rule} rule")


def _exact_cases(bodies: list[str]) -> list[tuple[str, str]]:
    if len(bodies) == 2:
        return [("=1", bodies[0]), ("other", bodies[1])]
    if len(bodies) == 3:
        return [("=0", bodies[0]), ("=1", bodies[1]), ("other", bodies[2])]
    raise IcuConversionError(f"keyless choose with {len(bodies)} options")


class _IcuWriter:
    def __init__(self, report: ConversionReport, language: str | None = None):
        self.report = report
        self.rule = plural_rule(language) or DEFAULT_PLURAL_RULE
        self.derived_counts: Counter[str] = Counter()

    def derived(self, name: str, variable: str | None, op: str, threshold) -> str:
        self.derived_counts[name] += 1
        count = self.derived_counts[name]
        derived = name + "_cond" + (str(count) if count > 1 else "")
        self.report.derived_conditions.append(
            (variable or name, op, threshold, derived)
        )
        return derived

    def note(self, construct: str, count: int = 1):
        self.report.constructs[construct] += count

    def name(self, variable: str) -> str:
        if ICU_IDENTIFIER_REGEX.fullmatch(variable):
            return variable
        renamed = ICU_UNSAFE_CHAR_REGEX.sub("_", variable)
        if not ICU_IDENTIFIER_REGEX.match(renamed):
            renamed = "_" + renamed
        self.report.renamed_variables[variable] = renamed
        return renamed

    def text(self, text: str, context: list) -> str:
        unescaped, backslashes = BACKSLASH_ESCAPE_REGEX.subn(r"\1", text)
        braces = unescaped.count("{") + unescaped.count("}")
        if backslashes or braces:
            self.note("escapes", backslashes + braces)
        in_plural = bool(context) and context[-1][1]
        return escape_icu_text(unescaped, in_plural)

    def current_value(self, context: list) -> str:
        if not context:
            return "{value}"
        name, is_plural = context[-1]
        return "#" if is_plural else "{" + name + "}"

    def value(self, variable: str | None, context: list) -> str:
        if variable is None:
            return self.current_value(context)
        return "{" + self.name(variable) + "}"

    def message(self, parts: ParsedMessage, context: list) -> str:
        return "".join(self.part(part, context) for part in parts)

    def part(self, part, context: list) -> str:
        match part:
            case str():
                return self.text(part, context)
            case RepeatPlaceholder(variable, n, fn_name=fn_name):
                self.note(fn_name)
                if n is None:
                    self.note(fn_name + "_variable")
                    return self.value(variable, context)
                return REPEAT_ICONS[fn_name] * n
            case ChoosePlaceholder(variable, options, keys):
                self.note("choose")
                return self.choose(variable, options, keys, context)
            case NumericConditionPlaceholder(variable, options):
                self.note("cond")
                return self.numeric_condition(variable, options, context)
            case ConditionalPlaceholder(variable, options, fn_name=fn_name, args=args):
                return self.conditional(variable, options, fn_name, args, context)
            case FunctionPlaceholder(variable, fn_name=fn_name):
                self.note(fn_name)
                return self.value(variable, context)
            case Placeholder(variable):
                self.note("variable" if variable else "current_value")
                return self.value(variable, context)
        raise IcuConversionError(f"Unrecognised message part: {part!r}")

    def selector_name(self, variable: str | None, context: list) -> str:
        if variable is not None:
            return self.name(variable)
        if context:
            return context[-1][0]
        return "value"

    @staticmethod
    def select(name: str, cases: list[tuple[str, str]]) -> str:
        body = " ".join(f"{key} {{{text}}}" for key, text in cases)
        return "{" + name + ", select, " + body + "}"

    @staticmethod
    def plural(name: str, cases: list[tuple[str, str]]) -> str:
        body = " ".join(f"{key} {{{text}}}" for key, text in cases)
        return "{" + name + ", plural, " + body + "}"

    def key(self, key: str) -> str:
        if ICU_KEY_REGEX.fullmatch(key) and key != "other":
            return key
        renamed = ICU_UNSAFE_KEY_CHAR_REGEX.sub("_", key)
        if not renamed or renamed == "other":
            raise IcuConversionError(f"choose key '{key}' is not an ICU select key")
        self.report.renamed_keys[key] = renamed
        return renamed

    def choose(self, variable, options, keys, context) -> str:
        name = self.selector_name(variable, context)
        numeric = all(INTEGER_REGEX.fullmatch(key) for key in keys)
        inner = context + [(name, numeric)]
        bodies = [self.message(option, inner) for option in options]
        other = bodies[len(keys)] if len(bodies) > len(keys) else ""
        if numeric:
            self.note("choose_numeric")
            cases = [(f"={int(key)}", body) for key, body in zip(keys, bodies)]
            return self.plural(name, cases + [("other", other)])
        cases = [(self.key(key), body) for key, body in zip(keys, bodies)]
        return self.select(name, cases + [("other", other)])

    def plural_options(self, name, options, args, context) -> str:
        rule = self.rule
        if args:
            self.note("plural_lang_arg")
            rule = plural_rule(args[0])
            if rule is None:
                raise IcuConversionError(f"unknown plural language '{args[0]}'")
        if rule == "singular":
            self.note("plural_singular_rule")
            return self.message(options[0], context + [(name, False)])
        inner = context + [(name, True)]
        bodies = [self.message(option, inner) for option in options]
        return self.plural(name, _plural_cases(rule, bodies))

    def conditional(self, variable, options, fn_name, args, context) -> str:
        name = self.selector_name(variable, context)
        match fn_name:
            case "plural":
                self.note("plural")
                return self.plural_options(name, options, args, context)
            case "choose":
                self.note("choose_keyless")
                inner = context + [(name, True)]
                bodies = [self.message(option, inner) for option in options]
                return self.plural(name, _exact_cases(bodies))
            case "list":
                self.note("list")
                return "{" + name + "}"
            case "show":
                self.note("show")
            case None | "":
                self.note("bare_conditional")
            case _:
                raise IcuConversionError(f"conditional formatter '{fn_name}'")
        return self.truthiness(name, variable, options, context)

    def truthiness(self, name, variable, options, context) -> str:
        if len(options) > 2:
            raise IcuConversionError(f"truthiness with {len(options)} options")
        inner = context + [(name, False)]
        bodies = [self.message(option, inner) for option in options]
        selector = name
        if any(_references_current_value(option) for option in options):
            selector = self.derived(name, variable, "truthy", None)
        other = bodies[1] if len(bodies) == 2 else ""
        return self.select(selector, [("true", bodies[0]), ("other", other)])

    def numeric_condition(self, variable, options, context) -> str:
        name = self.selector_name(variable, context)
        conditions = [option.condition for option in options if option.condition]
        if not conditions:
            return self.truthiness(
                name, variable, [option.content for option in options], context
            )
        if options[-1].condition is not None:
            options = options + [ConditionalMessage(None, [])]
        plural_safe = all(
            condition.operator in PLURAL_SAFE_OPERATORS
            and 0 <= condition.threshold <= EXACT_MATCH_LIMIT
            for condition in conditions
        )
        if plural_safe:
            return self.exact_match_plural(name, options, conditions, context)
        return self.derived_select(name, variable, options, context)

    def exact_match_plural(self, name, options, conditions, context) -> str:
        inner = context + [(name, True)]
        bodies = [self.message(option.content, inner) for option in options]

        def pick(value: int) -> str:
            for option, body in zip(options, bodies):
                condition = option.condition
                if condition is None or condition.operator.evaluate(
                    value, condition.threshold
                ):
                    return body
            return ""

        limit = max(condition.threshold for condition in conditions)
        other = pick(limit + 1)
        cases = [
            (f"={value}", body)
            for value in range(limit + 1)
            if (body := pick(value)) != other
        ]
        cases.append(("other", other))
        return self.plural(name, cases)

    def derived_select(self, name, variable, options, context) -> str:
        inner = context + [(name, False)]
        bodies = [self.message(option.content, inner) for option in options]
        selectors = [
            self.derived(
                name,
                variable,
                option.condition.operator.value,
                option.condition.threshold,
            )
            for option in options
            if option.condition is not None
        ]
        result = ""
        for option, body in zip(reversed(options), reversed(bodies)):
            if option.condition is None:
                result = body
                continue
            result = self.select(selectors.pop(), [("true", body), ("other", result)])
        return result


def to_icu(
    parsed: ParsedMessage,
    report: ConversionReport | None = None,
    language: str | None = None,
) -> str:
    """
    Export a ParsedMessage as ICU MessageFormat. Raises IcuConversionError.
    language is the table's game language code (eng, pol, ...) and picks the plural rule;
    None means English.
    """
    writer = _IcuWriter(report if report is not None else ConversionReport(), language)
    return writer.message(parsed, [])


def message_to_icu(
    raw: str,
    report: ConversionReport | None = None,
    key: str | None = None,
    language: str | None = None,
) -> str:
    """
    Parse and export one template. A template that cannot be parsed or mapped comes back as
    the raw text quoted as an ICU literal, counted under unconvertible in the report.
    """
    attempt = ConversionReport()
    try:
        result = to_icu(parse(raw), attempt, language)
    except (MessageSyntaxError, IcuConversionError, RecursionError):
        return _fallback(raw, report, key)
    if validate_icu(result):
        if report is not None:
            report.invalid_icu += 1
            if key is not None and len(report.invalid_icu_examples) < MAX_EXAMPLES:
                report.invalid_icu_examples.append(key)
        return _fallback(raw, report, key)
    if report is not None:
        report.merge(attempt)
    return result


def _fallback(raw: str, report: ConversionReport | None, key: str | None) -> str:
    if report is not None:
        report.unconvertible += 1
        if key is not None and len(report.unconvertible_examples) < MAX_EXAMPLES:
            report.unconvertible_examples.append(key)
    return escape_icu_text(raw)


def convert_table(table: dict, language: str | None = None) -> tuple[dict, dict]:
    """
    Convert every string leaf of a nested table to ICU. Returns (converted, report).
    Pass the table's game language code so plurals follow that language's rule.
    """
    report = ConversionReport()

    def convert(node, path: str):
        match node:
            case dict():
                return {
                    key: convert(value, f"{path}.{key}" if path else str(key))
                    for key, value in node.items()
                }
            case list():
                return [convert(value, f"{path}[{i}]") for i, value in enumerate(node)]
            case str():
                return message_to_icu(node, report, path, language)
        return node

    return convert(table, ""), report.as_dict()
