"""Service layer that loads and serves parsed game data from JSON files."""
import json
import os
from pathlib import Path
from functools import lru_cache

DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data"))


@lru_cache(maxsize=1)
def load_cards() -> list[dict]:
    with open(DATA_DIR / "cards.json", "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_characters() -> list[dict]:
    with open(DATA_DIR / "characters.json", "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_relics() -> list[dict]:
    with open(DATA_DIR / "relics.json", "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_monsters() -> list[dict]:
    with open(DATA_DIR / "monsters.json", "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_potions() -> list[dict]:
    with open(DATA_DIR / "potions.json", "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_enchantments() -> list[dict]:
    with open(DATA_DIR / "enchantments.json", "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_encounters() -> list[dict]:
    with open(DATA_DIR / "encounters.json", "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_events() -> list[dict]:
    with open(DATA_DIR / "events.json", "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_powers() -> list[dict]:
    with open(DATA_DIR / "powers.json", "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_keywords() -> list[dict]:
    with open(DATA_DIR / "keywords.json", "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_intents() -> list[dict]:
    with open(DATA_DIR / "intents.json", "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_orbs() -> list[dict]:
    with open(DATA_DIR / "orbs.json", "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_afflictions() -> list[dict]:
    with open(DATA_DIR / "afflictions.json", "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_modifiers() -> list[dict]:
    with open(DATA_DIR / "modifiers.json", "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_achievements() -> list[dict]:
    with open(DATA_DIR / "achievements.json", "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_epochs() -> list[dict]:
    with open(DATA_DIR / "epochs.json", "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_stories() -> list[dict]:
    with open(DATA_DIR / "stories.json", "r", encoding="utf-8") as f:
        return json.load(f)


def get_stats() -> dict:
    return {
        "cards": len(load_cards()),
        "characters": len(load_characters()),
        "relics": len(load_relics()),
        "monsters": len(load_monsters()),
        "potions": len(load_potions()),
        "enchantments": len(load_enchantments()),
        "encounters": len(load_encounters()),
        "events": len(load_events()),
        "powers": len(load_powers()),
        "keywords": len(load_keywords()),
        "intents": len(load_intents()),
        "orbs": len(load_orbs()),
        "afflictions": len(load_afflictions()),
        "modifiers": len(load_modifiers()),
        "achievements": len(load_achievements()),
        "epochs": len(load_epochs()),
    }
