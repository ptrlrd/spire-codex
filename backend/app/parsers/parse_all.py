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
    # Encounters must run before monsters: monster_parser reads the
    # parsed encounters.json to back-link "this monster appears in
    # encounter X" into each monster record. Running them out of order
    # silently nulled every monster's `encounters` field on the first
    # pass against a fresh data dir — caught when cutting beta v0.105.0
    # against an empty data-beta/v0.105.0/.
    parse_encounters(lang)
    parse_monsters(lang)
    parse_potions(lang)
    parse_enchantments(lang)
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

    # Ancient relic pools — language-agnostic. Validates the hand-coded
    # `data/ancient_pools.json` against the C# event source so additions
    # / removals show up immediately instead of weeks later via a user
    # bug report (see PR #170).
    from ancient_pool_parser import main as parse_ancient_pools

    parse_ancient_pools()

    # Merchant pricing config — language-agnostic. Pulls card / potion /
    # relic / removal cost constants from the C# entry classes so the
    # frontend `/merchant` page can render from data instead of hardcoded
    # numbers (which silently desync on every Mega Crit balance pass).
    from merchant_parser import main as parse_merchant_config

    parse_merchant_config()

    # Mechanics page constants — language-agnostic. Pulls named numeric
    # constants out of the C# odds files so the /mechanics pages have
    # an authoritative source instead of hand-typed numbers (which
    # drift silently on every Mega Crit balance pass).
    from mechanics_constants_parser import main as parse_mechanics_constants

    parse_mechanics_constants()

    print("\n=== Done! ===")
