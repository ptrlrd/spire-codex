"""Run all parsers and generate structured JSON data files."""

import sys
from card_parser import main as parse_cards
from character_parser import main as parse_characters
from relic_parser import main as parse_relics
from monster_parser import main as parse_monsters
from potion_parser import main as parse_potions
from enchantment_parser import main as parse_enchantments
from encounter_parser import main as parse_encounters
from event_parser import main as parse_events
from power_parser import main as parse_powers
from keyword_parser import main as parse_keywords_etc
from badge_parser import main as parse_badges
from epoch_parser import main as parse_epochs
from act_parser import main as parse_acts
from ascension_parser import main as parse_ascensions
from pool_parser import main as parse_pools
from translation_parser import main as parse_translations
from news_parser import main as parse_news

LANGUAGES = [
    "deu",
    "eng",
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
]


def parse_language(lang: str):
    """Run all parsers for a single language."""
    parse_cards(lang)
    parse_characters(lang)
    parse_relics(lang)
    parse_monsters(lang)
    parse_potions(lang)
    parse_enchantments(lang)
    parse_encounters(lang)
    parse_events(lang)
    parse_powers(lang)
    parse_keywords_etc(lang)
    parse_badges(lang)
    parse_epochs(lang)
    parse_acts(lang)
    parse_ascensions(lang)
    parse_pools(lang)  # Must run after potions
    parse_translations(lang)


if __name__ == "__main__":
    # Usage: python3 parse_all.py [--lang LANG|all]
    lang_arg = "all"
    if "--lang" in sys.argv:
        idx = sys.argv.index("--lang")
        if idx + 1 < len(sys.argv):
            lang_arg = sys.argv[idx + 1]

    if lang_arg == "all":
        languages = LANGUAGES
    else:
        languages = [lang_arg]

    print("=== Parsing Slay the Spire 2 Game Data ===\n")
    for lang in languages:
        print(f"\n--- Language: {lang} ---")
        parse_language(lang)
    # Guides are language-independent
    from guide_parser import main as parse_guides

    parse_guides()

    # Steam news is language-agnostic — fetch once after the per-lang sweep.
    parse_news()

    print("\n=== Done! ===")
