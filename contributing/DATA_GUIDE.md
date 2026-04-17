# Data Guide

## Data Parsed

| Category | Count | Key Fields |
|----------|-------|------------|
| Cards | 576 | cost, type, rarity, damage, block, keywords, upgrades, upgrade_description, compendium_order |
| Characters | 5 | HP, gold, energy, starting deck/relics, dialogues |
| Relics | 293 | rarity, pool, image_variants, merchant_price |
| Monsters | 115 | HP, moves with intents/damage/powers/block/hit counts, innate powers, encounter context, attack_pattern (state machine) |
| Potions | 63 | rarity, pool, compendium_order |
| Enchantments | 22 | card type restrictions, stackability |
| Encounters | 87 | monster compositions, room type, act, is_weak |
| Events | 66 | multi-page decision trees, choices, runtime-computed values (gold ranges, escalating costs), preconditions |
| Powers | 259 | type (Buff/Debuff), stack type |
| Keywords | 8 | Exhaust, Ethereal, Innate, Retain, Sly, Eternal, Unplayable |
| Intents | 14 | Monster intent types with icons |
| Orbs | 5 | Passive/Evoke values |
| Afflictions | 8 | Stackability, extra card text |
| Modifiers | 16 | Custom mode run modifiers |
| Achievements | 33 | Unlock descriptions, category, character, threshold, condition |
| **Badges** | **25** | **Run-end mini-achievements; Bronze/Silver/Gold tiers, requires_win + multiplayer_only flags, per-tier title + description** |
| Acts | 4 | Bosses, encounters, events, ancients |
| Ascensions | 11 | Levels 0-10 with descriptions |

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
  changelogs/   Version diffs
  guides/       Markdown guide files with YAML frontmatter
  guides.json   Parsed guide data
  ancient_pools.json
  showcase.json
  runs.db       SQLite (not committed)
  runs/         Shared run JSONs (not committed)
```

## Parsing Data

```bash
# Parse all languages (stable)
cd backend/app/parsers && python3 parse_all.py

# Parse English only
cd backend/app/parsers && python3 parse_all.py --lang eng

# Parse a single category
cd backend/app/parsers && python3 card_parser.py
cd backend/app/parsers && python3 monster_parser.py

# Parse beta data (from Steam beta branch)
cd backend/app/parsers
EXTRACTION_DIR=extraction/beta DATA_DIR=data-beta python3 parse_all.py
```

Parsers support `EXTRACTION_DIR` and `DATA_DIR` environment variables (via `parser_paths.py`) to target alternate extraction sources and output directories.

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

## Merchant Pricing (from decompiled C#)

### Cards
- Common: 48-53 gold (base 50). Colorless +15%. On sale: half.
- Uncommon: 71-79 gold (base 75)
- Rare: 143-158 gold (base 150)

### Relics
- Common: 170-230 gold. Shop: 191-259. Uncommon: 213-288. Rare: 255-345.
- Fake Merchant: all 50 gold flat

### Potions
- Common: 48-53. Uncommon: 71-79. Rare: 95-105.

### Card Removal
- 75 + 25 × removals used (no RNG)

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
