"""Run all parsers and generate structured JSON data files."""
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
from epoch_parser import main as parse_epochs

if __name__ == "__main__":
    print("=== Parsing Slay the Spire 2 Game Data ===\n")
    parse_cards()
    parse_characters()
    parse_relics()
    parse_monsters()
    parse_potions()
    parse_enchantments()
    parse_encounters()
    parse_events()
    parse_powers()
    parse_keywords_etc()
    parse_epochs()
    print("\n=== Done! ===")
