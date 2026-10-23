"""Pydantic models for the API."""

import os

from pydantic import BaseModel, Field, computed_field

# Base URL for the full game-rendered card images (the whole card: frame, art,
# banner, animated flame). Stable channel by default; a beta deploy can point
# this at the beta render set. Upgraded cards add the `_upg` suffix; ancients
# are animated webps. `mad_science` has no full render.
CARD_FULL_BASE = os.getenv(
    "CARD_FULL_BASE", "https://cdn.spire-codex.com/cards-full/stable"
).rstrip("/")


def _full_render_base() -> str:
    """CDN base for full card renders on the current request's channel: the
    stable set by default, or the current beta archive
    (cards-full/beta/<version>) when the beta channel is active. Falls back to
    stable if the beta version can't be resolved (or CARD_FULL_BASE points
    somewhere non-standard), so a render URL is never broken; background threads
    read stable."""
    if not CARD_FULL_BASE.endswith("/stable"):
        return CARD_FULL_BASE
    try:
        from ..services.data_service import get_beta_render_version, get_channel

        if get_channel() == "beta":
            version = (get_beta_render_version() or "").lstrip("v")
            if version:
                root = CARD_FULL_BASE[: -len("/stable")]
                return f"{root}/beta/{version}"
    except Exception:
        pass
    return CARD_FULL_BASE


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


class CardSource(BaseModel):
    """Where a card comes from in combat, e.g. a monster that generates it."""

    type: str
    id: str
    name: str


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
    vars: dict[str, int | float] | None = None
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
    # Present (true) on the 21 co-op-only cards; absent otherwise.
    multiplayer_only: bool | None = None
    compendium_order: int = 0
    # Which monsters generate this card in combat (parsed from the game code —
    # see card_parser.build_card_sources). Absent on cards with no source.
    sources: list[CardSource] | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def image_url_card(self) -> str | None:
        """Full game-rendered card image (frame + art + text; animated for
        ancients). `null` when there's no render (mad_science)."""
        if self.id.lower() == "mad_science":
            return None
        return f"{_full_render_base()}/{self.id.lower()}.webp"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def image_url_card_upg(self) -> str | None:
        """Full game-rendered image of the upgraded card. `null` when the card
        has no upgrade."""
        if not self.upgrade or self.id.lower() == "mad_science":
            return None
        return f"{_full_render_base()}/{self.id.lower()}_upg.webp"


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
    animation_url: str | None = None


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


class MonsterQuote(BaseModel):
    key: str
    move: str | None = None
    text: str


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
    quotes: list[MonsterQuote] | None = None
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
    index: int | None = None
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


class EntityRef(BaseModel):
    """Minimal cross-entity link: just enough to render a named list item."""

    id: str
    name: str


class Orb(BaseModel):
    id: str
    name: str
    description: str
    description_raw: str | None = None
    image_url: str | None = None
    # Cards/relics whose text Channels this orb (single-orb endpoint only).
    channeled_by_cards: list[EntityRef] | None = None
    channeled_by_relics: list[EntityRef] | None = None


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
    image_url: str | None = None


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
    # "beta" points the page's hovertip widget (and entity links) at the beta
    # channel; absent/None serves stable. Without this field the response
    # model silently strips what guides.json carries.
    channel: str | None = None


class Guide(GuideSummary):
    content: str


class ArchetypeEntity(BaseModel):
    id: str
    name: str


class ArchetypeTrend(BaseModel):
    version: str = Field(description="Newest tracked game version.")
    delta: float = Field(
        description="Change in share, in percentage points, since the previous tracked version."
    )


class ArchetypeHistoryPoint(BaseModel):
    version: str
    share: float = Field(description="Percent of the character's runs on this version.")
    win_rate: float = Field(description="Win rate on this version, 0-100.")


class Archetype(BaseModel):
    name: str = Field(description="Known build name, else its top two defining cards.")
    size: int = Field(description="Runs in the cluster.")
    share: float = Field(description="Percent of the character's runs, 0-100.")
    win_rate: float = Field(description="Win rate, 0-100.")
    defining_cards: list[ArchetypeEntity]
    defining_relics: list[ArchetypeEntity]
    example_runs: list[str] = Field(description="Run hashes, open at /runs/{hash}.")
    trend: ArchetypeTrend | None = Field(
        description="Null until two game versions each have 200+ runs for the character."
    )
    history: list[ArchetypeHistoryPoint] = Field(
        description="Share and win rate on up to the last six versions with 200+ runs."
    )


class ArchetypesResponse(BaseModel):
    available: bool = Field(description="False until the first nightly build exists.")
    built_at: str | None = Field(
        None, description="When the clusters were built (UTC, ISO 8601)."
    )
    characters: dict[str, list[Archetype]] = Field(
        description="Archetypes per character id (IRONCLAD, SILENT, ...)."
    )
