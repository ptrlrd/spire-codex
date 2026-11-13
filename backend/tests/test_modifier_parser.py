"""The modifier list follows the game: only modifiers with a class, and the
per-character card modifier once for every playable character."""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app" / "parsers"))

import keyword_parser  # noqa: E402
import parser_paths  # noqa: E402

MODEL_DB = """
public static class ModelDb
{
	public static IEnumerable<CharacterModel> AllCharacters => new ReadOnlyArray<CharacterModel>(new CharacterModel[2]
	{
		Character<Ironclad>(),
		Character<Fool>()
	});

	public static IReadOnlyList<ModifierModel> GoodModifiers => new ReadOnlyArray<ModifierModel>(new ModifierModel[2]
	{
		Modifier<Draft>(),
		Modifier<CharacterCards>()
	});

	public static IReadOnlyList<ModifierModel> BadModifiers => new ReadOnlyArray<ModifierModel>(new ModifierModel[1]
	{
		Modifier<CursedRun>()
	});
}
"""


@pytest.fixture
def game(tmp_path, monkeypatch):
    models = tmp_path / "MegaCrit.Sts2.Core.Models"
    models.mkdir()
    (models / "ModelDb.cs").write_text(MODEL_DB, encoding="utf-8")
    classes = tmp_path / "Modifiers"
    classes.mkdir()
    for name in ("Draft", "CursedRun", "CharacterCards", "DeprecatedModifier"):
        (classes / f"{name}.cs").write_text(
            f"public class {name} : ModifierModel\n{{\n}}\n", encoding="utf-8"
        )
    loc = tmp_path / "loc"
    loc.mkdir()
    (loc / "modifiers.json").write_text(
        json.dumps(
            {
                "BINARY.title": "Binary",
                "BINARY.description": "Leftover text.",
                "CURSED_RUN.title": "Cursed Run",
                "CURSED_RUN.description": "Add a Curse.",
                "DRAFT.title": "Draft",
                "DRAFT.description": "Choose cards.",
            }
        ),
        encoding="utf-8",
    )
    (loc / "characters.json").write_text(
        json.dumps(
            {
                "IRONCLAD.cardsModifierTitle": "Ironclad Cards",
                "IRONCLAD.cardsModifierDescription": "Ironclad cards appear.",
                "FOOL.cardsModifierTitle": "Fool Cards",
                "FOOL.cardsModifierDescription": "Fool cards appear.",
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(parser_paths, "DECOMPILED", tmp_path)
    parser_paths.playable_characters.cache_clear()
    yield loc, classes, models / "ModelDb.cs"
    parser_paths.playable_characters.cache_clear()


def test_only_implemented_modifiers_and_one_row_per_character(game):
    loc, classes, model_db = game
    rows = keyword_parser.parse_modifiers(loc, classes, model_db)
    assert [(r["id"], r["kind"], r["character"]) for r in rows] == [
        ("CURSED_RUN", "bad", None),
        ("DRAFT", "good", None),
        ("CHARACTER_CARDS_IRONCLAD", "good", "IRONCLAD"),
        ("CHARACTER_CARDS_FOOL", "good", "FOOL"),
    ]
    assert rows[-1]["name"] == "Fool Cards"
    assert rows[-1]["description"] == "Fool cards appear."


def test_without_class_files_the_text_list_is_kept(game, tmp_path):
    loc, _classes, model_db = game
    rows = keyword_parser.parse_modifiers(loc, tmp_path / "missing", model_db)
    assert [r["id"] for r in rows] == ["BINARY", "CURSED_RUN", "DRAFT"]
