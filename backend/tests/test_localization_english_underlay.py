"""A language missing a string gets the English one, the way the game shows it."""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app" / "parsers"))

import parser_paths  # noqa: E402


def _write(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


@pytest.fixture
def raw(tmp_path, monkeypatch):
    monkeypatch.setattr(parser_paths, "RAW_DIR", tmp_path)
    parser_paths.loc_dir.cache_clear()
    loc = tmp_path / "localization"
    _write(
        loc / "eng" / "cards.json",
        {"BASH.title": "Bash", "KI_WHIP.title": "Ki Whip"},
    )
    _write(loc / "eng" / "powers.json", {"AIM.title": "Aim"})
    _write(loc / "tha" / "cards.json", {"BASH.title": "ทุบตี"})
    yield loc
    parser_paths.loc_dir.cache_clear()


def test_english_reads_its_own_folder(raw):
    assert parser_paths.loc_dir("eng") == raw / "eng"


def test_missing_strings_and_tables_come_from_english(raw):
    merged = parser_paths.loc_dir("tha")
    cards = json.loads((merged / "cards.json").read_text(encoding="utf-8"))
    assert cards == {"BASH.title": "ทุบตี", "KI_WHIP.title": "Ki Whip"}
    powers = json.loads((merged / "powers.json").read_text(encoding="utf-8"))
    assert powers == {"AIM.title": "Aim"}


def test_a_language_the_build_lacks_stays_missing(raw):
    assert not parser_paths.loc_dir("ind").is_dir()
