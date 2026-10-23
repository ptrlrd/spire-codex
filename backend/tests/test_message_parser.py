import json
from collections import Counter
from pathlib import Path

import pytest

from app.parsers import message_parser
from app.parsers.icu_check import validate_icu
from app.parsers.message_parser import (
    ChoosePlaceholder,
    ConditionalPlaceholder,
    DelimiterKind,
    FunctionPlaceholder,
    MessageSyntaxError,
    NumericConditionPlaceholder,
    Placeholder,
    TextKind,
    convert_table,
    escape_icu_text,
    lex,
    message_to_icu,
    parse,
    parse_cond_expression,
    to_icu,
    unparse,
)

ENG_DIR = Path(
    "/mnt/c/Users/peter/Documents/prima-codex/spire-codex/extraction/beta/raw/localization/eng"
)
ENTITY_TABLES = ["cards", "relics", "potions", "powers", "monsters", "events"]


def _load_tables() -> dict[str, dict]:
    if not ENG_DIR.is_dir():
        pytest.skip(f"{ENG_DIR} is missing")
    tables = {}
    for path in sorted(ENG_DIR.glob("*.json")):
        with open(path, encoding="utf8") as f:
            tables[path.stem] = json.load(f)
    if not tables:
        pytest.skip(f"no tables under {ENG_DIR}")
    return tables


def _leaves(node, path=""):
    if isinstance(node, dict):
        for key, value in node.items():
            yield from _leaves(value, f"{path}.{key}" if path else str(key))
    elif isinstance(node, list):
        for i, value in enumerate(node):
            yield from _leaves(value, f"{path}[{i}]")
    elif isinstance(node, str):
        yield path, node


def test_round_trip_every_eng_table():
    tables = _load_tables()
    syntax_failures = []
    round_trip_failures = []
    total = 0
    for table, data in tables.items():
        for key, message in _leaves(data):
            total += 1
            try:
                parsed = parse(message)
            except MessageSyntaxError as error:
                syntax_failures.append((f"{table}.{key}", str(error).splitlines()[0]))
                continue
            if unparse(parsed) != message:
                round_trip_failures.append(f"{table}.{key}")
    print(
        f"{total} strings, {len(syntax_failures)} syntax failures, "
        f"{len(round_trip_failures)} round-trip failures"
    )
    for failure in syntax_failures[:20]:
        print("syntax:", failure)
    for failure in round_trip_failures[:20]:
        print("round trip:", failure)
    assert total > 0
    assert syntax_failures == []
    assert round_trip_failures == []


@pytest.mark.parametrize(
    "raw, expected",
    [
        (
            "This turn, your next {Attacks:cond:>1?{Attacks:diff()} Attacks are|Attack is} played an extra time.",
            "This turn, your next {Attacks, plural, =0 {Attack is} =1 {Attack is} other {{Attacks} Attacks are}} played an extra time.",
        ),
        (
            "Add {Shivs:diff()} [gold]{Cards:plural:{IfUpgraded:show:Shiv+|Shiv}|{IfUpgraded:show:Shivs+|Shivs}}[/gold] into your [gold]Hand[/gold].",
            "Add {Shivs} [gold]{Cards, plural, one {{IfUpgraded, select, true {Shiv+} other {Shiv}}} other {{IfUpgraded, select, true {Shivs+} other {Shivs}}}}[/gold] into your [gold]Hand[/gold].",
        ),
        (
            "Deal {Damage:diff()} damage{TargetType:choose(AllEnemies): to ALL enemies|}{Repeat:plural:| {} times}.{GainsBlock:cond:\nGain {CalculatedBlock:diff()} [gold]Block[/gold].|}",
            "Deal {Damage} damage{TargetType, select, AllEnemies { to ALL enemies} other {}}{Repeat, plural, one {} other { # times}}.{GainsBlock, select, true {\nGain {CalculatedBlock} [gold]Block[/gold].} other {}}",
        ),
        (
            "Add a 0{energyPrefix:energyIcons(1)} copy of this card",
            "Add a 0[E] copy of this card",
        ),
        (
            "Don't use {{braces}} or #hashtags, {Name}'s {{{Count}}} ok",
            "Don''t use '{'braces'}' or #hashtags, {Name}''s '{'{Count}'}' ok",
        ),
        (
            "{Count:plural:#1 item|{} items}",
            "{Count, plural, one {'#'1 item} other {# items}}",
        ),
        (
            "{Amount:cond:<0?Decreases|Increases} by {Amount:abs()}.",
            "{Amount_cond, select, true {Decreases} other {Increases}} by {Amount}.",
        ),
        (
            "{Amount:cond:==1? next turn|>1? for the next {} turns|}",
            "{Amount, plural, =0 {} =1 { next turn} other { for the next # turns}}",
        ),
        (
            "{Amount:cond:==1? next turn|>1? for the next {} turns|never}",
            "{Amount, plural, =0 {never} =1 { next turn} other { for the next # turns}}",
        ),
        (
            "{Who.StringValue:cond:While {} is alive|never}",
            "{Who_StringValue_cond, select, true {While {Who_StringValue} is alive} other {never}}",
        ),
        (
            "Deck {Hotkey:choose(None):| ({})}",
            "Deck {Hotkey, select, None {} other { ({Hotkey})}}",
        ),
        ("{IfUpgraded:show:+1}", "{IfUpgraded, select, true {+1} other {}}"),
        (
            "{InCombat:\n(Hits {CalculatedHits:diff()})|}",
            "{InCombat, select, true {\n(Hits {CalculatedHits})} other {}}",
        ),
        ("{Energy:energyIcons()} and {Stars:starIcons(2)}", "{Energy} and [S][S]"),
        ("{ascensions:list: +{}|\n}", "{ascensions}"),
        ("{} and {:diff()}", "{value} and {value}"),
        ("{N:plural:none|one|many}", "{N, plural, =0 {none} one {one} other {many}}"),
        (
            "{MapPointType}{ModelTitle:: {}|}",
            "{MapPointType}{ModelTitle_cond, select, true { {ModelTitle}} other {}}",
        ),
        ("<Inquisitive beeps> a < b", "'<'Inquisitive beeps> a < b"),
        ("{#%Character%_title} - {0}", "{__Character__title} - {_0}"),
    ],
)
def test_exact_icu(raw, expected):
    assert message_to_icu(raw) == expected
    assert validate_icu(expected) == []


def test_message_to_icu_falls_back_to_a_literal():
    raw = "Broken {X:cond:>1?yes with {unclosed"
    with pytest.raises(MessageSyntaxError):
        parse(raw)
    report = message_parser.ConversionReport()
    converted = message_to_icu(raw, report, "k")
    assert converted == "Broken '{'X:cond:>1?yes with '{'unclosed"
    assert validate_icu(converted) == []
    assert report.unconvertible == 1
    assert report.unconvertible_examples == ["k"]
    assert report.constructs == Counter()


def test_to_icu_report_counts_constructs():
    report = message_parser.ConversionReport()
    to_icu(
        parse(
            "{A:diff()} {B:plural:x|y} {C:cond:<2?a|b} {D:show:a} {E:energyIcons(1)} {F}"
        ),
        report,
    )
    assert report.constructs["diff"] == 1
    assert report.constructs["plural"] == 1
    assert report.constructs["cond"] == 1
    assert report.constructs["show"] == 1
    assert report.constructs["energyIcons"] == 1
    assert report.constructs["variable"] == 1
    assert report.derived_conditions == [("C", "<", 2, "C_cond")]


def test_convert_table_recurses_and_reports():
    table = {
        "a": {"b": "{X:plural:one|{} many}", "c": ["{Y}", 3]},
        "d": "{Z:cond:<1?low|high}",
        "e": "{Bad.Name}",
    }
    converted, report = convert_table(table)
    assert converted == {
        "a": {"b": "{X, plural, one {one} other {# many}}", "c": ["{Y}", 3]},
        "d": "{Z_cond, select, true {low} other {high}}",
        "e": "{Bad_Name}",
    }
    assert report["unconvertible"] == 0
    assert report["constructs"]["plural"] == 1
    assert report["constructs"]["cond"] == 1
    assert report["derived_conditions"] == [("Z", "<", 1, "Z_cond")]
    assert report["renamed_variables"] == {"Bad.Name": "Bad_Name"}


def test_every_converted_eng_string_is_valid_icu():
    tables = _load_tables()
    invalid = []
    unconvertible = {}
    for table, data in tables.items():
        converted, report = convert_table(data)
        print(
            f"{table}: constructs={report['constructs']} "
            f"unconvertible={report['unconvertible']} "
            f"examples={report['unconvertible_examples']} "
            f"derived_conditions={len(report['derived_conditions'])} "
            f"renamed_variables={report['renamed_variables']}"
        )
        unconvertible[table] = report["unconvertible"]
        for key, message in _leaves(converted):
            errors = validate_icu(message)
            if errors:
                invalid.append((f"{table}.{key}", errors, message[:160]))
    for item in invalid[:20]:
        print("invalid:", item)
    assert invalid == []
    for table in ENTITY_TABLES:
        assert table in tables
        assert unconvertible[table] == 0, table


@pytest.mark.parametrize(
    "message, expected_error",
    [
        ("{a, plural, one {x}}", "'other'"),
        ("{a", "expected ','"),
        ("{", "bad argument name"),
        ("x } y", "unbalanced"),
        ("{a, foo, x}", "unknown argument type"),
        ("{a, select}", "without options"),
        ("{a, plural, one {x} other {y}", "unterminated"),
        ("it's '{", "unterminated quote"),
        ("<b>bold</b>", "starts a tag"),
    ],
)
def test_validate_icu_catches_bad_messages(message, expected_error):
    errors = validate_icu(message)
    assert errors, message
    assert any(expected_error in error for error in errors), errors


@pytest.mark.parametrize(
    "message",
    [
        "plain text with it's apostrophe and 'quotes'",
        "{a} and {b, number} and {c, plural, offset:1 =0 {none} one {# item} other {# items}}",
        "{a, select, x {{b, plural, one {'#'} other {#}}} other {'{'}}",
        "line one\nline two '<' not a tag",
    ],
)
def test_validate_icu_accepts_good_messages(message):
    assert validate_icu(message) == []


def test_lexer_keeps_delimiters_found_inside_arguments():
    tokens = list(lex("{X:energyIcons(1}"))
    assert tokens[-1][0] == DelimiterKind.BRACE_CLOSE
    with pytest.raises(MessageSyntaxError) as info:
        parse("{X:energyIcons(1}")
    assert info.value.position == 15
    assert (TextKind.GENERIC, "1", 15) in tokens
    tokens = list(lex("{X:choose(A:a|b}"))
    assert (DelimiterKind.COLON, None, 11) in tokens
    with pytest.raises(MessageSyntaxError) as info:
        parse("{X:choose(A:a|b}")
    assert info.value.position == 11


def test_bad_energy_icons_argument_is_a_syntax_error():
    with pytest.raises(MessageSyntaxError) as info:
        parse("{X:energyIcons(abc)}")
    assert "integer" in str(info.value)
    assert info.value.position == 15


def test_bad_condition_is_a_message_syntax_error():
    with pytest.raises(MessageSyntaxError):
        parse_cond_expression("abc")
    with pytest.raises(MessageSyntaxError):
        parse_cond_expression(">x")
    assert parse("{X:cond:~1?a|b}") == [
        NumericConditionPlaceholder(
            "X",
            [
                message_parser.ConditionalMessage(None, ["~1?a"]),
                message_parser.ConditionalMessage(None, ["b"]),
            ],
        )
    ]
    with pytest.raises(MessageSyntaxError):
        parse("{X:cond:a|>1?b|c}")


def test_condition_option_text_may_contain_a_question_mark():
    parsed = parse("{X:cond:>1?Many?|One?}")
    assert parsed == [
        NumericConditionPlaceholder(
            "X",
            [
                message_parser.ConditionalMessage(
                    message_parser.MessageCondition(
                        message_parser.ComparisonOperator.GREATER_THAN, 1
                    ),
                    ["Many?"],
                ),
                message_parser.ConditionalMessage(None, ["One?"]),
            ],
        )
    ]
    assert unparse(parsed) == "{X:cond:>1?Many?|One?}"
    assert unparse(parse("{X:cond:>1?a} tail?")) == "{X:cond:>1?a} tail?"
    nested = "{X:cond:>1?{Y:a|b} {Z:cond:==1?c|d}|e}"
    assert unparse(parse(nested)) == nested
    assert message_to_icu(nested) == (
        "{X, plural, =0 {e} =1 {e} other {{Y, select, true {a} other {b}} "
        "{Z, plural, =1 {c} other {d}}}}"
    )


@pytest.mark.parametrize(
    "raw, options",
    [
        ("{X:Hello (world)|bye}", [["Hello (world)"], ["bye"]]),
        ("{X:Note 1: yes|no}", [["Note 1: yes"], ["no"]]),
        ("{X:a (b) {Y}|c}", [["a (b) ", Placeholder("Y")], ["c"]]),
    ],
)
def test_option_text_with_parens_or_colons_is_not_a_function(raw, options):
    assert parse(raw) == [ConditionalPlaceholder("X", options)]
    assert unparse(parse(raw)) == raw


def test_unknown_function_names_still_fail():
    with pytest.raises(MessageSyntaxError) as info:
        parse("{X:bogus():a|b}")
    assert "bogus" in str(info.value)


def test_double_braces_are_literal_text():
    assert parse("a {{b}} c") == ["a {b} c"]
    assert unparse(parse("a {{b}} c")) == "a {{b}} c"
    assert parse("{X:{{lit|y} z") == [
        ConditionalPlaceholder("X", [["{lit"], ["y"]]),
        " z",
    ]
    assert unparse(parse("{X:{{lit|y} z")) == "{X:{{lit|y} z"
    assert message_to_icu("{X:{{lit|y} z") == "{X, select, true {'{'lit} other {y}} z"


def test_empty_formatter_name_round_trips():
    parsed = parse("{ModelTitle:: {}|}")
    assert parsed == [
        ConditionalPlaceholder("ModelTitle", [[" ", Placeholder(None)], []], fn_name="")
    ]
    assert unparse(parsed) == "{ModelTitle:: {}|}"


def test_empty_variable_with_function():
    assert parse("{:diff()}") == [FunctionPlaceholder(None, fn_name="diff")]
    assert parse("{K:choose(A):x|y}") == [ChoosePlaceholder("K", [["x"], ["y"]], ["A"])]


def test_trailing_text_yields_no_empty_token():
    tokens = list(lex("{X}"))
    assert tokens == [
        (DelimiterKind.BRACE_OPEN, None, 0),
        (TextKind.VARIABLE, "X", 1),
        (DelimiterKind.BRACE_CLOSE, None, 2),
    ]
    assert parse("{X}") == [Placeholder("X")]


def test_resolver_was_removed_from_the_parser_module():
    assert not hasattr(message_parser, "resolve_description")
    assert not hasattr(message_parser, "_lookup")


LOC_ROOT = Path(
    "/mnt/c/Users/peter/Documents/prima-codex/spire-codex/extraction/beta-v0111/raw/localization"
)
KNOWN_TRANSLATOR_TYPOS = {"ita": {"cards.REFRACT.description"}}


def _load_languages() -> dict[str, dict[str, dict]]:
    if not LOC_ROOT.is_dir():
        pytest.skip(f"{LOC_ROOT} is missing")
    languages = {}
    for lang_dir in sorted(LOC_ROOT.iterdir()):
        if not lang_dir.is_dir():
            continue
        tables = {}
        for path in sorted(lang_dir.glob("*.json")):
            with open(path, encoding="utf8") as f:
                tables[path.stem] = json.load(f)
        if tables:
            languages[lang_dir.name] = tables
    if not languages:
        pytest.skip(f"no language tables under {LOC_ROOT}")
    return languages


@pytest.mark.parametrize(
    "raw, language, expected",
    [
        (
            "{Cards:plural(pl):kartę|karty|kart}",
            None,
            "{Cards, plural, one {kartę} few {karty} many {kart} other {kart}}",
        ),
        (
            "{Amount:plural:W tej turze|Przez [blue]{}[/blue] tury|Przez [blue]{}[/blue] tur|Przez [blue]{}[/blue] tur}",
            "pol",
            "{Amount, plural, one {W tej turze} few {Przez [blue]#[/blue] tury} many {Przez [blue]#[/blue] tur} other {Przez [blue]#[/blue] tur}}",
        ),
        (
            "{Amount} {Amount:plural(ru):карта|карты|карт}",
            "rus",
            "{Amount} {Amount, plural, one {карта} few {карты} many {карт} other {карт}}",
        ),
        (
            "{Amount:choose:本|接下來 [blue]{}[/blue] }",
            "zht",
            "{Amount, plural, =1 {本} other {接下來 [blue]#[/blue] }}",
        ),
        ("{N:choose:a|b|c}", "zht", "{N, plural, =0 {a} =1 {b} other {c}}"),
        (
            "Pilih {Amount:choose(1):sebuah kartu|[blue]{}[/blue] kartu}",
            "ind",
            "Pilih {Amount, plural, =1 {sebuah kartu} other {[blue]#[/blue] kartu}}",
        ),
        ("{N:choose(1|2):a|b|c}", "kor", "{N, plural, =1 {a} =2 {b} other {c}}"),
        ("{Cards:plural:牌|牌}", "zhs", "牌"),
        ("{Cards:plural:a|{} b}", "jpn", "a"),
        ("{X:plural:a|b}", "ptb", "{X, plural, =1 {a} other {b}}"),
        ("{X:plural:a|b}", "fra", "{X, plural, one {a} other {b}}"),
        ("{X:plural:z|a|b}", "fra", "{X, plural, =0 {z} =1 {a} other {b}}"),
        ("{X:plural:z|a|b}", "deu", "{X, plural, =0 {z} one {a} other {b}}"),
        ("{X:plural:n|z|a|b}", "ita", "{X, plural, =0 {z} =1 {a} other {b}}"),
        ("{X:plural:a|b}", "eng", "{X, plural, one {a} other {b}}"),
        ("{X:plural:a|b}", "zz", "{X, plural, one {a} other {b}}"),
        ("{X:plural(ru):a|b}", "eng", "{X, plural, one {a} other {b}}"),
        (
            "{BossName:choose(Leśny Stróż|Umiej.):a|b|c}",
            "pol",
            "{BossName, select, Leśny_Stróż {a} Umiej_ {b} other {c}}",
        ),
    ],
)
def test_language_aware_icu(raw, language, expected):
    assert message_to_icu(raw, language=language) == expected
    assert validate_icu(expected) == []
    assert unparse(parse(raw)) == raw


def test_plural_language_argument_round_trips_and_is_reported():
    parsed = parse("{Cards:plural(pl):kartę|karty|kart}")
    assert parsed == [
        ConditionalPlaceholder(
            "Cards", [["kartę"], ["karty"], ["kart"]], fn_name="plural", args=["pl"]
        )
    ]
    assert parse("{Amount:choose:a|b}") == [
        ConditionalPlaceholder("Amount", [["a"], ["b"]], fn_name="choose")
    ]
    report = message_parser.ConversionReport()
    to_icu(parsed, report)
    assert report.constructs["plural"] == 1
    assert report.constructs["plural_lang_arg"] == 1
    report = message_parser.ConversionReport()
    assert message_to_icu("{X:plural(xx):a|b}", report, "k") == "'{'X:plural(xx):a|b'}'"
    assert report.unconvertible == 1


def test_choose_key_sanitising_is_reported():
    converted, report = convert_table(
        {"a": "{BossName:choose(Leśny Stróż|Umiej.):a|b|c}", "b": "{N:choose(1):x|y}"},
        language="pol",
    )
    assert report["renamed_keys"] == {"Leśny Stróż": "Leśny_Stróż", "Umiej.": "Umiej_"}
    assert report["constructs"]["choose_numeric"] == 1
    assert converted["b"] == "{N, plural, =1 {x} other {y}}"


def test_choose_with_other_as_a_key_is_unconvertible():
    report = message_parser.ConversionReport()
    message_to_icu("{X:choose(other):a|b}", report, "k")
    assert report.unconvertible == 1


def test_cond_rejects_arguments():
    with pytest.raises(MessageSyntaxError):
        parse("{X:cond(pl):>1?a|b}")


def test_every_language_round_trips_and_converts():
    languages = _load_languages()
    syntax_failures = {}
    round_trip_failures = []
    invalid = []
    unconvertible = {}
    for language, tables in languages.items():
        failed_keys = set()
        count = 0
        for table, data in tables.items():
            for key, message in _leaves(data):
                try:
                    parsed = parse(message)
                except MessageSyntaxError:
                    failed_keys.add(f"{table}.{key}")
                    continue
                if unparse(parsed) != message:
                    round_trip_failures.append(f"{language}.{table}.{key}")
            converted, report = convert_table(data, language=language)
            count += report["unconvertible"]
            for key, message in _leaves(converted):
                errors = validate_icu(message)
                if errors:
                    invalid.append((f"{language}.{table}.{key}", errors))
            failed_keys.update(
                f"{table}.{key}" for key in report["unconvertible_examples"]
            )
        syntax_failures[language] = failed_keys
        unconvertible[language] = count
        print(f"{language}: unconvertible={count} {sorted(failed_keys)}")
    assert round_trip_failures == []
    assert invalid == []
    for language, failed_keys in syntax_failures.items():
        assert failed_keys == KNOWN_TRANSLATOR_TYPOS.get(language, set()), language
        assert unconvertible[language] == len(failed_keys), language


def test_derived_selectors_are_unique_and_numbered_in_source_order():
    raw = (
        "Gain {X:cond:<1?a|b}. Deal {X:cond:<=5?c|d}. {X:While {} is up|down} "
        "{X:cond:==-2?e|<=3?f|g} {Y:cond:<0?h|i}"
    )
    report = message_parser.ConversionReport()
    assert to_icu(parse(raw), report) == (
        "Gain {X_cond, select, true {a} other {b}}. "
        "Deal {X_cond2, select, true {c} other {d}}. "
        "{X_cond3, select, true {While {X} is up} other {down}} "
        "{X_cond4, select, true {e} other {{X_cond5, select, true {f} other {g}}}} "
        "{Y_cond, select, true {h} other {i}}"
    )
    assert report.derived_conditions == [
        ("X", "<", 1, "X_cond"),
        ("X", "<=", 5, "X_cond2"),
        ("X", "truthy", None, "X_cond3"),
        ("X", "==", -2, "X_cond4"),
        ("X", "<=", 3, "X_cond5"),
        ("Y", "<", 0, "Y_cond"),
    ]
    assert message_to_icu("{X:cond:<1?a|b}") == "{X_cond, select, true {a} other {b}}"


def _engine_index(rule: str, value: int, count: int) -> int:
    if rule == "singular":
        return 0
    if rule == "dual":
        if count == 2:
            return 0 if value == 1 else 1
        if count == 3:
            return 0 if value == 0 else (1 if value == 1 else 2)
        if count == 4:
            return 0 if value < 0 else (1 if value == 0 else (2 if value == 1 else 3))
        return -1
    if rule == "french":
        if count == 2:
            return 0 if value < 2 else 1
        if count == 3:
            if value < 2:
                return 1 if value > 0 else (0 if value == 0 else -1)
            return 2 if value > 2 else -1
        if count == 4:
            if value < 2:
                return (1 if value == 0 else 2) if value >= 0 else 0
            return 3 if value > 2 else -1
        return -1
    if rule == "russian":
        if value % 10 == 1 and value % 100 != 11:
            return 0
        return 1 if 2 <= value % 10 <= 4 and not 12 <= value % 100 <= 14 else 2
    if rule == "polish":
        if value == 1:
            return 0
        if 2 <= value % 10 <= 4 and not 12 <= value % 100 <= 14:
            return 1
        if (
            not 0 <= value % 10 <= 1
            and not 5 <= value % 10 <= 9
            and not 12 <= value % 100 <= 14
        ):
            return 3
        return 2
    raise ValueError(rule)


def _cldr_category(language: str, value: int) -> str:
    if language in ("en", "de", "es", "it", "tr"):
        return "one" if value == 1 else "other"
    if language in ("fr", "pt"):
        return "one" if value in (0, 1) else "other"
    if language == "pl":
        if value == 1:
            return "one"
        if 2 <= value % 10 <= 4 and not 12 <= value % 100 <= 14:
            return "few"
        return "many"
    if language == "ru":
        if value % 10 == 1 and value % 100 != 11:
            return "one"
        if 2 <= value % 10 <= 4 and not 12 <= value % 100 <= 14:
            return "few"
        return "many"
    raise ValueError(language)


def _icu_pick(cases: list[tuple[str, str]], value: int, language: str) -> str:
    keyed = dict(cases)
    if f"={value}" in keyed:
        return keyed[f"={value}"]
    return keyed.get(_cldr_category(language, value), keyed["other"])


@pytest.mark.parametrize(
    "icu_rule, engine_rule, language, count",
    [
        ("dual", "dual", "en", 2),
        ("dual", "dual", "en", 3),
        ("dual", "dual", "en", 4),
        ("dual_exact", "dual", "pt", 2),
        ("dual_exact", "dual", "pt", 3),
        ("dual_exact", "dual", "pt", 4),
        ("french", "french", "fr", 2),
        ("french", "french", "fr", 3),
        ("french", "french", "fr", 4),
        ("slavic", "polish", "pl", 3),
        ("slavic", "polish", "pl", 4),
        ("slavic", "russian", "ru", 3),
        ("slavic", "russian", "ru", 4),
    ],
)
def test_plural_cases_match_the_engine_for_every_integer(
    icu_rule, engine_rule, language, count
):
    bodies = [f"b{i}" for i in range(count)]
    cases = message_parser._plural_cases(icu_rule, bodies)
    assert cases[-1][0] == "other"
    checked = 0
    for value in [*range(0, 40), *range(100, 125), 1001, 1012, 1021]:
        index = _engine_index(engine_rule, value, count)
        if index < 0 or index >= count:
            continue
        assert _icu_pick(cases, value, language) == bodies[index], value
        checked += 1
    assert checked > 30


def test_dual_four_option_index_zero_is_the_negative_branch():
    assert _engine_index("dual", -1, 4) == 0
    assert _engine_index("dual", 0, 4) == 1
    assert _engine_index("dual", 1, 4) == 2
    assert _engine_index("dual", 2, 4) == 3
    cases = message_parser._plural_cases("dual", ["neg", "zero", "one", "many"])
    assert cases == [("=0", "zero"), ("=1", "one"), ("other", "many")]


def test_french_engine_has_no_index_for_two_with_three_or_four_options():
    assert _engine_index("french", 2, 3) == -1
    assert _engine_index("french", 2, 4) == -1
    assert message_to_icu("{X:plural:z|a|b}", language="fra") == (
        "{X, plural, =0 {z} =1 {a} other {b}}"
    )


def test_singular_rule_always_renders_the_first_option():
    for value in range(0, 10):
        assert _engine_index("singular", value, 2) == 0
    assert message_to_icu("{X:plural:a|{} b}", language="kor") == "a"


def test_pt_br_uses_exact_one_because_cldr_one_covers_zero():
    assert _cldr_category("pt", 0) == "one"
    assert _engine_index("dual", 0, 2) == 1
    cases = message_parser._plural_cases("dual_exact", ["a", "b"])
    assert _icu_pick(cases, 0, "pt") == "b"


def test_pound_is_only_the_count_directly_inside_a_plural():
    assert message_to_icu("{A:plural:x|{B:show:#1|y}}") == (
        "{A, plural, one {x} other {{B, select, true {#1} other {y}}}}"
    )
    assert message_to_icu("{A:plural:#|{B:show:{}|y}}") == (
        "{A, plural, one {'#'} other {{B_cond, select, true {{B}} other {y}}}}"
    )
    assert message_to_icu("{A:plural:x|{B:plural:#|{} y}}") == (
        "{A, plural, one {x} other {{B, plural, one {'#'} other {# y}}}}"
    )
    assert validate_icu("{a, plural, other {{b, select, x {# z} other {z}}}}") == []


def test_negative_thresholds_go_through_derived_selects():
    assert parse_cond_expression(">=-1") == message_parser.MessageCondition(
        message_parser.ComparisonOperator.GREATER_THAN_OR_EQUAL, -1
    )
    raw = "{X:cond:>=-1?big|small}"
    assert unparse(parse(raw)) == raw
    report = message_parser.ConversionReport()
    assert to_icu(parse(raw), report) == "{X_cond, select, true {big} other {small}}"
    assert report.derived_conditions == [("X", ">=", -1, "X_cond")]
    report = message_parser.ConversionReport()
    assert to_icu(parse("{X:cond:>-1?a|b}"), report) == (
        "{X_cond, select, true {a} other {b}}"
    )
    assert report.derived_conditions == [("X", ">", -1, "X_cond")]
    assert message_to_icu("{X:cond:>1?a|b}") == "{X, plural, =0 {b} =1 {b} other {a}}"


def test_deep_nesting_is_unconvertible_not_a_crash():
    raw = "{X:" * 1500
    report = message_parser.ConversionReport()
    assert message_to_icu(raw, report, "k") == escape_icu_text(raw)
    assert report.unconvertible == 1
    converted, table_report = convert_table({"deep": raw, "ok": "{Y}"})
    assert converted["ok"] == "{Y}"
    assert table_report["unconvertible"] == 1


def test_invalid_icu_output_falls_back_and_is_reported(monkeypatch):
    monkeypatch.setattr(message_parser, "to_icu", lambda *args, **kwargs: "{broken")
    converted, report = convert_table({"a": "{X}", "b": {"c": "{Y}"}})
    assert converted == {"a": "'{'X'}'", "b": {"c": "'{'Y'}'"}}
    assert report["invalid_icu"] == 2
    assert report["invalid_icu_examples"] == ["a", "b.c"]
    assert report["unconvertible"] == 2
    assert report["unconvertible_examples"] == ["a", "b.c"]
    assert validate_icu(converted["a"]) == []
