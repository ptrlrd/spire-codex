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
    }
