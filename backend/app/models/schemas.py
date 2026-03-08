"""Pydantic models for the API."""
from pydantic import BaseModel


class PowerApplied(BaseModel):
    power: str
    amount: int


class Card(BaseModel):
    id: str
    name: str
    description: str
    description_raw: str | None = None
    cost: int
    is_x_cost: bool | None = None
    type: str
    rarity: str
    target: str
    color: str
    damage: int | None = None
    block: int | None = None
    hit_count: int | None = None
    powers_applied: list[PowerApplied] | None = None
    cards_draw: int | None = None
    energy_gain: int | None = None
    hp_loss: int | None = None
    keywords: list[str] | None = None
    tags: list[str] | None = None
    vars: dict[str, int] | None = None
    upgrade: dict[str, str | int | None] | None = None
    image_url: str | None = None
    beta_image_url: str | None = None


class Character(BaseModel):
    id: str
    name: str
    description: str
    starting_hp: int | None = None
    starting_gold: int | None = None
    max_energy: int | None = None
    orb_slots: int | None = None
    starting_deck: list[str]
    starting_relics: list[str]
    unlocks_after: str | None = None
    gender: str | None = None
    color: str | None = None
    image_url: str | None = None


class Relic(BaseModel):
    id: str
    name: str
    description: str
    description_raw: str | None = None
    flavor: str | None = None
    rarity: str
    pool: str
    image_url: str | None = None


class MonsterMove(BaseModel):
    id: str
    name: str


class MonsterDamage(BaseModel):
    normal: int
    ascension: int | None = None


class Monster(BaseModel):
    id: str
    name: str
    type: str
    min_hp: int | None = None
    max_hp: int | None = None
    min_hp_ascension: int | None = None
    max_hp_ascension: int | None = None
    moves: list[MonsterMove] | None = None
    damage_values: dict[str, MonsterDamage] | None = None
    block_values: dict[str, int] | None = None
    image_url: str | None = None


class Potion(BaseModel):
    id: str
    name: str
    description: str
    description_raw: str | None = None
    rarity: str
    image_url: str | None = None


class Enchantment(BaseModel):
    id: str
    name: str
    description: str
    description_raw: str | None = None
    extra_card_text: str | None = None
    card_type: str | None = None
    is_stackable: bool = False
    image_url: str | None = None


class EncounterMonster(BaseModel):
    id: str
    name: str


class Encounter(BaseModel):
    id: str
    name: str
    room_type: str
    is_weak: bool = False
    act: str | None = None
    tags: list[str] | None = None
    monsters: list[EncounterMonster] | None = None
    loss_text: str | None = None


class EventOption(BaseModel):
    id: str
    title: str
    description: str


class Event(BaseModel):
    id: str
    name: str
    type: str
    act: str | None = None
    description: str | None = None
    options: list[EventOption] | None = None


class StatsResponse(BaseModel):
    cards: int
    characters: int
    relics: int
    monsters: int
    potions: int
    enchantments: int
    encounters: int
    events: int
