# Architecture

## Overview

Spire Codex extracts game data from Slay the Spire 2 (Godot 4 / C#/.NET 8) and serves it through a FastAPI backend + Next.js frontend.

## Data Pipeline

1. **PCK Extraction** — GDRE Tools extracts the Godot `.pck` file → images, Spine animations, localization (~9,947 files)
2. **DLL Decompilation** — ILSpy decompiles `sts2.dll` → ~3,300 C# source files
3. **Data Parsing** — Python regex parsers extract structured data from C# + localization JSON → per-language JSON in `data/{lang}/`
4. **Spine Rendering** — Headless Node.js renderer (Playwright + spine-webgl) → 512×512 monster/character PNGs
5. **API + Frontend** — FastAPI serves parsed JSON, Next.js consumes it

## Key Discovery

The game is built with Godot 4 but all logic is in a C#/.NET 8 DLL, not GDScript. Only 48 GDScript files exist (VFX testers).

## Backend (`backend/`)

- **FastAPI** with Pydantic schemas, slowapi rate limiting, GZip compression
- **25+ routers** in `app/routers/` — one per entity type + guides, runs, feedback
- **Data service** loads JSON from `data/{lang}/` with LRU caching
- **SQLite** (`data/runs.db`) for community run submissions
- **Static images** served from `backend/static/images/`

### Parsers (`backend/app/parsers/`)

Each parser reads decompiled C# source + localization JSON and outputs structured data:

| Parser | Extracts |
|--------|----------|
| `card_parser.py` | Cards — cost, type, rarity, damage, block, keywords, upgrades, DynamicVars |
| `monster_parser.py` | Monsters — HP, moves with intents/powers/damage/hit counts, innate powers, encounter context |
| `relic_parser.py` | Relics — rarity, pool, descriptions, image variants |
| `power_parser.py` | Powers — type (Buff/Debuff), stack type, inheritance resolution |
| `event_parser.py` | Events — multi-page decision trees, choices from C# source order, runtime-computed values |
| `guide_parser.py` | Guides — markdown with YAML frontmatter |
| `encounter_parser.py` | Encounters — monster compositions, room type, act, tags |
| `description_resolver.py` | Shared SmartFormat template resolver |
| `parser_paths.py` | Shared path config — supports `EXTRACTION_DIR`/`DATA_DIR` env vars for beta |
| `parse_all.py` | Orchestrates all parsers for all 14 languages |

### Key Patterns

- **Card DynamicVars**: `new DamageVar(8m)`, `new BlockVar(5m)`, `new PowerVar<VulnerablePower>(2m)`
- **CalculatedDamage**: Cards like Ashen Strike use `CalculationBase + ExtraDamage * multiplier` — display shows base only
- **Power inheritance**: 19 powers inherit from Temporary{Strength,Dexterity,Focus}Power
- **Monster move effects**: Extracted from `PowerCmd.Apply<T>()` in move method bodies
- **Monster innate powers**: Extracted from `AfterAddedToRoom` (42 monsters)
- **Card upgrade descriptions**: `upgrade_description` resolved with upgraded var values for correct plurals/icons
- **Event dynamic values**: Runtime-computed values via special handlers (Tablet of Truth, Abyssal Baths) and CalculateVars patterns (`+=`/`-=` with NextInt/NextFloat)
- **ID format**: PascalCase class name → UPPER_SNAKE_CASE

## Frontend (`frontend/`)

- **Next.js 16** App Router with server + client components
- **Tailwind CSS** with CSS variables for theming
- **`force-dynamic`** on all pages that fetch from API (API unavailable during Docker build)
- **TypeScript** strict mode, interfaces in `lib/api.ts`

### Key Files

| File | Purpose |
|------|---------|
| `lib/api.ts` | API client + all TypeScript interfaces |
| `lib/ui-translations.ts` | Manual UI string translations for 13 languages |
| `lib/use-lang-prefix.ts` | Hook for language-aware URL construction |
| `app/globals.css` | CSS variables — colors, theme |
| `app/components/RichDescription.tsx` | BBCode tag renderer for game text |
| `app/components/CardGrid.tsx` | Card grid with inline icons |
| `app/contexts/LanguageContext.tsx` | i18n state from URL path |

### Color System

Colors are sampled from the game's energy icons and main menu:

```css
--color-ironclad: #d53b27;
--color-silent: #23935b;
--color-defect: #3873a9;
--color-necrobinder: #bf5a85;
--color-regent: #f07c1e;
--accent-gold: #e8b830;
--accent-teal: #45cfd8;
```

Do NOT use generic Tailwind colors (`text-red-400`, `bg-green-500`) for character-specific UI. Use the CSS variables.

## API

All endpoints accept `?lang=` (default: `eng`). Responses are GZip-compressed with 5-minute cache.

- **List endpoints**: `GET /api/cards`, `GET /api/monsters`, etc. with filters
- **Detail endpoints**: `GET /api/cards/{id}`, `GET /api/monsters/{id}`, etc.
- **Runs**: `POST /api/runs` (submit), `GET /api/runs/stats` (aggregated meta), `GET /api/runs/list` (browse — accepts `seed`, `build_id`, `sort` filters), `GET /api/runs/leaderboard` (ranked wins-only), `GET /api/runs/versions` (distinct game versions), `GET /api/runs/shared/{hash}` (shared run detail)
- **Guides**: `GET /api/guides` (list with filters), `GET /api/guides/{slug}` (detail), `POST /api/guides` (Discord webhook submission)
- **Docs**: `http://localhost:8000/docs` (Swagger UI)

Filter parameters always use English values regardless of language.

## Localization

- 14 languages from game's localization files
- `_key` fields preserve English values alongside localized display strings (e.g., `rarity_key: "Rare"` stays English while `rarity: "稀有"` is localized)
- UI chrome partially translated via `lib/ui-translations.ts`

## Spine Rendering

Monster sprites are Spine skeletal animations (.skel + .atlas + .png), not static images.

- **WebGL renderer** (`tools/spine-renderer/render_webgl.mjs`) — Playwright + spine-webgl via headless Chrome, single frame.
- **Batch renderer** (`tools/spine-renderer/render_all_webgl.mjs`) — all 138 skeletons as static PNGs.
- **Animation renderer** (`tools/spine-renderer/render_gif.mjs`) — animated WebP/GIF/APNG with skin variant and animation selection support. Streams frames to disk for WebP/APNG to avoid OOM.
- **Static output**: 512×512 transparent PNGs (+ same-source WebPs).
- **Animation output**: 209 lossless animated WebPs (characters at 512×512, monsters at 256×256).

### Renderer flags (`render_webgl.mjs`)

| Flag | Purpose | Example |
|---|---|---|
| `--skin=a,b,c` | Combine variant skins with `default`. Required for skeletons that split body / eye / variant across multiple skins. | `--skin=moss1,diamondeye` for cubex_construct, `--skin=skin1` for scroll_of_biting |
| `--anim=name` | Override the auto-picked idle animation. | `--anim=attack` |
| `--anim-time=<seconds>` | Advance the animation N seconds before snapshotting. For skeletons that assemble over the first few frames. | `--anim-time=0.5` |
| `--white` | Convert all visible pixels to white silhouette. | — |
| `--only-slots=<pattern>` | Render only slots matching a substring. | — |

### Hidden slots + smoke substitution

The renderer maintains two lists for placeholder content the game replaces with shaders at runtime:

- **`HIDDEN_SLOTS`** (stripped before draw) — `smokeplacholder`, `smoke_placeholder`, `megatail`, `megablade`, `soundwave`, `beckonwave`. These are weapon / soundwave VFX with no good static substitute.
- **`SMOKE_PLACEHOLDER_PAGES`** (texture swapped with a generated cloud) — `gas_bomb_2.png`, `the_forgotten_2.png`, `living_smog_2.png`. Each placeholder atlas page is replaced with a procedurally generated dark plum smoke texture at the same dimensions before GL upload, so the slot's mesh deformation drives a real-looking smoke effect. Slot `color.a` is forced to `1.0` for substituted slots — the original artists set low alpha (0.26-0.38) expecting a shader to add density, and without the shader the cloud reads washed out.

### Re-framing undersized renders

`tools/rescale_bestiary.py` is a post-processor that crops to the **true alpha bbox** (not the Spine vertex bbox) and rescales each monster's PNG + WebP to fill 92% of the 512×512 frame. Run it after `render_all_webgl.mjs` for monsters whose visible sprite was sitting at low frame coverage.

```bash
python3 tools/rescale_bestiary.py fuzzy_wurm_crawler thieving_hopper terror_eel
```

## Badges

Run-end mini-achievements awarded on the Game Over screen (introduced in v0.103.x beta, shipped to stable in Major Update #1).

- **Parser** (`backend/app/parsers/badge_parser.py`) — reads `MegaCrit.Sts2.Core.Models.Badges/*.cs` for `Id` / `RequiresWin` / `MultiplayerOnly`, groups bronze/silver/gold tier titles + descriptions from `localization/<lang>/badges.json`. Outputs 25 badges per language (Thai is empty upstream).
- **Schema** (`backend/app/models/schemas.py`): `Badge` + `BadgeTier` Pydantic models.
- **Router** (`backend/app/routers/badges.py`): `GET /api/badges` (filters: `tiered`, `multiplayer_only`, `requires_win`, `search`), `GET /api/badges/{id}`.
- **Frontend**: `/badges` list page (tiered / single-tier / multiplayer sections), `/badges/[id]` detail page (Bronze / Silver / Gold tier breakdown). Mirror routes at `/[lang]/badges` for all 14 languages.

## Image Pipeline

`backend/scripts/copy_images.py` copies game art from `extraction/raw/images/` to `backend/static/images/`. Each PNG is copied **and** a sibling WebP is generated from the same source (`quality=95`, `method=6`) — never a re-conversion of an existing backend WebP. Skips when the WebP is already newer than the source PNG so reruns don't churn untouched art.

Frontend serves the WebP as the primary asset (smaller, faster), with PNG as the fallback and the format offered for download from `/images`.

## Entity Version History

Every detail page renders a Version History rail powered by `GET /api/history/{entity_type}/{entity_id}`. The endpoint scans every changelog under `data/changelogs/` for entries that touched the requested entity, returns them **newest first**, and matches case-insensitively (URLs use lowercased ids; changelog ids are upper-snake).

`tools/diff_data.py` produces the field-level changes via `_deep_diff()` — recurses into nested dicts and lists so each leaf becomes its own row (`vars.DamageVar: 8 → 10`) instead of opaque `vars: 2 fields → 2 fields`. List items with stable `id` fields are matched by id (so `moves[BEAM_MOVE]` rather than `moves[2]`).

Hand-curated `features` / `fixes` / `api_changes` arrays in a changelog are preserved through regenerations of an existing tag. The data-diff portion is overwritten but those release-note arrays merge through.

### Write-once retention

Files under `data/changelogs/` are write-once historical records. `.github/workflows/changelog-guard.yml` blocks any PR that modifies or deletes an existing changelog file. New files (`A`) are always allowed; modifications require the `changelog-edit-approved` PR label. See `CONTRIBUTING.md → Changelog Retention`.
