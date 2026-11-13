"""A character the game leaves unguessed lists the pronoun each Ancient
uses, and placeholder quotes and dialogue lines stay out of the data."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app" / "parsers"))

import character_parser  # noqa: E402

LOC = {
    "FOOL.title": "The Fool",
    "FOOL.guess.feminine.pronounSubject": "she",
    "FOOL.guess.feminine.pronounObject": "her",
    "FOOL.guess.feminine.possessiveAdjective": "her",
    "FOOL.guess.it.pronounSubject": "it",
    "FOOL.guess.it.pronounObject": "it",
    "FOOL.guess.it.possessiveAdjective": "its",
    "FOOL.guess.neutral.pronounSubject": "they",
    "FOOL.guess.neutral.pronounObject": "them",
    "FOOL.guess.neutral.possessiveAdjective": "their",
}


def _event(src: Path, name: str, guess: str | None) -> None:
    body = "public sealed class " + name + " : EventModel\n{\n"
    if guess:
        body += (
            "\tpublic override FoolPronounGuess FoolPronounGuess => "
            f"FoolPronounGuess.{guess};\n"
        )
    (src / f"{name}.cs").write_text(body + "}\n", encoding="utf-8")


def test_each_overriding_event_is_listed_with_its_pronouns(tmp_path):
    _event(tmp_path, "Neow", "It")
    _event(tmp_path, "Darv", "Feminine")
    _event(tmp_path, "TheArchitect", "It")
    _event(tmp_path, "Doors", None)
    guesses, default = character_parser.parse_pronoun_guesses(
        LOC, "FOOL", {"THE_ARCHITECT.title": "The Architect"}, tmp_path
    )
    assert [(g["speaker_id"], g["speaker_name"], g["subject"]) for g in guesses] == [
        ("DARV", "Darv", "she"),
        ("NEOW", "Neow", "it"),
        ("THE_ARCHITECT", "The Architect", "it"),
    ]
    assert guesses[0]["object"] == "her" and guesses[0]["possessive"] == "her"
    assert default == {
        "guess": "neutral",
        "subject": "they",
        "object": "them",
        "possessive": "their",
    }


def test_characters_without_a_guess_table_get_nothing(tmp_path):
    _event(tmp_path, "Neow", "It")
    assert (
        character_parser.parse_pronoun_guesses(
            {"SILENT.title": "The Silent"}, "SILENT", {}, tmp_path
        )
        is None
    )


def test_placeholder_dialogue_lines_are_dropped():
    loc = {
        "THE_ARCHITECT.talk.FOOL.0-0r.ancient": "TEMP: Who are you supposed to be?",
        "THE_ARCHITECT.talk.FOOL.0-1r.char": "TEMP: ...",
        "DARV.talk.FOOL.0-0.ancient": "Back in the Spire?",
        "DARV.talk.FOOL.0-1.char": "TEMP: reply",
    }
    dialogues = character_parser.parse_ancient_dialogues(loc, "FOOL")
    assert [
        (d["ancient"], [line["text"] for line in d["lines"]]) for d in dialogues
    ] == [("DARV", ["Back in the Spire?"])]


def test_placeholder_text_is_recognised():
    assert character_parser._is_placeholder(" todo ")
    assert character_parser._is_placeholder("TEMP: later")
    assert not character_parser._is_placeholder("Todo list")
    assert not character_parser._is_placeholder("...")
