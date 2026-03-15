# Spire Codex

A comprehensive database and API for **Slay the Spire 2** game data, built by reverse-engineering the game files. Supports all **14 languages** shipped with the game.

**Live site**: [spire-codex.com](https://spire-codex.com)

**Steam App ID**: 2868840

## How It Was Built

Slay the Spire 2 is built with Godot 4 but all game logic lives in a C#/.NET 8 DLL (`sts2.dll`), not GDScript. The data pipeline:

1. **PCK Extraction** — [GDRE Tools](https://github.com/bruvzg/gdsdecomp) extracts the Godot `.pck` file to recover images, Spine animations, and localization data (~9,947 files).

2. **DLL Decompilation** — [ILSpy](https://github.com/icsharpcode/ILSpy) decompiles `sts2.dll` into ~3,300 readable C# source files containing all game models.

3. **Data Parsing** — 20 Python regex-based parsers extract structured data from the decompiled C# source, outputting per-language JSON to `data/{lang}/`:
   - **Cards**: `base(cost, CardType, CardRarity, TargetType)` constructors + `DamageVar`, `BlockVar`, `PowerVar<T>` for stats
   - **Characters**: `StartingHp`, `StartingGold`, `MaxEnergy`, `StartingDeck`, `StartingRelics`
   - **Relics/Potions**: Rarity, pool, descriptions resolved from SmartFormat templates
   - **Monsters**: HP ranges, ascension scaling via `AscensionHelper`, move state machines, damage values
   - **Enchantments**: Card type restrictions, stackability, Amount-based scaling
   - **Encounters**: Monster compositions, room type (Boss/Elite/Monster), act placement, tags
   - **Events**: Multi-page decision trees (56 of 66 events), choices with outcomes, act placement, `StringVar` model references resolved to display names
   - **Ancients**: 8 Ancient NPCs with epithets, character-specific dialogue, relic offerings, portrait icons
   - **Powers**: PowerType (Buff/Debuff), PowerStackType (Counter/Single), DynamicVars, descriptions
   - **Epochs/Stories**: Timeline progression data with unlock requirements
   - **Orbs**: Passive/Evoke values, descriptions
   - **Afflictions**: Stackability, extra card text, descriptions
   - **Modifiers**: Run modifier descriptions
   - **Keywords**: Card keyword definitions (Exhaust, Ethereal, Innate, etc.)
   - **Intents**: Monster intent descriptions
   - **Achievements**: Unlock conditions, descriptions
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
│   │   ├── routers/            # API endpoints (22 routers)
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
│   │       ├── keyword_parser.py        # Keywords, intents, orbs, afflictions, modifiers, achievements
│   │       ├── epoch_parser.py
│   │       ├── act_parser.py
│   │       ├── ascension_parser.py
│   │       ├── pool_parser.py            # Adds character pool to potions
│   │       ├── translation_parser.py    # Generates translations.json per language
│   │       ├── description_resolver.py   # Shared SmartFormat resolver
│   │       └── parse_all.py              # Orchestrates all parsers (14 languages)
│   ├── static/images/          # Game images (not committed)
│   ├── scripts/copy_images.py  # Copies images from extraction → static
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # Next.js 16 + TypeScript + Tailwind CSS
│   ├── app/
│   │   ├── contexts/           # LanguageContext (i18n state + localStorage)
│   │   ├── components/         # CardGrid, RichDescription, SearchFilter,
│   │   │                       #   GlobalSearch, Navbar, Footer, LanguageSelector
│   │   └── ...                 # Pages: cards, characters, relics, monsters, potions,
│   │                           #   enchantments, encounters, events, powers, timeline,
│   │                           #   reference, images, changelog, about
│   │                           #   Detail pages: cards/[id], characters/[id], relics/[id],
│   │                           #   monsters/[id], potions/[id], enchantments/[id],
│   │                           #   encounters/[id], events/[id]
│   ├── lib/
│   │   ├── api.ts              # API client + TypeScript interfaces
│   │   └── fetch-cache.ts      # Client-side in-memory fetch cache (5min TTL)
│   └── Dockerfile
├── tools/
│   ├── spine-renderer/         # Headless Spine skeleton renderer
│   │   ├── render.mjs           # Monster renderer
│   │   ├── render_all.mjs       # Universal renderer (all .skel files)
│   │   ├── render_skins2.mjs    # Skin variant renderer
│   │   ├── render_utils.mjs     # Shared rendering utilities (slot-by-slot fallback)
│   │   └── package.json
│   ├── diff_data.py            # Changelog diff generator
│   ├── update.py               # Cross-platform update pipeline
│   └── deploy.py               # Local Docker build + push to Docker Hub
├── data/                       # Parsed JSON data files
│   ├── {lang}/                 # Per-language directories (eng, kor, jpn, fra, etc.)
│   └── changelogs/             # Changelog JSON files (keyed by game version)
├── extraction/                 # Raw game files (not committed)
│   ├── raw/                    # GDRE extracted Godot project
│   └── decompiled/             # ILSpy output
├── docker-compose.yml          # Local dev
├── docker-compose.prod.yml     # Production
└── .forgejo/workflows/
    └── build.yml               # CI: builds + pushes to Docker Hub
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
| Monster Detail | `/monsters/[id]` | HP ranges, moves, damage values, ascension scaling |
| Potions | `/potions` | Filterable potion grid (rarity, character pool) |
| Potion Detail | `/potions/[id]` | Full potion info |
| Enchantments | `/enchantments` | Enchantment list with card type filters |
| Enchantment Detail | `/enchantments/[id]` | Full enchantment info |
| Encounters | `/encounters` | Encounter compositions by act/room type |
| Encounter Detail | `/encounters/[id]` | Monster lineup, room type, tags |
| Events | `/events` | Multi-page event trees with expandable choices |
| Event Detail | `/events/[id]` | Full event pages, options, Ancient dialogue |
| Powers | `/powers` | Buffs, debuffs, and neutral powers |
| Timeline | `/timeline` | Epoch progression with era grouping, unlock requirements |
| Reference | `/reference` | Keywords, intents, orbs, afflictions, modifiers, achievements, acts, ascensions |
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
| `GET /api/stats` | Entity counts across all categories | `lang` |
| `GET /api/languages` | Available languages with display names | — |
| `GET /api/translations` | Translation maps for filter values and UI strings | `lang` |
| `GET /api/images` | Image categories with file lists | — |
| `GET /api/images/{category}/download` | ZIP download of image category | — |
| `GET /api/changelogs` | Changelog summaries (all versions) | — |
| `GET /api/changelogs/{tag}` | Full changelog for a version tag | — |
| `POST /api/feedback` | Submit feedback (proxied to Discord) | — |

Rate limited to **60 requests per minute** per IP. Feedback endpoint limited to **5 per minute** per IP. Interactive docs at `/docs` (Swagger UI).

### Localization

All game data is served in 14 languages using Slay the Spire 2's own localization files. Pass `?lang=` to any data endpoint.

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

# Render Spine sprites
cd tools/spine-renderer && npm install
node render_all.mjs          # All skeletons
node render.mjs              # Monsters only (better framing)
node render_skins2.mjs       # Skin variants (Cultists, Bowlbugs, etc.)
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

### CI/CD (Forgejo)

Pushes to `main` trigger `.forgejo/workflows/build.yml` which builds and pushes both images to Docker Hub via buildah.

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
```

Auto-detects Apple Silicon and cross-compiles to `linux/amd64` via `docker buildx`. Requires `docker login` first.

### Production

```bash
# Pull and restart on production server:
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Production data is bind-mounted (`./data:/data:ro`). Container restart required after data changes.

## Spine Renderer

Monster sprites in StS2 are [Spine](http://esotericsoftware.com/) skeletal animations — each monster is a `.skel` (binary skeleton) + `.atlas` + `.png` spritesheet, not a single image. The renderer assembles these into static portrait PNGs.

### How it works

1. Finds `.skel`, `.atlas`, and `.png` files under `extraction/raw/animations/`
2. Applies the idle animation at time 0 using `@esotericsoftware/spine-canvas` (v4.2.106, matching the game's Spine 4.2.x binary format)
3. Calculates a bounding box from all visible attachments, **excluding shadow/ground/VFX slots** (projectile paths, whoosh effects, wind paths, megablade/megatail) for tighter framing. Dispatches `computeWorldVertices` correctly per attachment type (RegionAttachment uses 4-arg form, MeshAttachment uses 6-arg form)
4. Hides VFX-only slots before rendering (paths, whoosh, windpath, vulnerable, projectile, megablade, megatail)
5. Renders at **2× supersampling** (1024px) to reduce canvas triangle-mesh seam artifacts, then downscales to 512×512
6. **Automatic fallback**: Detects when canvas clip-path accumulation from complex mesh skeletons (e.g., Devoted Sculptor with ~4,400 triangles) produces blank output, and re-renders slot-by-slot with manual alpha compositing
7. Handles filename mismatches (e.g., `egg_layer/` dir containing `egglayer.skel`) via fallback file detection
8. Outputs PNGs to `backend/static/images/`

### Render coverage

| Category | Rendered | Total | Notes |
|---|---|---|---|
| Monsters | 100 | 103 dirs | All 111 game monsters have images (100 rendered + 11 aliased/static) |
| Characters (combat) | 5 | 5 | Battle stance poses |
| Characters (rest site) | 6 | 6 | Includes Osty |
| Characters (select) | 5 | 5 | Wide cinematic poses |
| Backgrounds/NPCs | 10 | 14 | Neow, Tezcatara, merchant rooms, main menu |
| VFX/UI | 2 | 16 | Most VFX need specific animation frames |
| **Total** | **128+** | **158** | |

Monsters without Spine data use alternative images:
- **Shared skeletons**: Flyconid (→ flying_mushrooms), Ovicopter (→ egg_layer), Crusher/Rocket (→ kaiser_crab)
- **Static placeholder**: Doormaker (beta art from game files)
- **Multi-segment**: Decimillipede rendered from front segment (decimillipede2.skel + decimillipede_middle.atlas)

### Technical details

- Uses `node-canvas` for server-side Canvas API (no browser/GPU needed)
- **Triangle rendering** enabled (`triangleRendering = true`) — required for mesh attachments (most monster body parts). Without it, only RegionAttachments render.
- `Physics.reset` parameter required by spine-canvas 4.2.x `updateWorldTransform()`
- **Bounds calculation**: `RegionAttachment.computeWorldVertices(slot, verts, offset, stride)` uses a 4-arg signature; `MeshAttachment.computeWorldVertices(slot, start, count, verts, offset, stride)` uses 6 args — must dispatch by `instanceof` check
- Shadow slots (`shadow`, `shadow2`, `ground`, `ground_shadow`) excluded from bounds calculation but still rendered
- VFX slots (`*path*`, `whoosh`, `windpath`, `vulnerable`, `projectile`, `megablade`, `megatail`) excluded from bounds AND hidden before rendering
- Skin-based skeletons (Cultists: coral/slug, Bowlbugs: cocoon/goop/rock/web, Cubex: circleeye/diamondeye/squareeye) require explicit skin selection
- **Slot-by-slot fallback** (`render_utils.mjs`): spine-canvas accumulates canvas `clip()` paths during triangle rendering. On complex skeletons (~4,000+ mesh triangles), this corrupts the canvas state causing `toBuffer()` OOM or blank output. The fallback renders each slot to an independent canvas and alpha-composites raw pixel data via `getImageData`/`putImageData`

### Dependencies

- `@esotericsoftware/spine-canvas` ^4.2.106 — Spine runtime for Canvas
- `canvas` ^3.1.0 — Node.js Canvas implementation

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

## Roadmap

- ~~**Individual detail pages**~~ — ✅ Click-through pages for cards, characters, relics, monsters, potions, enchantments, encounters, events
- ~~**Global search**~~ — ✅ Press `.` anywhere to search across all categories
- ~~**Multi-language support**~~ — ✅ 14 languages using the game's own localization files
- **Database backend** — Replace JSON loading with SQLite/PostgreSQL

## Acknowledgments

Thanks to **vesper-arch**, **terracubist**, and **U77654** for QA testing, bug reports, and contributions.

## Tech Stack

- **Backend**: Python, FastAPI, Pydantic, slowapi, GZip compression
- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS, 14-language support
- **Spine Renderer**: Node.js, @esotericsoftware/spine-canvas, node-canvas
- **Infrastructure**: Docker, Forgejo CI, buildah
- **Tools**: Python (update pipeline, changelog diffing, image copying)

## Disclaimer

This project is for educational purposes. Game data belongs to Mega Crit Games. This should not be used to recompile or redistribute the game.
