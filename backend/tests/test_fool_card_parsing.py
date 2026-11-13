"""Card parsing for mechanics the Fool introduced: tags a card declares for
itself, Tarot cards and the card that creates them, and power amounts that
live behind a property or a Temporary<Stat>Power base."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app" / "parsers"))

import card_parser  # noqa: E402
from description_resolver import extract_vars_from_source  # noqa: E402

CARD_TAG = """
public enum CardTag
{
	None,
	/// <summary>Makes this a Strike, see <see cref="F:CardTag.Shiv" />.</summary>
	Strike,
	Defend,
	Minion,
	OstyAttack,
	Shiv,
	Wah,
	Cho,
	Ki,
	Shoot
}
"""

TAROT = """
public static class TarotCards
{
	public static List<CardModel> All
	{
		get
		{
			span[0] = ModelDb.Card<Judgement>();
			span[1] = ModelDb.Card<TheTower>();
			return list;
		}
	}
}
"""


@pytest.fixture
def game(tmp_path, monkeypatch):
    entities = tmp_path / "entities"
    powers = tmp_path / "powers"
    entities.mkdir()
    powers.mkdir()
    (entities / "CardTag.cs").write_text(CARD_TAG, encoding="utf-8")
    (entities / "TarotCards.cs").write_text(TAROT, encoding="utf-8")
    (powers / "ChoBarbsPower.cs").write_text(
        "public class ChoBarbsPower : TemporaryThornsPower\n{\n}\n", encoding="utf-8"
    )
    (powers / "AimPower.cs").write_text(
        "public sealed class AimPower : PowerModel\n{\n}\n", encoding="utf-8"
    )
    monkeypatch.setattr(card_parser, "CARD_ENTITIES_DIR", entities)
    monkeypatch.setattr(card_parser, "POWERS_DIR", powers)
    for cached in (
        card_parser.card_tags,
        card_parser.tarot_cards,
        card_parser.temporary_stat,
    ):
        cached.cache_clear()
    yield tmp_path
    for cached in (
        card_parser.card_tags,
        card_parser.tarot_cards,
        card_parser.temporary_stat,
    ):
        cached.cache_clear()


def test_tags_come_from_the_enum(game):
    assert card_parser.card_tags() == (
        "Strike",
        "Defend",
        "Minion",
        "OstyAttack",
        "Shiv",
        "Wah",
        "Cho",
        "Ki",
        "Shoot",
    )


def test_only_declared_tags_count():
    shot = "protected override HashSet<CardTag> CanonicalTags => new HashSet<CardTag> { CardTag.Shoot };"
    whip = "public override IEnumerable<CardTag> Tags => new List<CardTag>(CardTag.Ki);\nMelodyCmd.Play(CardTag.Ki);"
    many = "CanonicalTags => new HashSet<CardTag>\n{\n\tCardTag.Wah,\n\tCardTag.Cho,\n\tCardTag.Ki\n};"
    reader = "where c.Tags.Contains(CardTag.Shoot)\nselect c;"
    assert card_parser.declared_tags(shot) == {"Shoot"}
    assert card_parser.declared_tags(whip) == {"Ki"}
    assert card_parser.declared_tags(many) == {"Wah", "Cho", "Ki"}
    assert card_parser.declared_tags(reader) == set()


def test_tarot_list_and_temporary_stat(game):
    assert card_parser.tarot_cards() == ("Judgement", "TheTower")
    assert card_parser.temporary_stat("ChoBarbsPower") == "Thorns"
    assert card_parser.temporary_stat("AimPower") is None
    assert card_parser.temporary_stat("MissingPower") is None


def test_power_amount_behind_a_property():
    source = """
	private int _currentAim = 5;
	protected override IEnumerable<DynamicVar> CanonicalVars => new DynamicVar[3]
	{
		new IntVar("BaseAim", 5m),
		new PowerVar<AimPower>(CurrentAim),
		new PowerVar<ShowOffPower>(2m)
	};
"""
    found = extract_vars_from_source(source)
    assert found["AimPower"] == 5
    assert found["ShowOffPower"] == 2
