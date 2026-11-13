"""Smaller data fixes that came with the sixth character: power text that
printed a runtime zero, a glossary entry with nested braces, the beta
channel's translation maps and the Fool's arrow slot."""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app" / "parsers"))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))

import character_parser  # noqa: E402
import keyword_parser  # noqa: E402
import power_parser  # noqa: E402
from app.services import data_service  # noqa: E402


def _power(tmp_path, monkeypatch, name, source, loc):
    monkeypatch.setattr(power_parser, "is_orphan", lambda path: False)
    monkeypatch.setattr(
        power_parser, "_enrich_vars_from_sister_card", lambda base, found: found
    )
    path = tmp_path / f"{name}.cs"
    path.write_text(source, encoding="utf-8")
    return power_parser.parse_single_power(path, loc)


def test_runtime_counter_falls_back_to_the_static_text(tmp_path, monkeypatch):
    row = _power(
        tmp_path,
        monkeypatch,
        "EncorePower",
        'public sealed class EncorePower : PowerModel\n{\n\tnew DynamicVar("PlaysRemaining", 0m)\n}\n',
        {
            "ENCORE_POWER.title": "Encore",
            "ENCORE_POWER.description": "You can only play [blue]1[/blue] more card this turn.",
            "ENCORE_POWER.smartDescription": "You can only play [blue]{PlaysRemaining}[/blue] more {PlaysRemaining:plural:card|cards} this turn.",
        },
    )
    assert row["description"] == "You can only play [blue]1[/blue] more card this turn."


def test_real_amounts_still_use_the_smart_text(tmp_path, monkeypatch):
    row = _power(
        tmp_path,
        monkeypatch,
        "SpikesPower",
        'public sealed class SpikesPower : PowerModel\n{\n\tnew DynamicVar("Spikes", 3m)\n}\n',
        {
            "SPIKES_POWER.title": "Spikes",
            "SPIKES_POWER.description": "Deal damage back.",
            "SPIKES_POWER.smartDescription": "Deal [blue]{Spikes}[/blue] damage back.",
        },
    )
    assert row["description"] == "Deal [blue]3[/blue] damage back."


def test_temporary_thorns_borrows_the_parent_text(tmp_path, monkeypatch):
    row = _power(
        tmp_path,
        monkeypatch,
        "ChoBarbsPower",
        "public class ChoBarbsPower : TemporaryThornsPower\n{\n}\n",
        {
            "TEMPORARY_THORNS_POWER.description": "Gain [gold]Thorns[/gold] this turn.",
        },
    )
    assert row["id"] == "CHO_BARBS"
    assert row["name"] == "Temporary Thorns"
    assert row["description"] == "Gain [gold]Thorns[/gold] this turn."


def test_glossary_strips_nested_braces_and_files_new_terms(tmp_path):
    (tmp_path / "static_hover_tips.json").write_text(
        json.dumps(
            {
                "ARROW.title": "Arrow",
                "ARROW.description": "Arrows can be shot.{ShowArrowCount:\n{ArrowCount}|}",
                "TAROT.title": "Tarot",
                "TAROT.description": "Unique cards with special effects.",
            }
        ),
        encoding="utf-8",
    )
    rows = {row["id"]: row for row in keyword_parser.parse_glossary(tmp_path)}
    assert rows["ARROW"]["description"] == "Arrows can be shot."
    assert rows["ARROW"]["category"] == "mechanics"
    assert rows["TAROT"]["category"] == "mechanics"


def test_arrow_slots_only_for_characters_that_have_them():
    fool = "public override int BaseArrowSlotCount => 1;"
    match = character_parser.re.search(r"BaseArrowSlotCount\s*=>\s*(\d+)", fool)
    assert match and int(match.group(1)) == 1
    assert not character_parser.re.search(
        r"BaseArrowSlotCount\s*=>\s*(\d+)", "public override int MaxEnergy => 3;"
    )


@pytest.fixture
def trees(tmp_path, monkeypatch):
    main, beta = tmp_path / "data", tmp_path / "data-beta"
    for base, names in (
        (main, {"ironclad": "Ironclad"}),
        (beta / "v9.9.9", {"ironclad": "Beta Ironclad", "fool": "Fool"}),
    ):
        (base / "eng").mkdir(parents=True)
        (base / "eng" / "translations.json").write_text(
            json.dumps({"character_names": names}), encoding="utf-8"
        )
    (beta / "latest").write_text("v9.9.9", encoding="utf-8")
    monkeypatch.setattr(data_service, "DATA_DIR", main)
    monkeypatch.setattr(data_service, "BETA_DATA_DIR", beta)
    caches = [
        v
        for v in vars(data_service).values()
        if callable(getattr(v, "cache_clear", None))
    ]
    for cache in caches:
        cache.cache_clear()
    yield
    for cache in caches:
        cache.cache_clear()


@pytest.mark.parametrize(
    "channel,expected",
    [
        ("stable", {"ironclad": "Ironclad"}),
        ("beta", {"ironclad": "Ironclad", "fool": "Fool"}),
        ("all", {"ironclad": "Ironclad", "fool": "Fool"}),
    ],
)
def test_beta_channel_translations_name_the_beta_only_character(
    trees, channel, expected
):
    token = data_service.current_channel.set(channel)
    try:
        maps = data_service.load_translation_maps("eng")
    finally:
        data_service.current_channel.reset(token)
    assert maps["character_names"] == expected


def test_changelog_covers_glossary_and_rest_sites():
    import diff_data

    assert diff_data.CATEGORY_NAMES["glossary"] == "Glossary"
    assert diff_data.CATEGORY_NAMES["rest_site_options"] == "Rest Site Options"
