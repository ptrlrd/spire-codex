"""Pydantic models for the API."""

from pydantic import BaseModel


class PowerApplied(BaseModel):
    power: str
    power_key: str | None = None
    amount: int


class CardRiderEffect(BaseModel):
    id: str
    name: str
    description: str


class CardTypeVariant(BaseModel):
    type: str
    description: str
    damage: int | None = None
    block: int | None = None
    image_url: str | None = None
    riders: list[CardRiderEffect] | None = None


class Card(BaseModel):
    id: str
    name: str
    description: str
    description_raw: str | None = None
    cost: int
    is_x_cost: bool | None = None
    is_x_star_cost: bool | None = None
    star_cost: int | None = None
    type: str
    type_key: str | None = None
    rarity: str
    rarity_key: str | None = None
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
    keywords_key: list[str] | None = None
    tags: list[str] | None = None
    spawns_cards: list[str] | None = None
    vars: dict[str, int] | None = None
    upgrade: dict[str, str | int | None] | None = None
    upgrade_description: str | None = None
    image_url: str | None = None
    beta_image_url: str | None = None
    type_variants: dict[str, CardTypeVariant] | None = None
    # `false` for cards that can never be added to combat by Skill Potion,
    # generated reward effects, etc. — typically Ancient cards (Neow's Fury)
    # and a handful of utility cards. The C# default is `true`, so we only
    # surface the field when it's explicitly `false` to keep the payload tight.
    can_be_generated_in_combat: bool | None = None
    compendium_order: int = 0


class CharacterDialogueLine(BaseModel):
    order: int
    speaker: str
    text: str


class CharacterDialogue(BaseModel):
    ancient: str
    ancient_name: str
    lines: list[CharacterDialogueLine]


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
    dialogue_color: str | None = None
    quotes: dict[str, str] | None = None
    dialogues: list[CharacterDialogue] | None = None
    image_url: str | None = None


class MerchantPrice(BaseModel):
    base: int
    min: int
    max: int


class Relic(BaseModel):
    id: str
    name: str
    description: str
    description_raw: str | None = None
    flavor: str | None = None
    rarity: str
    rarity_key: str | None = None
    pool: str
    merchant_price: MerchantPrice | None = None
    image_url: str | None = None
    image_variants: dict[str, str] | None = None
    # Per-character title overrides — only Sea Glass populates this
    # today (Demon Glass for Ironclad, Venom Glass for Silent, etc.).
    # Pydantic's response_model would silently strip the field if it
    # weren't declared here; the parser writes it but FastAPI dropped
    # it on the way out.
    name_variants: dict[str, str] | None = None
    notes: list[str] | None = None
    compendium_order: int = 0


class MonsterMovePower(BaseModel):
    power_id: str
    target: str
    amount: int


class MonsterMoveDamage(BaseModel):
    normal: int
    ascension: int | None = None
    hit_count: int | None = None


class MonsterMove(BaseModel):
    id: str
    name: str
    intent: str | None = None
    damage: MonsterMoveDamage | None = None
    block: int | None = None
    heal: int | None = None
    powers: list[MonsterMovePower] | None = None


class MonsterDamage(BaseModel):
    normal: int
    ascension: int | None = None
    hit_count: int | None = None


class MonsterEncounter(BaseModel):
    encounter_id: str
    encounter_name: str
    room_type: str
    act: str | None = None
    is_weak: bool = False


class MonsterInnatePower(BaseModel):
    power_id: str
    amount: int
    amount_ascension: int | None = None


class AttackPatternBranch(BaseModel):
    move_id: str
    weight: float | None = None
    repeat: str | None = None
    max_times: int | None = None
    condition: str | None = None


class AttackPatternState(BaseModel):
    id: str
    type: str
    move_id: str | None = None
    must_perform_once: bool | None = None
    next: str | None = None
    branches: list[AttackPatternBranch] | None = None


class AttackPattern(BaseModel):
    type: str
    initial_move: str | None = None
    states: list[AttackPatternState]
    description: str


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
    encounters: list[MonsterEncounter] | None = None
    innate_powers: list[MonsterInnatePower] | None = None
    attack_pattern: AttackPattern | None = None
    image_url: str | None = None
    beta_image_url: str | None = None


class Potion(BaseModel):
    id: str
    name: str
    description: str
    description_raw: str | None = None
    rarity: str
    rarity_key: str | None = None
    pool: str | None = None
    image_url: str | None = None
    compendium_order: int = 0


class Act(BaseModel):
    id: str
    name: str
    num_rooms: int | None = None
    bosses: list[str]
    ancients: list[str]
    events: list[str]
    encounters: list[str]


class Ascension(BaseModel):
    id: str
    level: int
    name: str
    description: str


class Enchantment(BaseModel):
    id: str
    name: str
    description: str
    description_raw: str | None = None
    extra_card_text: str | None = None
    card_type: str | None = None
    applicable_to: str | None = None
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


class EventPage(BaseModel):
    id: str
    description: str | None = None
    options: list[EventOption] | None = None


class DialogueLine(BaseModel):
    order: str
    speaker: str
    text: str


class Event(BaseModel):
    id: str
    name: str
    type: str
    act: str | None = None
    description: str | None = None
    preconditions: list[str] | None = None
    options: list[EventOption] | None = None
    pages: list[EventPage] | None = None
    epithet: str | None = None
    dialogue: dict[str, list[DialogueLine]] | None = None
    image_url: str | None = None
    relics: list[str] | None = None


class Power(BaseModel):
    id: str
    name: str
    description: str
    description_raw: str | None = None
    type: str
    stack_type: str
    allow_negative: bool | None = None
    image_url: str | None = None


class Keyword(BaseModel):
    id: str
    name: str
    description: str


class GlossaryTerm(BaseModel):
    id: str
    name: str
    description: str
    category: str


class Intent(BaseModel):
    id: str
    name: str
    description: str
    image_url: str | None = None


class Orb(BaseModel):
    id: str
    name: str
    description: str
    description_raw: str | None = None
    image_url: str | None = None


class Affliction(BaseModel):
    id: str
    name: str
    description: str
    extra_card_text: str | None = None
    is_stackable: bool = False


class Modifier(BaseModel):
    id: str
    name: str
    description: str


class Achievement(BaseModel):
    id: str
    name: str
    description: str
    category: str | None = None
    character: str | None = None
    threshold: int | None = None
    condition: str | None = None


class BadgeTier(BaseModel):
    rarity: str
    title: str
    description: str


class Badge(BaseModel):
    id: str
    name: str
    description: str
    tiered: bool
    tiers: list[BadgeTier]
    requires_win: bool
    multiplayer_only: bool
    image_url: str | None = None


class Epoch(BaseModel):
    id: str
    slug: str | None = None
    title: str
    description: str | None = None
    era: str
    era_name: str | None = None
    era_year: str | None = None
    era_position: int
    sort_order: int
    story_id: str | None = None
    unlock_info: str | None = None
    unlock_text: str | None = None
    unlocks_cards: list[str] | None = None
    unlocks_relics: list[str] | None = None
    unlocks_potions: list[str] | None = None
    expands_timeline: list[str] | None = None


class Story(BaseModel):
    id: str
    name: str
    epochs: list[str]


class GuideSummary(BaseModel):
    id: str
    slug: str
    title: str
    author: str
    date: str
    updated: str | None = None
    category: str
    tags: list[str]
    summary: str
    difficulty: str
    character: str | None = None
    website: str | None = None
    bluesky: str | None = None
    twitter: str | None = None
    twitch: str | None = None


class Guide(GuideSummary):
    content: str


class StatsResponse(BaseModel):
    cards: int
    characters: int
    relics: int
    monsters: int
    potions: int
    enchantments: int
    encounters: int
    events: int
    powers: int
    keywords: int
    intents: int
    orbs: int
    afflictions: int
    modifiers: int
    achievements: int
    epochs: int
    acts: int
    ascensions: int
    images: int
