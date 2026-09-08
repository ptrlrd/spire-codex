"""Runtime-populated event placeholders and the Fake Merchant blurb follow the parse language."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app" / "parsers"))

from event_parser import (  # noqa: E402
    FAKE_MERCHANT_DESCRIPTION,
    PLACEHOLDER_PHRASES,
    _fix_fake_merchant,
    extract_event_vars,
    phrase,
)

LANGS = [
    "deu",
    "esp",
    "fra",
    "ita",
    "jpn",
    "kor",
    "pol",
    "ptb",
    "rus",
    "spa",
    "tha",
    "tur",
    "zhs",
    "zht",
]
SOURCE = 'new StringVar("OwnedRelic"); new StringVar("RandomPotion"); new StringVar("SomeCard");'


def test_english_is_unchanged():
    assert phrase("a random Relic", "eng") == "a random Relic"


def test_every_phrase_covers_every_language():
    for text, row in PLACEHOLDER_PHRASES.items():
        assert set(row) == set(LANGS), text
        assert all(row[lang].strip() for lang in LANGS), text
        assert all(row[lang] != text for lang in LANGS), text


def test_unknown_phrase_falls_back_to_english():
    assert phrase("not in the table", "jpn") == "not in the table"


def test_extracted_vars_use_the_parse_language():
    eng = extract_event_vars(SOURCE, {}, {}, "eng")
    jpn = extract_event_vars(SOURCE, {}, {}, "jpn")
    assert eng["OwnedRelic"] == "one of your Relics"
    assert jpn["OwnedRelic"] == PLACEHOLDER_PHRASES["one of your Relics"]["jpn"]
    assert jpn["RandomPotion"] == PLACEHOLDER_PHRASES["a random Potion"]["jpn"]
    assert all(ord(c) < 128 for c in str(eng["RandomPotion"]))
    assert not all(ord(c) < 128 for c in str(jpn["RandomPotion"]))


def test_extract_event_vars_defaults_to_english():
    assert extract_event_vars(SOURCE, {}, {})["OwnedRelic"] == "one of your Relics"


def test_fake_merchant_description_is_localized():
    assert set(FAKE_MERCHANT_DESCRIPTION) == {"eng", *LANGS}
    for lang in LANGS:
        event = _fix_fake_merchant({"id": "FAKE_MERCHANT"}, lang)
        assert event["description"] == FAKE_MERCHANT_DESCRIPTION[lang]
        # The markup and the untranslated proper nouns survive.
        assert "[gold]Foul Potion[/gold]" in event["description"]
        assert "The Merchant's Rug???" in event["description"]
    assert (
        _fix_fake_merchant({"id": "FAKE_MERCHANT"})["description"]
        == FAKE_MERCHANT_DESCRIPTION["eng"]
    )


def test_other_events_are_untouched():
    assert _fix_fake_merchant({"id": "ABYSSAL_BATHS"}, "jpn") == {"id": "ABYSSAL_BATHS"}
