# Data Guide

## Data Parsed

| Category | Count | Key Fields |
|----------|-------|------------|
| Cards | 577 | cost, type, rarity, damage, block, keywords, upgrades, upgrade_description, compendium_order |
| Characters | 5 | HP, gold, energy, starting deck/relics, dialogues |
| Relics | 296 | rarity, pool, image_variants, merchant_price |
| Monsters | 115 | HP, moves with intents/damage/powers/block/hit counts, innate powers, encounter context, attack_pattern (state machine) |
| Potions | 63 | rarity, pool, compendium_order |
| Enchantments | 22 | card type restrictions, stackability |
| Encounters | 87 | monster compositions, room type, act, is_weak |
| Events | 66 | multi-page decision trees, choices, runtime-computed values (gold ranges, escalating costs), preconditions |
| Powers | 257 | type (Buff/Debuff), stack type |
| Keywords | 7 | Card keywords |
| Intents | 14 | Monster intent types with icons |
| Orbs | 5 | Passive/Evoke values |
| Afflictions | 7 | Stackability, extra card text |
| Modifiers | 16 | Custom mode run modifiers |
| Achievements | 22 | Unlock descriptions, category, character, threshold, condition |
| Badges | 23 | Run-end mini-achievements; Bronze/Silver/Gold tiers, requires_win + multiplayer_only flags, per-tier title + description |
| Acts | 4 | Bosses, encounters, events, ancients |
| Ascensions | 11 | Levels 0-10 with descriptions |
| Epochs | 57 | Timeline epochs with era grouping |
| Stories | 8 | Story / timeline text |
| Glossary | 28 | Reference terms |
| Rest-site options | 9 | Campfire choices (HEAL, SMITH, ...) |
| Messages | 46 tables | The game's own localization tables as ICU MessageFormat (`messages.json`), served by `/api/localizations` |
| Translations | 8 maps | English filter values → localized display names (`translations.json`, behind the deprecated `/api/translations`) |

Counts are `data/eng/*.json` on 2026-10-18. They move with every game patch, so count the array yourself before quoting one.

## Data Files

All parsed data lives in `data/{lang}/` directories:

```
data/
  eng/          English (primary)
  deu/          German
  esp/          Spanish (ES)
  fra/          French
  ita/          Italian
  jpn/          Japanese
  kor/          Korean
  pol/          Polish
  ptb/          Portuguese (BR)
  rus/          Russian
  spa/          Spanish (LA)
  tha/          Thai
  tur/          Turkish
  zhs/          Simplified Chinese
  zht/          Traditional Chinese (English fallback for untranslated strings)
  changelogs/   Version diffs
  guides/       Markdown guide files with YAML frontmatter
  guides.json   Parsed guide data
  mechanics_pages/          Mechanics markdown, served by /api/mechanics/sections
  mechanics_constants.json  Named numeric constants (odds, economy, progression)
  merchant_config.json      Shop prices, served by /api/merchant/config
  news/                     Archived Steam announcements, one JSON per gid
  ancient_pools.json ancient_pools_parsed.json   Ancient relic-offering pools (generated)
  archetype_names.json      Community names for discovered deck archetypes (keyed by the top-2 defining card ids)
  relic_notes.json          Per-relic clarification notes (Toy Box wax rules, etc.)
  site_pages.json           Site page inventory for search, generated from the frontend route tree by frontend/scripts/generate-site-pages.mjs
  image_dumps.json          Which image dumps exist per version and channel
  showcase.json
  runs.db       Legacy SQLite fallback, not committed (run metadata now lives in MongoDB)
  runs/         Submitted run JSONs, not committed (deck/relic source for Codex Score)
```

Each language directory also carries `messages.json` (the game's strings as ICU MessageFormat) and `translations.json` next to the entity files.

## Parsing Data

```bash
# Parse all languages (stable)
cd backend/app/parsers && python3 parse_all.py

# Parse English only
cd backend/app/parsers && python3 parse_all.py --lang eng

# Parse a single category
cd backend/app/parsers && python3 card_parser.py
cd backend/app/parsers && python3 monster_parser.py

# Parse one beta version from the repo root
VERSION=vX.Y.Z
(cd backend/app/parsers && \
  EXTRACTION_DIR=../../../extraction/beta \
  DATA_DIR="../../../data-beta/$VERSION" \
  python3 parse_all.py)
```

Parsers support `EXTRACTION_DIR` and `DATA_DIR` environment variables (via `parser_paths.py`) to target alternate extraction sources and output directories. `CDN_BASE_URL` makes them write CDN image URLs.

### Parsers (`backend/app/parsers/`)

| Parser | Output |
|--------|--------|
| `card_parser.py`, `relic_parser.py`, `potion_parser.py`, `power_parser.py`, `monster_parser.py`, `event_parser.py`, `encounter_parser.py`, `enchantment_parser.py`, `character_parser.py` | The main entity files |
| `keyword_parser.py` | keywords, intents, orbs, afflictions |
| `act_parser.py`, `ascension_parser.py`, `epoch_parser.py`, `badge_parser.py` | acts, ascensions, epochs + stories, badges |
| `pool_parser.py`, `ancient_pool_parser.py` | item pool assignments; `ancient_pools.json` is generated from the C# event files |
| `rest_site_parser.py` | `rest_site_options.json` |
| `merchant_parser.py`, `mechanics_constants_parser.py` | `merchant_config.json`, `mechanics_constants.json` |
| `localization_parser.py`, `message_parser.py`, `icu_check.py` | `messages.json` per language (SmartFormat → ICU MessageFormat, validated) |
| `translation_parser.py` | `translations.json` per language |
| `guide_parser.py`, `news_parser.py` | `guides.json`, `news/` |
| `orphan_filter.py` | Skips C# classes left over from older game versions |
| `description_resolver.py`, `parser_paths.py`, `parse_all.py` | Shared template resolver, path config, orchestrator |

### One-off builders (`backend/scripts/`)

Not part of `parse_all.py`. Run from `backend/` as `python -m scripts.<name>`:

- `build_search_index.py`: the tantivy site search index
- `build_embeddings.py`: Workers AI embeddings for semantic search (`data/embeddings/`)
- `build_run_vectors.py`, `build_draft_recs.py`, `build_pairings.py`: run-composition vectors, draft recommendations, item pairings
- `copy_images.py`: copy and organize game art into `backend/static/images/`
- `backfill_*.py`, `rehide_*.py`, `repair_coop_attribution.py`, `seed_thanks.py`: Mongo repairs and seeds

## Rich Text Tags

Text fields may contain Godot BBCode-style tags from the game:

| Tag | Rendered as |
|-----|-------------|
| `[gold]...[/gold]` | Gold colored text |
| `[red]...[/red]` | Red colored text |
| `[blue]...[/blue]` | Blue colored text |
| `[green]...[/green]` | Green colored text |
| `[purple]...[/purple]` | Purple colored text |
| `[sine]...[/sine]` | Wavy animated text |
| `[jitter]...[/jitter]` | Shaking animated text |
| `[b]...[/b]` | Bold text |
| `[energy:N]` | Energy icon(s) |
| `[star:N]` | Star icon(s) |

The frontend `RichDescription` component renders these.

## Merchant Pricing (from decompiled C#, in `data/merchant_config.json`)

### Cards
- Common: 48-52 gold (base 50). Colorless +15%. On sale: half.
- Uncommon: 71-79 gold (base 75)
- Rare: 142-158 gold (base 150)

### Relics
Major Update #1 (v0.103.2) reduced every relic base by 25g:
- Common: 149-201 (base 175). Shop: 170-230 (base 200). Uncommon: 191-259 (base 225). Rare: 234-316 (base 275).
- Fake Merchant: all 50 gold flat (10 fakes — `IsAllowedInShops => false`)
- Blacklisted from regular shop: The Courier, Old Coin, Lucky Fysh, Bowler Hat, Amethyst Aubergine (last three added in MU#1)

### Potions
- Common: 48-52. Uncommon: 71-79. Rare: 95-105.

### Card Removal
- 75 + 25 × removals used (no RNG)
- Ascension 6+ — Inflation: 100 + 50 × removals used (replaced Gloom / 1-fewer-rest-site in Major Update #1)

## Versioning

`1.X.Y` — 1 = Codex major, X = bumps on Mega Crit game patch, Y = our fixes/improvements.

## Generating Changelogs

```bash
# Compare against a tag
python3 tools/diff_data.py v1.0.11 --format json --game-version "1.0.12" --date "2026-03-30" --title "Title"

# Preview as text
python3 tools/diff_data.py v1.0.11 --format text
```

### Field-level recursion

`diff_data.py` recurses into nested dicts and lists so each leaf becomes its own change row:

```
vars.DamageVar:                    8 → 10
moves[GRASP].damage.normal:        8 → 10
attack_pattern.initial_move:       WHAT_IS_IT → DRAMATIC_OPEN
```

instead of opaque `vars: 2 fields → 2 fields`. List items with stable `id` fields are matched by id (`moves[BEAM_MOVE]` rather than `moves[2]`).

### Curated release notes

After running the script, hand-edit the JSON to add three arrays at the top level:

- `features`: bullet per feature shipped this release
- `fixes`: bullet per bug fix
- `api_changes`: bullet per new/changed API endpoint

These survive a regen — `diff_data.py` merges them through if the file at the target tag already exists. The data-diff portion is always overwritten on regen, but the curated notes are preserved.

### Write-once rule

Files in `data/changelogs/` are write-once. CI (`.github/workflows/changelog-guard.yml`) blocks PRs that modify or delete an existing changelog. New files (`A`) are always allowed; modifications require the `changelog-edit-approved` label on the PR. See `CONTRIBUTING.md → Changelog Retention` for the full policy.
