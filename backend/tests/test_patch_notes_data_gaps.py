"""Parser gaps found against the v0.113.0 patch notes: relic text inside
event options, relic values set when obtained, repeat move names and the
per-mode Ascension cap."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app" / "parsers"))

import event_parser  # noqa: E402
import game_mode_parser  # noqa: E402
import monster_parser  # noqa: E402
import relic_parser  # noqa: E402

EVENT = """
public sealed class Thermae : EventModel
{
	protected override IEnumerable<DynamicVar> CanonicalVars => new DynamicVar[3]
	{
		new GoldVar("Cost", 88),
		new StringVar("TowelDescription"),
		new StringVar("TeaDescription", ModelDb.Relic<BoneTea>().DynamicDescription.GetFormattedText())
	};

	public override void CalculateVars()
	{
		((StringVar)base.DynamicVars["TowelDescription"]).StringValue = ModelDb.Relic<BathTowel>().DynamicEventDescription.GetFormattedText();
	}
}
"""

RELIC = """
public class Pet : RelicModel
{
	protected override IEnumerable<DynamicVar> CanonicalVars => new DynamicVar[2]
	{
		new MaxHpVar(0m),
		new DynamicVar("CurrentHp", 0m)
	};

	public int CurrentHp
	{
		get
		{
			return _currentHp;
		}
		set
		{
			_currentHp = value;
			base.DynamicVars["CurrentHp"].BaseValue = value;
		}
	}

	public int MaxHp
	{
		get
		{
			return _maxHp;
		}
		set
		{
			_maxHp = value;
			base.DynamicVars.MaxHp.BaseValue = value;
		}
	}

	public override async Task AfterObtained()
	{
		if (MaxHp == 0)
		{
			MaxHp = 60;
		}
		if (!_currentHpSet)
		{
			CurrentHp = MaxHp;
		}
	}
}
"""


def test_event_string_var_takes_the_relic_description():
    relics = {"BATH_TOWEL": "Heal 8 HP.", "BONE_TEA": "Upgrade your hand."}
    got = event_parser.extract_event_vars(EVENT, {}, relics, "eng")
    assert got["TowelDescription"] == "Heal 8 HP."
    assert got["TeaDescription"] == "Upgrade your hand."


def test_relic_vars_take_the_values_set_when_obtained():
    zeroed = {"MaxHp": 0, "CurrentHp": 0}
    assert relic_parser.obtained_defaults(RELIC, zeroed) == {
        "MaxHp": 60,
        "CurrentHp": 60,
    }
    assert relic_parser.obtained_defaults(RELIC, {"MaxHp": 12, "CurrentHp": 0}) == {
        "CurrentHp": 60
    }
    assert relic_parser.obtained_defaults("class Plain : RelicModel {}", zeroed) == {}


def test_repeat_move_state_uses_the_title_of_its_move():
    loc = {"PRISM.moves.JAB.title": "Jab", "PRISM.moves.SLEEP.title": "Schlaf"}
    assert monster_parser.move_title(loc, "PRISM", "JAB_MOVE") == "Jab"
    assert monster_parser.move_title(loc, "PRISM", "JAB_MOVE_2") == "Jab"
    assert monster_parser.move_title(loc, "PRISM", "SLEEP_2") == "Schlaf"
    assert monster_parser.move_title(loc, "PRISM", "WHIRL_MOVE_2") == "Whirl Move 2"


def test_mode_ascension_caps_and_ladder(tmp_path):
    manager = tmp_path / "AscensionManager.cs"
    manager.write_text(
        "public const int maxAscensionAllowed = 10;\n"
        "public const int maxAscensionAllowedBlitz = 5;\n"
    )
    helper = tmp_path / "AscensionHelper.cs"
    helper.write_text(
        "\tpublic static AscensionLevel GetLevelForBlitz(int blitzLevel)\n\t{\n"
        "\t\treturn blitzLevel switch\n\t\t{\n"
        "\t\t\t0 => AscensionLevel.None, \n"
        "\t\t\t2 => AscensionLevel.TightBelt, \n"
        "\t\t\t1 => AscensionLevel.WearyTraveler, \n"
        "\t\t};\n\t}\n"
    )
    assert game_mode_parser.max_ascensions(manager) == {"": 10, "BLITZ": 5}
    assert game_mode_parser.mode_ascension_levels("BLITZ", helper) == [
        "WearyTraveler",
        "TightBelt",
    ]
    assert game_mode_parser.mode_ascension_levels("DREAD", helper) == []
    assert game_mode_parser.max_ascensions(tmp_path / "missing.cs") == {}
