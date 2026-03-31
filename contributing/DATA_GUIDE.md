# Data Guide

## Data Parsed

| Category | Count | Key Fields |
|----------|-------|------------|
| Cards | 576 | cost, type, rarity, damage, block, keywords, upgrades, compendium_order |
| Characters | 5 | HP, gold, energy, starting deck/relics, dialogues |
| Relics | 289 | rarity, pool, image_variants |
| Monsters | 116 | HP, moves with intents/damage/powers/block, encounter context |
| Potions | 63 | rarity, pool, compendium_order |
| Enchantments | 22 | card type restrictions, stackability |
| Encounters | 87 | monster compositions, room type, act, is_weak |
| Events | 66 | multi-page decision trees, choices |
| Powers | 257 | type (Buff/Debuff), stack type |
| Keywords | 8 | Exhaust, Ethereal, Innate, Retain, Sly, Eternal, Unplayable |
| Intents | 14 | Monster intent types with icons |
| Orbs | 5 | Passive/Evoke values |
| Afflictions | 9 | Stackability, extra card text |
| Modifiers | 16 | Custom mode run modifiers |
| Achievements | 33 | Unlock descriptions |
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
  ancient_pools.json
  showcase.json
  runs.db       SQLite (not committed)
  runs/         Shared run JSONs (not committed)
```

## Parsing Data

```bash
# Parse all languages
cd backend/app/parsers && python3 parse_all.py

# Parse English only
cd backend/app/parsers && python3 parse_all.py --lang eng

# Parse a single category
cd backend/app/parsers && python3 card_parser.py
cd backend/app/parsers && python3 monster_parser.py
```

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
