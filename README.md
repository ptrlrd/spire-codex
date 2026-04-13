# Spire Codex

A comprehensive database and API for **Slay the Spire 2** game data, built by reverse-engineering the game files. Supports all **14 languages** shipped with the game.

**Live site**: [spire-codex.com](https://spire-codex.com)

**Steam App ID**: 2868840

## How It Was Built

Slay the Spire 2 is built with Godot 4 but all game logic lives in a C#/.NET 8 DLL (`sts2.dll`), not GDScript. The data pipeline:

1. **PCK Extraction** — [GDRE Tools](https://github.com/bruvzg/gdsdecomp) extracts the Godot `.pck` file to recover images, Spine animations, and localization data (~9,947 files).

2. **DLL Decompilation** — [ILSpy](https://github.com/icsharpcode/ILSpy) decompiles `sts2.dll` into ~3,300 readable C# source files containing all game models.

3. **Data Parsing** — 22 Python regex-based parsers extract structured data from the decompiled C# source, outputting per-language JSON to `data/{lang}/`:
   - **Cards**: `base(cost, CardType, CardRarity, TargetType)` constructors + `DamageVar`, `BlockVar`, `PowerVar<T>` for stats
   - **Characters**: `StartingHp`, `StartingGold`, `MaxEnergy`, `StartingDeck`, `StartingRelics`
   - **Relics/Potions**: Rarity, pool, descriptions resolved from SmartFormat templates
   - **Monsters**: HP ranges, ascension scaling via `AscensionHelper`, move state machines with per-move intents (Attack/Defend/Buff/Debuff/Status/Summon/Heal), damage values, multi-hit counts (including AscensionHelper patterns), innate powers from `AfterAddedToRoom` (42 monsters with ascension variants), powers applied per move (target + amount from `PowerCmd.Apply<T>`), block, healing, encounter context (act, room type), **attack patterns** parsed from `GenerateMoveStateMachine()` (112 monsters — cycle, random, conditional, mixed)
   - **Enchantments**: Card type restrictions, stackability, Amount-based scaling
   - **Encounters**: Monster compositions, room type (Boss/Elite/Monster), act placement, tags
   - **Events**: Multi-page decision trees (56 of 66 events), choices with outcomes, act placement, `StringVar` model references resolved to display names, runtime-computed values (escalating costs via `GetDecipherCost()`, gold ranges via `CalculateVars` with `NextInt`/`NextFloat`, heal-to-full patterns), **preconditions** from `IsAllowed()` (25 events — gold, HP, act, deck, relic, potion conditions)
   - **Ancients**: 8 Ancient NPCs with epithets, character-specific dialogue, relic offerings, portrait icons
   - **Powers**: PowerType (Buff/Debuff), PowerStackType (Counter/Single), DynamicVars, descriptions
   - **Epochs/Stories**: Timeline progression data with unlock requirements
   - **Orbs**: Passive/Evoke values, descriptions
   - **Afflictions**: Stackability, extra card text, descriptions
   - **Modifiers**: Run modifier descriptions
   - **Keywords**: Card keyword definitions (Exhaust, Ethereal, Innate, etc.)
   - **Intents**: Monster intent descriptions with icons
   - **Achievements**: Unlock conditions, descriptions, categories, character association, thresholds from C# source (33 achievements)
   - **Acts**: Boss discovery order, encounters, events, ancients, room counts
   - **Ascension Levels**: 11 levels (0–10) with descriptions from localization
   - **Potion Pools**: Character-specific pools parsed from pool classes and epoch references
   - **Translations**: Per-language filter maps (card types, rarities, keywords → localized names) and UI strings (section titles, descriptions, character names) for frontend consumption

4. **Description Resolution** — A shared `description_resolver.py` module resolves SmartFormat localization templates (`{Damage:diff()}`, `{Energy:energyIcons()}`, `{Cards:plural:card|cards}`) into human-readable text with rich text markers for frontend rendering. Runtime-dynamic variables (e.g., `{Card}`, `{Relic}`) are preserved as readable placeholders. `StringVar` references in events (e.g., `{Enchantment1}` → `ModelDb.Enchantment<Sharp>().Title`) are resolved to display names via localization lookup.

5. **Spine Rendering** — Characters and monsters are Spine skeletal animations, not static images. A headless Node.js renderer assembles idle poses into 512×512 portrait PNGs. All 111 monsters have images: 100 rendered from Spine skeletons, 6 aliased from shared skeletons (Flyconid→flying_mushrooms, Ovicopter→egg_layer, Crusher/Rocket→kaiser_crab), and 5 from static game assets (Doormaker). Also renders all 5 characters (combat, rest site, character select poses), NPCs, and backgrounds. Skin-based variants (Cultists, Bowlbugs, Cubex) are rendered individually. See [Spine Renderer](#spine-renderer) below.

6. **Images** — Card portraits, relic/potion icons, character art, monster sprites, Ancient portrait icons, and boss encounter icons extracted from game assets and served as static files.

7. **Changelog Diffing** — A diff tool compares JSON data between game versions (via git refs or directories), tracking added/removed/changed entities per category with field-level diffs. Changelogs are keyed by Steam game version + optional Codex revision number.

## Project Structure

```
spire-codex/
├── backend/                    # FastAPI backend
│   ├── app/
│   │   ├── main.py             # App entry, CORS, GZip, rate limiting, static files
│   │   ├── dependencies.py     # Shared deps (lang validation, language names)
│   │   ├── routers/            # API endpoints (25+ routers)
│   │   ├── models/schemas.py   # Pydantic models
│   │   ├── services/           # JSON data loading (LRU cached, 14-lang support)
│   │   └── parsers/            # C# source → JSON parsers
│   │       ├── card_parser.py
│   │       ├── character_parser.py
│   │       ├── monster_parser.py
│   │       ├── relic_parser.py
│   │       ├── potion_parser.py
│   │       ├── enchantment_parser.py
│   │       ├── encounter_parser.py
│   │       ├── event_parser.py
│   │       ├── power_parser.py
│   │       ├── keyword_parser.py        # Keywords, intents, orbs, afflictions, modifiers, achievements (with unlock conditions)
│   │       ├── guide_parser.py          # Markdown guides with YAML frontmatter
│   │       ├── epoch_parser.py
│   │       ├── act_parser.py
│   │       ├── ascension_parser.py
│   │       ├── pool_parser.py            # Adds character pool to potions
│   │       ├── translation_parser.py    # Generates translations.json per language
│   │       ├── description_resolver.py   # Shared SmartFormat resolver
│   │       ├── parser_paths.py           # Shared path config (env var overrides for beta)
│   │       └── parse_all.py              # Orchestrates all parsers (14 languages)
│   ├── static/images/          # Game images (not committed)
│   ├── scripts/copy_images.py  # Copies images from extraction → static
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # Next.js 16 + TypeScript + Tailwind CSS
│   ├── app/
│   │   ├── contexts/           # LanguageContext, BetaVersionContext
│   │   ├── components/         # CardGrid, RichDescription, SearchFilter,
│   │   │                       #   GlobalSearch, Navbar, Footer, LanguageSelector, VersionSelector
│   │   └── ...                 # Pages: cards, characters, relics, monsters, potions,
│   │                           #   enchantments, encounters, events, powers, timeline,
│   │                           #   reference, images, changelog, about, merchant, compare,
│   │                           #   mechanics/[slug], guides/[slug], guides/submit, runs, meta
│   │                           #   Detail pages: cards/[id], characters/[id], relics/[id],
│   │                           #   monsters/[id], potions/[id], enchantments/[id],
│   │                           #   encounters/[id], events/[id], powers/[id], keywords/[id],
│   │                           #   acts/[id], ascensions/[id], intents/[id], orbs/[id],
│   │                           #   afflictions/[id], modifiers/[id], achievements/[id]
│   │                           #   i18n: [lang]/... mirrors all routes for 13 languages
│   ├── lib/
│   │   ├── api.ts              # API client + TypeScript interfaces
│   │   ├── fetch-cache.ts      # Client-side in-memory fetch cache (5min TTL)
│   │   ├── seo.ts              # Shared SEO utilities (stripTags, SITE_URL, SITE_NAME)
│   │   ├── jsonld.ts           # JSON-LD schema builders (BreadcrumbList, CollectionPage, Article, WebSite, FAQPage)
│   │   ├── ui-translations.ts # UI string translations for 13 languages
│   │   ├── languages.ts       # i18n config — 13 language codes, hreflang mappings
│   │   └── use-lang-prefix.ts # Hook for language-aware URL construction
│   └── Dockerfile
├── tools/
│   ├── spine-renderer/         # Headless Spine skeleton renderer
│   │   ├── render_webgl.mjs     # WebGL renderer (single skeleton) — no seam artifacts
│   │   ├── render_all_webgl.mjs # WebGL batch renderer (all .skel files)
│   │   ├── render_gif.mjs      # Animation renderer (WebP/GIF/APNG with skin + anim support)
│   │   ├── render.mjs           # Legacy canvas renderer (has triangle seams)
│   │   ├── render_all.mjs       # Legacy canvas batch renderer
│   │   ├── render_skins2.mjs    # Skin variant renderer
│   │   ├── render_utils.mjs     # Shared canvas rendering utilities
│   │   └── package.json
│   ├── diff_data.py            # Changelog diff generator
│   ├── update.py               # Cross-platform update pipeline
│   └── deploy.py               # Local Docker build + push to Docker Hub
├── data/                       # Parsed JSON data files
│   ├── {lang}/                 # Per-language directories (eng, kor, jpn, fra, etc.)
│   ├── changelogs/             # Changelog JSON files (keyed by game version)
│   ├── guides/                 # Markdown guide files with YAML frontmatter
│   ├── guides.json             # Parsed guide data
│   ├── runs/                   # Submitted run JSON files (per player hash)
│   └── runs.db                 # SQLite database for run metadata
├── extraction/                 # Raw game files (not committed)
│   ├── raw/                    # GDRE extracted Godot project (stable)
│   ├── decompiled/             # ILSpy output (stable)
│   └── beta/                   # Steam beta branch (raw/ + decompiled/)
├── data-beta/                  # Parsed beta data (versioned: v0.102.0/, v0.103.0/, latest → symlink)
├── docker-compose.yml          # Local dev
├── docker-compose.prod.yml     # Production
├── docker-compose.beta.yml     # Beta site (beta.spire-codex.com)
├── .github/workflows/
│   └── ci.yml                  # GitHub Actions CI: lint, type-check, secret scan, Docker build+push, SSH deploy
└── .forgejo/workflows/
    └── build.yml               # Retained Forgejo CI fallback (buildah-based, not active)
```

## Website Pages

| Page | Route | Description |
|---|---|---|
| Home | `/` | Dashboard with entity counts, category cards, character links |
| Cards | `/cards` | Filterable card grid with modal detail view |
| Card Detail | `/cards/[id]` | Full card stats, upgrade info, image |
| Characters | `/characters` | Character overview grid |
| Character Detail | `/characters/[id]` | Stats, starting deck/relics, quotes, NPC dialogue trees |
| Relics | `/relics` | Filterable relic grid |
| Relic Detail | `/relics/[id]` | Full relic info with rich text flavor |
| Monsters | `/monsters` | Monster grid with HP, moves, Spine renders |
| Monster Detail | `/monsters/[id]` | HP, moves with intents/damage/powers/block, encounter links, power tooltips |
| Potions | `/potions` | Filterable potion grid (rarity, character pool) |
| Potion Detail | `/potions/[id]` | Full potion info |
| Enchantments | `/enchantments` | Enchantment list with card type filters |
| Enchantment Detail | `/enchantments/[id]` | Full enchantment info |
| Encounters | `/encounters` | Encounter compositions by act/room type |
| Encounter Detail | `/encounters/[id]` | Monster lineup, room type, tags |
| Events | `/events` | Multi-page event trees with expandable choices |
| Event Detail | `/events/[id]` | Full event pages, options, Ancient dialogue |
| Powers | `/powers` | Buffs, debuffs, and neutral powers |
| Power Detail | `/powers/[id]` | Power info with cards that apply this power |
| Keywords | `/keywords` | Card keyword list |
| Keyword Detail | `/keywords/[id]` | Keyword description with filterable card grid |
| Merchant | `/merchant` | Card/relic/potion pricing, card removal costs, fake merchant |
| Compare | `/compare` | Character comparison hub (10 pairs) |
| Compare Detail | `/compare/[pair]` | Side-by-side character comparison |
| Developers | `/developers` | API docs, widget docs, data exports |
| Showcase | `/showcase` | Community project gallery |
| Timeline | `/timeline` | Epoch progression with era grouping, unlock requirements |
| Act Detail | `/acts/[id]` | Bosses, encounters, events, ancients for an act |
| Ascension Detail | `/ascensions/[id]` | Ascension level description with prev/next navigation |
| Intent Detail | `/intents/[id]` | Intent icon, description |
| Orb Detail | `/orbs/[id]` | Orb icon, passive/evoke description |
| Affliction Detail | `/afflictions/[id]` | Affliction description, stackability |
| Modifier Detail | `/modifiers/[id]` | Run modifier description |
| Achievement Detail | `/achievements/[id]` | Achievement description |
| Mechanics | `/mechanics` | Game mechanics hub — 27 clickable sections with individual SEO pages |
| Mechanic Detail | `/mechanics/[slug]` | Card odds, relic distribution, potion drops, map generation, boss pools, combat, secrets & trivia |
| Guides | `/guides` | Community strategy guides with search/filter |
| Guide Detail | `/guides/[slug]` | Full guide with markdown rendering + tooltip widget |
| Submit Guide | `/guides/submit` | Guide submission form (Discord webhook) |
| Runs | `/runs` | Community run browser with character/win filters |
| Meta | `/meta` | Live community stats from submitted runs |
| Reference | `/reference` | All items clickable — acts, ascensions, keywords, orbs, afflictions, intents, modifiers, achievements |
| Images | `/images` | Browsable game assets with ZIP download per category |
| Changelog | `/changelog` | Data diffs between game updates |
| About | `/about` | Project info, stats, pipeline visualization |

## API Endpoints

All data endpoints accept an optional `?lang=` query parameter (default: `eng`). Responses are **GZip-compressed** and cached with `Cache-Control: public, max-age=300`.

| Endpoint | Description | Filters |
|---|---|---|
| `GET /api/cards` | All cards | `color`, `type`, `rarity`, `keyword`, `search`, `lang` |
| `GET /api/cards/{id}` | Single card | `lang` |
| `GET /api/characters` | All characters | `search`, `lang` |
| `GET /api/characters/{id}` | Single character (with quotes, dialogues) | `lang` |
| `GET /api/relics` | All relics | `rarity`, `pool`, `search`, `lang` |
| `GET /api/relics/{id}` | Single relic | `lang` |
| `GET /api/monsters` | All monsters | `type`, `search`, `lang` |
| `GET /api/monsters/{id}` | Single monster | `lang` |
| `GET /api/potions` | All potions | `rarity`, `pool`, `search`, `lang` |
| `GET /api/potions/{id}` | Single potion | `lang` |
| `GET /api/enchantments` | All enchantments | `card_type`, `search`, `lang` |
| `GET /api/enchantments/{id}` | Single enchantment | `lang` |
| `GET /api/encounters` | All encounters | `room_type`, `act`, `search`, `lang` |
| `GET /api/encounters/{id}` | Single encounter | `lang` |
| `GET /api/events` | All events | `type`, `act`, `search`, `lang` |
| `GET /api/events/{id}` | Single event | `lang` |
| `GET /api/powers` | All powers | `type`, `stack_type`, `search`, `lang` |
| `GET /api/powers/{id}` | Single power | `lang` |
| `GET /api/keywords` | Card keyword definitions | `lang` |
| `GET /api/keywords/{id}` | Single keyword | `lang` |
| `GET /api/intents` | Monster intent types | `lang` |
| `GET /api/intents/{id}` | Single intent | `lang` |
| `GET /api/orbs` | All orbs | `lang` |
| `GET /api/orbs/{id}` | Single orb | `lang` |
| `GET /api/afflictions` | Card afflictions | `lang` |
| `GET /api/afflictions/{id}` | Single affliction | `lang` |
| `GET /api/modifiers` | Run modifiers | `lang` |
| `GET /api/modifiers/{id}` | Single modifier | `lang` |
| `GET /api/achievements` | All achievements | `lang` |
| `GET /api/achievements/{id}` | Single achievement | `lang` |
| `GET /api/epochs` | Timeline epochs | `era`, `search`, `lang` |
| `GET /api/epochs/{id}` | Single epoch | `lang` |
| `GET /api/stories` | Story entries | `lang` |
| `GET /api/stories/{id}` | Single story | `lang` |
| `GET /api/acts` | All acts | `lang` |
| `GET /api/acts/{id}` | Single act | `lang` |
| `GET /api/ascensions` | Ascension levels (0–10) | `lang` |
| `GET /api/ascensions/{id}` | Single ascension level | `lang` |
| `GET /api/stats` | Entity counts across all categories | `lang` |
| `GET /api/languages` | Available languages with display names | — |
| `GET /api/translations` | Translation maps for filter values and UI strings | `lang` |
| `GET /api/images` | Image categories with file lists | — |
| `GET /api/images/{category}/download` | ZIP download of image category | — |
| `GET /api/changelogs` | Changelog summaries (all versions) | — |
| `GET /api/changelogs/{tag}` | Full changelog for a version tag | — |
| `GET /api/guides` | Community guides | `category`, `difficulty`, `tag`, `search` |
| `GET /api/guides/{slug}` | Single guide (with markdown content) | — |
| `POST /api/guides` | Submit guide (proxied to Discord) | — |
| `POST /api/runs` | Submit a run (.run file JSON) | `username` |
| `GET /api/runs/list` | List submitted runs | `character`, `win`, `username`, `page`, `limit` |
| `GET /api/runs/shared/{hash}` | Full run data by hash | — |
| `GET /api/runs/stats` | Aggregated community stats | `character`, `win`, `ascension`, `game_mode`, `players` |
| `POST /api/feedback` | Submit feedback (proxied to Discord) | — |
| `GET /api/versions` | Available data versions (beta multi-version) | — |

Rate limited to **60 requests per minute** per IP. Feedback and guide submission limited to **3-5 per minute** per IP. Interactive docs at `/docs` (Swagger UI).

### Localization

All game data is served in 14 languages using Slay the Spire 2's own localization files. Pass `?lang=` to any data endpoint. On the beta site, pass `?version=v0.102.0` to browse a specific beta version.

| Code | Language | Code | Language |
|------|----------|------|----------|
| `eng` | English | `kor` | 한국어 |
| `deu` | Deutsch | `pol` | Polski |
| `esp` | Español (ES) | `ptb` | Português (BR) |
| `fra` | Français | `rus` | Русский |
| `ita` | Italiano | `spa` | Español (LA) |
| `jpn` | 日本語 | `tha` | ไทย |
| `tur` | Türkçe | `zhs` | 简体中文 |

**What's localized**: All entity names, descriptions, card types, rarities, keywords, power names, monster names in encounters, character names, section titles — everything that comes from the game's localization data.

**What stays English**: UI chrome (navigation, filter labels, search placeholders), structural fields used for filtering (`room_type`, power `type`/`stack_type`, `pool`), site branding.

Filter parameters (`type=Attack`, `rarity=Rare`, `keyword=Exhaust`) always use English values regardless of language — the backend translates them to the localized equivalents before matching.

Example: `GET /api/cards?lang=kor&type=Attack` returns Korean card data where type is "공격", filtered correctly even though the parameter is English.

### Rich Text Formatting

Text fields (`description`, `loss_text`, `flavor`, dialogue `text`, option `title`/`description`) may contain Godot BBCode-style tags preserved from the game's localization data:

| Tag | Type | Example | Rendered as |
|---|---|---|---|
| `[gold]...[/gold]` | Color | `[gold]Enchant[/gold]` | Gold colored text |
| `[red]...[/red]` | Color | `[red]blood[/red]` | Red colored text |
| `[blue]...[/blue]` | Color | `[blue]2[/blue]` | Blue colored text |
| `[green]...[/green]` | Color | `[green]healed[/green]` | Green colored text |
| `[purple]...[/purple]` | Color | `[purple]Sharp[/purple]` | Purple colored text |
| `[orange]...[/orange]` | Color | `[orange]hulking figure[/orange]` | Orange colored text |
| `[pink]...[/pink]` | Color | — | Pink colored text |
| `[aqua]...[/aqua]` | Color | `[aqua]Ascending Spirit[/aqua]` | Cyan colored text |
| `[sine]...[/sine]` | Effect | `[sine]swirling vortex[/sine]` | Wavy animated text |
| `[jitter]...[/jitter]` | Effect | `[jitter]CLANG![/jitter]` | Shaking animated text |
| `[b]...[/b]` | Effect | `[b]bold text[/b]` | Bold text |
| `[i]...[/i]` | Effect | `[i]whispers[/i]` | Italic text |
| `[energy:N]` | Icon | `[energy:2]` | Energy icon(s) |
| `[star:N]` | Icon | `[star:1]` | Star icon(s) |
| `[Card]`, `[Relic]` | Placeholder | `[Card]` | Runtime-dynamic (italic) |

Tags can be nested: `[b][jitter]CLANG![/jitter][/b]`, `[gold][sine]swirling vortex[/sine][/gold]`.

If you're consuming the API directly, you can strip these with a regex like `\[/?[a-z]+(?::\d+)?\]` or render them in your own frontend. The `description_raw` field (where available) contains the unresolved SmartFormat template.

## Running Locally

### Prerequisites

- Python 3.10+
- Node.js 20+

### Backend

```bash
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r backend/requirements.txt

cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Backend runs at **http://localhost:8000**.

### Frontend

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Frontend runs at **http://localhost:3000**.

### Docker

```bash
docker compose up --build
```

Starts both services (backend on 8000, frontend on 3000).

## Update Pipeline

A cross-platform Python script handles the full update workflow when a new game version is released:

```bash
# Full pipeline — extract game files, parse data, render sprites, copy images:
python3 tools/update.py

# Specify game install path manually:
python3 tools/update.py --game-dir "/path/to/Slay the Spire 2"

# Skip extraction (already have fresh extraction/ directory):
python3 tools/update.py --skip-extract

# Only re-parse data (no extraction or rendering):
python3 tools/update.py --parse-only

# Only re-render Spine sprites:
python3 tools/update.py --render-only

# Generate a changelog after updating:
python3 tools/update.py --changelog --game-version "0.98.2" --build-id "22238966"
```

The script auto-detects your OS and finds the Steam install directory. Requirements per step:

| Step | Tool | Install |
|---|---|---|
| PCK extraction | `gdre_tools` | [GDRE Tools releases](https://github.com/bruvzg/gdsdecomp/releases) |
| DLL decompilation | `ilspycmd` | `dotnet tool install ilspycmd -g` |
| Data parsing | Python 3.10+ | Built-in |
| Image copying | Python 3.10+ | Built-in |
| Spine rendering | Node.js 20+ | [nodejs.org](https://nodejs.org) |

### Manual Steps

If you prefer to run steps individually:

```bash
# Parse all data (all 14 languages)
cd backend/app/parsers && python3 parse_all.py

# Parse a single language
cd backend/app/parsers && python3 parse_all.py --lang eng

# Copy images from extraction to static
python3 backend/scripts/copy_images.py

# Render Spine sprites (WebGL — no triangle seam artifacts)
cd tools/spine-renderer && npm install
npx playwright install chromium           # First time only
node render_all_webgl.mjs                 # All 138 skeletons via headless Chrome
node render_webgl.mjs <skel_dir> <out> [size]  # Single skeleton (e.g., hi-res ancient)

# Legacy canvas renderer (has triangle seam artifacts — avoid)
# node render_all.mjs / node render.mjs
```

## Changelog System

Track what changes between game updates with field-level diffs across all entity categories.

### Generating a Changelog

```bash
# Compare current data against a git ref:
python3 tools/diff_data.py HEAD~1 --format json \
    --game-version "0.98.2" --build-id "22238966" \
    --title "March Update"

# Preview as text or markdown:
python3 tools/diff_data.py HEAD~1 --format text
python3 tools/diff_data.py HEAD~1 --format md
```

### Changelog Schema

Each changelog JSON file contains:

| Field | Description |
|---|---|
| `app_id` | Steam App ID (2868840) |
| `game_version` | Steam game version (e.g. `"0.98.2"`) |
| `build_id` | Steam build ID |
| `tag` | Unique version key (e.g. `"1.0.3"`) |
| `date` | Date of the update |
| `title` | Human-readable title |
| `summary` | Counts: `{ added, removed, changed }` |
| `categories` | Per-category diffs with added/removed/changed entities |

## Deploying

### CI/CD (GitHub Actions)

Pushes to `main` trigger `.github/workflows/ci.yml` which runs secret scanning, linting (ESLint, TypeScript, ruff), builds Docker images, pushes to Docker Hub, and deploys to production via SSH. Self-hosted K8s runner.

> **Note:** `.forgejo/workflows/build.yml` is retained as a fallback CI config (buildah-based) but is not currently active.

### Local Build + Push

Skip CI and push directly from your machine:

```bash
# Build and push both images:
python3 tools/deploy.py

# Frontend only:
python3 tools/deploy.py --frontend

# Backend only:
python3 tools/deploy.py --backend

# Test build without pushing:
python3 tools/deploy.py --no-push

# Tag a release:
python3 tools/deploy.py --tag v0.98.2

# Build and push beta images (:beta tag, skips IndexNow):
python3 tools/deploy.py --beta
```

Auto-detects Apple Silicon and cross-compiles to `linux/amd64` via `docker buildx`. Requires `docker login` first.

### Production

```bash
# Pull and restart on production server:
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Production data is bind-mounted (`./data:/data:ro`). Container restart required after data changes.

### Beta Site (beta.spire-codex.com)

A parallel deployment serving data from the Steam beta branch, with multi-version browsing support. Users can switch between any past beta version via a dropdown in the navbar. All versions are kept permanently.

**Architecture**: `VersionMiddleware` reads `?version=` from the query string, stores it in a Python `ContextVar`, and `data_service.py` reads it when loading JSON — zero changes to any of the 20+ router files. Frontend uses `BetaVersionContext` + `VersionSelector` dropdown, and `fetch-cache.ts` transparently appends `&version=X` to all API calls.

**Data layout**: `data-beta/v0.102.0/eng/`, `data-beta/v0.103.0/eng/`, with a `latest` symlink. Each version has its own `changelogs/` directory.

```bash
# 1. Opt into Steam beta branch (StS2 → Properties → Betas)

# 2. Extract and decompile beta game files
"/Applications/Godot RE Tools.app/Contents/MacOS/Godot RE Tools" --headless \
  "--recover=<path_to_pck>" "--output=extraction/beta/raw"
~/.dotnet/tools/ilspycmd -p -o extraction/beta/decompiled "<path_to_dll>"

# 3. Parse into versioned directory
cd backend/app/parsers
EXTRACTION_DIR=extraction/beta DATA_DIR=data-beta/v0.103.0 python3 parse_all.py

# 4. Generate changelog (previous → new version)
python3 tools/diff_data.py data-beta/v0.102.0/eng data-beta/v0.103.0/eng \
  --format json --output-dir data-beta/v0.103.0/changelogs \
  --game-version "0.103.0" --title "Beta v0.103.0"

# 5. Update latest symlink
cd data-beta && rm latest && ln -sf v0.103.0 latest

# 6. Build and push beta Docker images
python3 tools/deploy.py --beta

# 7. Start beta on server
docker compose -f docker-compose.beta.yml pull
docker compose -f docker-compose.beta.yml up -d
```

The parsers support `EXTRACTION_DIR` and `DATA_DIR` environment variables via `parser_paths.py`, allowing the same parser code to target either stable or beta sources.

## Spine Renderer

Monster sprites in StS2 are [Spine](http://esotericsoftware.com/) skeletal animations — each monster is a `.skel` (binary skeleton) + `.atlas` + `.png` spritesheet, not a single image. The renderer assembles these into static portrait PNGs.

### WebGL Renderer (Current)

The WebGL renderer (`render_webgl.mjs`, `render_all_webgl.mjs`) uses **Playwright + spine-webgl** to render skeletons via headless Chrome's GPU. This produces clean renders with **no triangle seam artifacts**.

**How it works:**
1. Launches headless Chrome via Playwright with WebGL enabled
2. Loads skeleton data + atlas + textures as base64 into the browser page
3. Creates a WebGL canvas, sets up spine-webgl shader + polygon batcher
4. Applies the idle animation, calculates bounds (excluding shadow/ground slots)
5. Renders via GPU triangle rasterization — no canvas clip paths, no seams
6. Reads raw pixels via `gl.readPixels`, flips vertically (WebGL is bottom-up)
7. Writes PNG via node-canvas to preserve transparency

**Single skeleton:**
```bash
node render_webgl.mjs <skel_dir> <output_path> [size]
node render_webgl.mjs ../../extraction/raw/animations/backgrounds/neow_room ../../backend/static/images/misc/neow.png 2048
```

**Batch all skeletons:**
```bash
node render_all_webgl.mjs  # Renders 138 skeletons to backend/static/images/renders/
```

### Render coverage

| Category | Rendered | Total | Notes |
|---|---|---|---|
| Monsters | 99 | 103 dirs | All 111 game monsters have images (99 rendered + aliases/static) |
| Characters | 16 | 16 | Combat, rest site, and select poses |
| Backgrounds/NPCs | 14 | 17 | Neow, Tezcatara, merchant rooms, main menu |
| VFX/UI | 9 | 22 | Most VFX need specific animation frames |
| **Total** | **138** | **158** | 20 skipped (no atlas, VFX-only, blank) |

### Animation Renderer

The animation renderer (`render_gif.mjs`) renders Spine idle/attack animations as animated WebP, GIF, or APNG. Supports skin variants, animation selection, and streaming frame-to-disk for large animations.

**Supported output formats:**
- **`.webp`** (recommended) — lossless animated WebP with full alpha, ~33% smaller than APNG. Frames streamed to disk to avoid OOM.
- **`.gif`** — 256 colors, binary transparency. Smallest files but lowest quality.
- **`.apng`** — full alpha like WebP but larger files.

```bash
# Render lossless animated WebP (recommended)
NODE_OPTIONS="--max-old-space-size=8192" node render_gif.mjs <skel_dir> <output.webp> [size] [--fps=N]

# With skin variant (for bowlbug, cultists, cubex, etc.)
node render_gif.mjs <skel_dir> output.webp 256 --fps=10 --skin=rock

# Specific animation (default: idle loop)
node render_gif.mjs <skel_dir> output.webp 256 --fps=12 --anim=attack

# White silhouette mode (for boss map node icons)
node render_gif.mjs <skel_dir> output.webp 256 --white
```

**Animation library:** 209 lossless animated WebPs:
- 15 character animations (combat/select/rest × 5 characters) at 512×512
- 103 monster idle animations at 256×256
- 91 monster attack animations at 256×256

**Skin variants:** 13 monsters have skin variants (bowlbug, cubex_construct, cultists, etc.). Use `--skin=` to select. Default skin often shows only the base skeleton without body.

**Boss map node shader:** The game uses `boss_map_point.gdshader` which treats RGB channels as masks:
- **Red channel** × `map_color` (default: beige `0.671, 0.58, 0.478`) → fill color
- **Blue channel** × `black_layer_color` (default: black `0, 0, 0`) → outline color
- **Green channel** × white `1, 1, 1` → highlights

### Legacy Canvas Renderer

The canvas renderer (`render.mjs`, `render_all.mjs`) uses `spine-canvas` with `triangleRendering = true`. This produces **visible wireframe mesh artifacts** due to canvas `clip()` path anti-aliasing between adjacent triangles. Use the WebGL renderer instead.

### Dependencies

- `@esotericsoftware/spine-webgl` ^4.2.107 — Spine runtime for WebGL (current)
- `playwright` — Headless Chrome for WebGL rendering
- `gif-encoder-2` — GIF encoding for animation renderer
- `canvas` ^3.1.0 — Node.js Canvas implementation (frame buffer for animation renderer)
- `Pillow` (Python) — assembles WebP/APNG from rendered PNG frames
- `@esotericsoftware/spine-canvas` ^4.2.106 — Spine runtime for Canvas (legacy)

## Extracting Game Files

If you need to extract from scratch:

```bash
# Extract PCK (GDRE Tools)
/path/to/gdre_tools --headless --recover="/path/to/sts2.pck" --output-dir=extraction/raw

# Decompile DLL (ILSpy CLI)
ilspycmd -p -o extraction/decompiled "/path/to/sts2.dll"
```

Steam install locations:
- **Windows**: `C:\Program Files (x86)\Steam\steamapps\common\Slay the Spire 2\`
- **macOS**: `~/Library/Application Support/Steam/steamapps/common/Slay the Spire 2/`
- **Linux**: `~/.local/share/Steam/steamapps/common/Slay the Spire 2/`

## Versioning

Spire Codex uses **`1.X.Y`** semantic versioning:

| Segment | Meaning |
|---------|---------|
| **1** | Spire Codex major version (stays unless a full rewrite) |
| **X** | Bumps when Mega Crit releases a game patch |
| **Y** | Bumps for our own parser/frontend fixes and improvements |

Examples: `v1.0.0` = initial release, `v1.0.1` = our bug fixes, `v1.1.0` = first Mega Crit patch incorporated.

## SEO

- **Structured data (JSON-LD)**: WebSite + VideoGame (home), CollectionPage + ItemList (list pages), Article + BreadcrumbList + FAQPage (detail pages), SoftwareApplication (developers)
- **Title format**: `"Slay the Spire 2 [Topic] - [Descriptor] | Spire Codex"` — standardized across all pages
- **Sitemap**: Flat XML at `/sitemap.xml` with `force-dynamic` (renders server-side, not build-time). ~20,000+ URLs including entity detail pages, browse matrix pages, and i18n detail pages for all entity types
- **International SEO**: `/{lang}/` routes for 13 non-English languages with hreflang alternates
- **Programmatic SEO**: 41 card browse pages at `/cards/browse/` (rare-attacks, ironclad-skills, etc.)
- **Internal linking**: Powers ↔ cards, encounters → monsters, card keywords → keyword hub pages, monster moves → power pages (with tooltips), act pages → encounters/events, every reference entity clickable
- **Open Graph & Twitter Cards**: Per-entity OG images, `summary_large_image` Twitter cards
- **Canonical URLs**: Every page declares a canonical URL

## Embeddable Widgets

### Tooltip Widget
Add hoverable tooltips for all 13 entity types to any website:
```html
<script src="https://spire-codex.com/widget/spire-codex-tooltip.js"></script>
<p>Start with [[Bash]] and [[relic:Burning Blood]].</p>
```

### Changelog Widget
Embed an interactive changelog viewer:
```html
<div id="scx-changelog"></div>
<script src="https://spire-codex.com/widget/spire-codex-changelog.js"></script>
```

Full docs: [spire-codex.com/developers](https://spire-codex.com/developers)

## Roadmap

- ~~Individual detail pages~~ ✅
- ~~Global search~~ ✅
- ~~Multi-language support (14 languages)~~ ✅
- ~~SEO (JSON-LD, OG/Twitter, sitemap, hreflang)~~ ✅
- ~~Tooltip widget (all 13 entity types)~~ ✅
- ~~Character comparison pages (10 pairs)~~ ✅
- ~~Keyword hub pages~~ ✅
- ~~Merchant guide (pricing from decompiled C#)~~ ✅
- ~~Developer docs + data exports~~ ✅
- ~~International SEO (13 language landing pages)~~ ✅
- ~~Card browse matrix (41 programmatic SEO pages)~~ ✅
- ~~Community guides~~ ✅ — Markdown with YAML frontmatter, submission form, tooltip widget, author socials
- ~~Game mechanics page~~ ✅ — 27 individual SEO pages: drop rates, combat, map, bosses, secrets & trivia
- ~~Community runs~~ ✅ — Run submission, browser, shared runs, live stats
- ~~Card upgrade descriptions~~ ✅ — upgrade_description for all 403 upgradable cards
- ~~Monster innate powers~~ ✅ — 42 monsters with powers from AfterAddedToRoom
- ~~Achievement unlock conditions~~ ✅ — Category, character, threshold from C# source
- ~~Monster attack patterns~~ ✅ — 112 monsters with cycle/random/conditional/mixed AI from C# state machines
- ~~Event preconditions~~ ✅ — 25 events with IsAllowed() conditions parsed from C# source
- ~~Multi-version beta browsing~~ ✅ — Version dropdown, all past betas preserved and browsable with changelogs
- **Discord bot** — Card lookup, patch alerts
- **Deck builder** — Interactive deck theorycrafting
- **Database backend** — Replace JSON loading with SQLite/PostgreSQL

## Acknowledgments

Thanks to **vesper-arch**, **terracubist**, **U77654**, **Purple Aspired Dreaming**, and **Kobaru** for QA testing, bug reports, and contributions.

## Tech Stack

- **Backend**: Python, FastAPI, Pydantic, slowapi, GZip compression
- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS, 14-language support
- **Spine Renderer**: Node.js, Playwright, @esotericsoftware/spine-webgl (WebGL via headless Chrome)
- **Infrastructure**: Docker, GitHub Actions CI (self-hosted K8s runner), SSH deploy
- **Tools**: Python (update pipeline, changelog diffing, image copying)

## Disclaimer

This project is for educational purposes. Game data belongs to Mega Crit Games. This should not be used to recompile or redistribute the game.
