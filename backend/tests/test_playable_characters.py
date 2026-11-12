"""The parsers take the cast from ModelDb.AllCharacters, so a new character
gets its card and relic pools without a parser edit."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app" / "parsers"))

import parser_paths  # noqa: E402

MODEL_DB = """
public static class ModelDb
{
	public static IEnumerable<CharacterModel> AllCharacters => new ReadOnlyArray<CharacterModel>(new CharacterModel[4]
	{
		Character<Ironclad>(),
		Character<Regent>(),
		Character<Defect>(),
		Character<Fool>()
	});

	public static IEnumerable<EventModel> AllSharedEvents => new ReadOnlyArray<EventModel>(new EventModel[1]
	{
		Event<Neow>()
	});
}
"""


@pytest.fixture
def decompiled(tmp_path, monkeypatch):
    monkeypatch.setattr(parser_paths, "DECOMPILED", tmp_path)
    parser_paths.playable_characters.cache_clear()
    yield tmp_path
    parser_paths.playable_characters.cache_clear()


def test_reads_the_cast_in_game_order(decompiled):
    models = decompiled / "MegaCrit.Sts2.Core.Models"
    models.mkdir()
    (models / "ModelDb.cs").write_text(MODEL_DB, encoding="utf-8")
    assert parser_paths.playable_characters() == (
        "Ironclad",
        "Regent",
        "Defect",
        "Fool",
    )


def test_site_order_keeps_the_launch_order_and_appends_newcomers(decompiled):
    models = decompiled / "MegaCrit.Sts2.Core.Models"
    models.mkdir()
    (models / "ModelDb.cs").write_text(MODEL_DB, encoding="utf-8")
    assert parser_paths.site_characters() == ("Ironclad", "Defect", "Regent", "Fool")


def test_falls_back_to_the_launch_cast_without_model_db(decompiled):
    assert parser_paths.playable_characters() == (
        "Ironclad",
        "Silent",
        "Regent",
        "Necrobinder",
        "Defect",
    )
