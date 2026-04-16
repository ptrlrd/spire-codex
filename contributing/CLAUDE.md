# Spire Codex — Slay the Spire 2 Data API + Website

## Project Goal
Extract game data from Slay the Spire 2 (Godot 4 / C#/.NET 8) and expose it through a FastAPI backend + Next.js frontend.

## Key Discovery: Game is C#/.NET, NOT GDScript
- All game logic is in `sts2.dll` (C#/.NET 8), not GDScript
- Only 48 GDScript files (VFX testers), the DLL decompiles cleanly with ILSpy
- Uses Spine for skeletal animations, FMOD for audio, Sentry for error tracking

## Project Structure
```
spire-codex/
  extraction/
    raw/                    # GDRE extracted Godot project (stable branch)
      images/               # Game images (card portraits, relics, potions, monsters)
      animations/           # Spine skeletal animations (.skel, .atlas, .png)
      localization/eng/     # Localization JSON (names, descriptions) — 14 languages
    decompiled/             # ILSpy decompiled C# (stable branch)
    beta/                   # Steam beta branch extraction
      raw/                  # GDRE extracted (beta)
      decompiled/           # ILSpy decompiled (beta)
  backend/
    app/
      main.py               # FastAPI app + CORS middleware + GZip
      models/schemas.py      # Pydantic models (with compendium_order)
      routers/               # API routes (25+ routers)
        cards.py             # Cards (filter: color, type, rarity, keyword, tag, search)
        characters.py        # Characters
        relics.py            # Relics (filter: rarity, pool, search)
        monsters.py          # Monsters (filter: type, search)
        potions.py           # Potions (filter: rarity, pool, search)
        powers.py            # Powers (filter: type, stack_type, search)
        events.py            # Events (filter: type, act, search)
        encounters.py        # Encounters (filter: room_type, act, search)
        enchantments.py      # Enchantments
        keywords.py          # Keywords
        intents.py orbs.py afflictions.py modifiers.py achievements.py
        epochs.py stories.py acts.py ascensions.py
        names.py             # Cross-language entity name lookup
        exports.py           # ZIP data downloads per language
        entity_history.py    # Per-entity version history from changelogs
        changelogs.py        # Changelog API
        guides.py            # Guides (list, detail, Discord webhook submission)
        runs.py              # Run submission + community stats + shared runs
        images.py feedback.py
      services/              # data_service (loads JSON, lru_cache)
      parsers/               # C# -> JSON parsers
        card_parser.py       # Cards with DynamicVars, upgrades, compendium_order
        character_parser.py
        monster_parser.py    # Monsters with HP, moves, damage, encounter types, innate powers
        relic_parser.py      # Relics with var extraction, starter upgrade mapping, compendium_order
        potion_parser.py     # Potions with var extraction, compendium_order
        enchantment_parser.py
        encounter_parser.py
        event_parser.py      # Events with C# source-order choice extraction
        power_parser.py      # Powers with Temporary*Power inheritance resolution
        keyword_parser.py    # Keywords, intents, orbs, afflictions, modifiers, achievements (with unlock conditions)
        guide_parser.py      # Markdown guides with YAML frontmatter → JSON
        description_resolver.py
        parser_paths.py      # Shared path config (supports EXTRACTION_DIR/DATA_DIR env vars)
        parse_all.py         # Runs all parsers for all 14 languages
    static/images/           # Served static images
    Dockerfile
  frontend/
    app/
      layout.tsx             # Root layout
      page.tsx               # Home page — WebSite + VideoGame JSON-LD
      cards/page.tsx         # Cards list with sort (A-Z, Z-A, Compendium)
      cards/[id]/page.tsx    # Card detail — tabbed (Overview/Details/Info)
      cards/browse/          # 41 programmatic filter pages (rare-attacks, ironclad-skills, etc.)
      characters/page.tsx    # Characters with hub sections (all cards, all relics)
      monsters/page.tsx relics/page.tsx potions/page.tsx
      enchantments/page.tsx encounters/page.tsx events/page.tsx
      powers/page.tsx        # Powers with "cards that apply this" reverse links
      keywords/page.tsx      # Keyword hub pages — list + [id] detail with card grids
      merchant/page.tsx      # Merchant guide — prices, fake merchant, card removal
      compare/page.tsx       # Character comparison hub (10 pairs)
      compare/[pair]/        # Side-by-side comparison detail pages
      mechanics/page.tsx     # Game mechanics hub — 27 clickable sections
      mechanics/[slug]/      # Individual mechanic detail pages with SEO
      guides/page.tsx        # Community guides list with search/filter
      guides/[slug]/         # Guide detail with markdown rendering + tooltip widget
      guides/submit/         # Guide submission form → Discord webhook
      leaderboards/page.tsx  # Three-tab browser — Fastest Wins, Highest Ascension, Browse Runs
      leaderboards/submit/   # Drag-and-drop .run upload
      leaderboards/stats/    # Ranked-table stats (cards/relics/potions/encounters pick + win rates)
      runs/[hash]/           # Shared-run detail — in-game-style summary with TinyCard grid, clickable map nodes
      runs/page.tsx          # Redirect to /leaderboards (old URL preserved)
      meta/page.tsx          # Redirect to /leaderboards/stats (old URL preserved)
      showcase/page.tsx      # Community project gallery
      developers/page.tsx    # API docs, widget docs, data exports
      timeline/page.tsx reference/page.tsx images/page.tsx
      changelog/page.tsx about/page.tsx
      [lang]/                # International SEO — 13 non-English localized landing pages
      */[id]/page.tsx        # Detail pages — Article + BreadcrumbList + FAQPage JSON-LD
      components/
        CardGrid.tsx         # Card grid with inline icons, upgrade rendering
        RichDescription.tsx  # Tokenizer + tree builder for nested rich text tags
        SearchFilter.tsx     # Reusable search + filter + sort bar
        SearchTrigger.tsx    # Input-styled trigger for the global search modal (hero/nav/icon variants)
        GlobalSearch.tsx     # Centralized cmd-K–style search modal (opens on ".")
        TinyCard.tsx         # In-game card thumbnail primitive — 6-layer mask composite, pool/rarity colors from decompiled C#
        JsonLd.tsx           # Server component for JSON-LD
        Navbar.tsx           # Nav groups (Database, Game Info, Tools, About) + middle search on non-home pages
        Footer.tsx           # API, Developers, GitHub, Discord, Feedback
        LocalizedNames.tsx   # Collapsible cross-language name display
        EntityHistory.tsx    # Collapsible version history timeline
        RelatedCards.tsx     # Cards sharing keywords/tags
      runs/[hash]/
        RunSummary.tsx       # In-game-style summary — stats bar + act rows + relic strip + TinyCard grid
        RunPills.tsx         # CardPill / RelicPill / PotionPill — hover tooltips with full entity info
        SharedRunClient.tsx  # Run hash loader + top-level layout
    lib/
      api.ts                # API client + TypeScript interfaces (with compendium_order)
      seo.ts                # stripTags, SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE
      jsonld.ts             # JSON-LD builders (BreadcrumbList, CollectionPage, Article, WebSite, VideoGame, FAQPage, SoftwareApplication)
      fetch-cache.ts        # Client-side in-memory fetch cache (5min TTL)
      languages.ts          # i18n config — 13 language codes, hreflang mappings, native names
    public/widget/
      spire-codex-tooltip.js   # Embeddable tooltip widget — all 13 entity types
      spire-codex-changelog.js # Embeddable changelog viewer with version switching
    Dockerfile
    next.config.ts          # output: "standalone", CORS headers for /widget/*
  tools/
    spine-renderer/          # Headless Spine renderer (Node.js)
      render_webgl.mjs       # WebGL renderer (single skeleton) — Playwright + spine-webgl, no seam artifacts
      render_all_webgl.mjs   # WebGL batch renderer — re-renders ALL .skel files via headless Chrome
      render.mjs             # Legacy canvas renderer — monster-specific (has triangle seam artifacts)
      render_all.mjs         # Legacy canvas renderer — ALL .skel files (has triangle seam artifacts)
      render_hires.mjs       # Legacy canvas hi-res renderer (2048x2048)
      render_skins2.mjs      # Skin variants (Cultists, Bowlbugs, Cubex)
    diff_data.py             # Data diff tool — generates per-entity changelogs between git refs
    deploy.py                # Build + push Docker images to Docker Hub (--beta for beta images)
    update.py               # Cross-platform extraction + parse + render pipeline
  data/                     # Parsed JSON output (14 language directories)
    changelogs/             # Version changelogs with per-entity diffs
    guides/                 # Markdown guide files with YAML frontmatter
    guides.json             # Parsed guide data
    runs/                   # Submitted run JSON files (per player hash)
    runs.db                 # SQLite database for run metadata
    showcase.json           # Community project gallery data
  docker-compose.yml        # Local dev
  docker-compose.prod.yml   # Production (Docker Hub images + nginx network)
  docker-compose.beta.yml   # Beta site (beta.spire-codex.com, :beta images + data-beta)
```

## Data Parsed (stable — beta counts may vary)
- **576 cards** — cost, type, rarity, target, damage, block, keywords, tags, upgrades, X-cost, vars, resolved descriptions, compendium_order
- **5 characters** — Ironclad, Silent, Defect, Necrobinder, Regent (HP, gold, energy, deck, relics)
- **293 relics** — rarity, pool (with upgraded starter relic mapping from TouchOfOrobas), compendium_order
- **115 monsters** — HP ranges, ascension scaling, moves, damage values, hit counts, innate powers (42+ monsters), idle pose sprites
- **63 potions** — rarity, pool, resolved descriptions, compendium_order
- **22 enchantments** — card type restrictions, stackability, descriptions
- **87 encounters** — monster compositions, room type, act placement, tags
- **66 events** — multi-page decision trees, choices in C# source order, runtime-computed values (escalating costs, gold ranges), preconditions (`IsAllowed` / `IRunState` bodies translated to human-readable strings)
- **259 powers** — type (Buff/Debuff), stack type, descriptions (3 abstract bases excluded, 19 inherited powers resolved)
- **8 keywords** — Exhaust, Ethereal, Innate, Retain, Sly, Eternal, Unplayable (+ Period)
- **14 intents** · **5 orbs** · **9 afflictions** · **16 modifiers** · **33 achievements** (with unlock conditions, thresholds, categories)

## API Endpoints
- `GET /api/stats` — Data counts
- `GET /api/cards?color=&rarity=&type=&keyword=&tag=&search=` — Cards with filtering
- `GET /api/cards/{id}` — Single card
- `GET /api/characters` / `GET /api/characters/{id}`
- `GET /api/relics?rarity=&pool=&search=` / `GET /api/relics/{id}`
- `GET /api/monsters?type=&search=` / `GET /api/monsters/{id}`
- `GET /api/potions?rarity=&pool=&search=` / `GET /api/potions/{id}`
- `GET /api/powers?type=&stack_type=&search=` / `GET /api/powers/{id}`
- `GET /api/events?type=&act=&search=` / `GET /api/events/{id}`
- `GET /api/encounters?room_type=&act=&search=` / `GET /api/encounters/{id}`
- `GET /api/enchantments?card_type=&search=` / `GET /api/enchantments/{id}`
- `GET /api/keywords` / `GET /api/orbs` / `GET /api/afflictions` / `GET /api/intents`
- `GET /api/modifiers` / `GET /api/achievements`
- `GET /api/names/{entity_type}/{entity_id}` — Cross-language name lookup
- `GET /api/exports/{lang}` — ZIP download of all entity JSON for a language
- `GET /api/history/{entity_type}/{entity_id}` — Per-entity version history
- `GET /api/changelogs` / `GET /api/changelogs/{tag}` — Version changelogs
- `GET /api/guides?category=&difficulty=&tag=&search=` / `GET /api/guides/{slug}` — Guides
- `POST /api/guides` — Guide submission (Discord webhook, rate-limited)
- `POST /api/runs` — Run submission / `GET /api/runs/list` (filters: character, win, username, seed, build_id, sort, page, limit) / `GET /api/runs/shared/{hash}` / `GET /api/runs/stats`
- `GET /api/runs/leaderboard` — ranked wins-only list (category: fastest|highest_ascension, character, page, limit)
- `GET /api/runs/versions` — distinct build_ids across submitted runs
- `GET /api/languages` / `GET /api/translations`
- All endpoints accept `?lang=` (default: eng) — 14 languages supported
- Docs: `http://localhost:8000/docs`

## Merchant Pricing (from decompiled C#)
### Cards (MerchantCardEntry.cs)
- Common: base 50, range 48–53 (×0.95–1.05). Colorless +15%. On sale: half price.
- Uncommon: base 75, range 71–79
- Rare: base 150, range 143–158
### Relics (RelicModel.cs + MerchantRelicEntry.cs)
- Common: base 200, range 170–230 (×0.85–1.15)
- Shop: base 225, range 191–259
- Uncommon: base 250, range 213–288
- Rare: base 300, range 255–345
- Fake Merchant relics: all 50g flat (10 fakes)
- Blacklisted: The Courier, Old Coin
### Potions (MerchantPotionEntry.cs)
- Common: base 50, range 48–53
- Uncommon: base 75, range 71–79
- Rare: base 100, range 95–105
### Card Removal: 75 + 25 × removals used (no RNG)
### Shop Inventory: 5 character cards (2 ATK, 2 SKL, 1 PWR) + 2 colorless (UNC, RARE) + 3 relics + 3 potions + removal

## SEO
- **Structured data**: JSON-LD on all pages — WebSite + VideoGame (home), CollectionPage+ItemList (list pages), Article+BreadcrumbList+FAQPage (detail pages), SoftwareApplication (developers)
- **Title format**: `"Slay the Spire 2 [Topic] - [Descriptor] | Spire Codex"` — standardized across all pages
- **Sitemap**: Flat XML at `/sitemap.xml`, `force-dynamic` (renders server-side, not build-time). ~1,500+ URLs including browse pages and i18n landing pages
- **International SEO**: `/{lang}/` routes for 13 non-English languages with hreflang alternates
- **Programmatic SEO**: 41 card browse pages at `/cards/browse/` (rare-attacks, ironclad-skills, etc.)
- **Internal linking**: Powers ↔ cards, encounters → monsters, card keywords → keyword hub pages
- **Alt text**: All images include "Slay the Spire 2 {Category}"

## Embeddable Widgets
### Tooltip Widget (`/widget/spire-codex-tooltip.js`)
- Vanilla JS, zero dependencies, ~15KB
- Scans page for `[[Card Name]]`, `[[relic:Name]]`, `[[potion:Name]]`, etc.
- Supports all 13 entity types
- Rich tooltips with image, stats, description, "Powered by Spire Codex" link
- `SpireCodex.scan()` public API for SPAs
### Changelog Widget (`/widget/spire-codex-changelog.js`)
- Embeddable version changelog viewer
- Version switching dropdown, NEW/FIX/API badges

## Spine Rendering
- Game sprites are **Spine skeletal animations** (.skel + .atlas + .png spritesheet), NOT static images
- Skeletons are Spine 4.2.x binary format; runtime is 4.2.107
- **WebGL renderer** (preferred): `render_webgl.mjs` / `render_all_webgl.mjs` — uses Playwright + spine-webgl to render via headless Chrome's GPU. No triangle seam artifacts.
- **Canvas renderer** (legacy): `render.mjs` / `render_all.mjs` — uses spine-canvas with `triangleRendering = true`. Has visible wireframe mesh artifacts from canvas clip paths.
- WebGL renderer requires: `npm install playwright @esotericsoftware/spine-webgl` + `npx playwright install chromium`
- Uses system Chrome (`channel: "chrome"`) for WebGL support since headless shell lacks GPU
- 138 of 158 skeletons render successfully; 20 skip (no atlas, VFX-only, blank)
- Hidden slots: `smokeTex`, `smoke_placeholder` excluded from rendering (removes "Smoke Placeholder" text from gas_bomb, living_smog)
- Auto-crop pipeline for undersized sprites: crops to content bbox, rescales to fill 512x512 frame (fuzzy_wurm_crawler, thieving_hopper, terror_eel, myte, leaf_slime_m, sludge_spinner)
- Monster sprites served from `backend/static/images/monsters/` (512x512)
- Hi-res ancients (Neow, Tezcatara) at `backend/static/images/misc/` (2048x2048)

## Key Technical Patterns
- **Card DynamicVars**: `new DamageVar(8m)`, `new BlockVar(5m)`, `new PowerVar<VulnerablePower>(2m)`
- **Compendium order**: Cards sorted by pool→rarity→ID, relics/potions by rarity→name
- **Event choice ordering**: Extracted from C# source localization key order, not alphabetical
- **Power inheritance**: 19 powers inherit from Temporary{Strength,Dexterity,Focus}Power — type/description resolved from parent
- **Starter relic upgrades**: Mapped via TouchOfOrobas.RefinementUpgrades to correct character pools
- **Detail page tabs**: Overview (stats/description), Details (merchant price, powers, related), Info (localized names, version history)
- **i18n key fields**: `rarity_key`, `type_key` on cards/relics/potions, `power_key` on powers_applied — English values preserved alongside localized display strings for logic (merchant prices, power links)
- **Card upgrade descriptions**: `upgrade_description` field on all 403 upgradable cards — resolved with upgraded var values for correct plurals, icons, and text
- **Monster multi-hit**: `hit_count` extracted from `WithHitCount(N)` in C# source (including AscensionHelper patterns), displayed as `damage × hits = total`
- **Monster innate powers**: 42 monsters have powers applied at spawn (Territorial, Artifact, Slippery, etc.) extracted from `AfterAddedToRoom`
- **Event dynamic values**: Runtime-computed values (escalating costs, gold ranges, heal-to-full) resolved per-step with special handlers for Tablet of Truth, Abyssal Baths, and CalculateVars patterns
- **Guides**: Markdown files in `data/guides/` with YAML frontmatter, parsed to JSON, rendered with react-markdown + tooltip widget (`[[Card Name]]` syntax)
- **Mechanics page**: 27 individual SEO pages at `/mechanics/{slug}` — drop rates, combat formulas, map generation, boss pools, secrets & trivia
- **IndexNow**: Deploy script pings api.indexnow.org with all 1,522 URLs after every push
- **Shareable changelogs**: `/changelog#1.0.6` auto-selects version via URL hash
- **Nav grouping**: Collapsible sections (Database, Game Info, About the Site) with auto-expand for active page
- **ID format**: PascalCase class name → UPPER_SNAKE_CASE

## Commands
```bash
# Local development
cd backend && uvicorn app.main:app --reload  # Backend (port 8000)
cd frontend && npm run dev                    # Frontend (port 3000)

# Docker
docker compose up -d --build

# Parse all data (all 14 languages)
cd backend/app/parsers && python3 parse_all.py

# Parse beta data (from Steam beta branch extraction)
cd backend/app/parsers && EXTRACTION_DIR=extraction/beta DATA_DIR=data-beta python3 parse_all.py

# Generate changelog diff
python3 tools/diff_data.py v1.0.4 --format json --game-version 1.0.5 --date 2026-03-21 --title "Update title"

# Render single skeleton via WebGL (no seam artifacts)
cd tools/spine-renderer && node render_webgl.mjs <skel_dir> <output_path> [size]
# Example: hi-res Neow
node render_webgl.mjs ../../extraction/raw/animations/backgrounds/neow_room ../../backend/static/images/misc/neow.png 2048

# Re-render ALL skeletons via WebGL (138 skeletons, outputs to backend/static/images/renders/)
node render_all_webgl.mjs

# Then copy monster renders to the served directory
for dir in ../../backend/static/images/renders/monsters/*/; do name=$(basename "$dir"); src=$(find "$dir" -name "*.png" | head -1); [ -f "$src" ] && [ -f "../../backend/static/images/monsters/${name}.png" ] && cp "$src" "../../backend/static/images/monsters/${name}.png"; done

# Deploy (production)
python3 tools/deploy.py

# Deploy (beta — tags images as :beta, skips IndexNow)
python3 tools/deploy.py --beta

# Start beta on server
docker compose -f docker-compose.beta.yml up -d
```

## Beta Site (beta.spire-codex.com)

Parallel deployment for Steam beta branch data. Uses same codebase/images but separate containers and `data-beta/` volume.

- **Extraction**: `extraction/beta/raw/` + `extraction/beta/decompiled/`
- **Parsed data**: `data-beta/` (14 languages)
- **Docker**: `docker-compose.beta.yml` with `:beta` tagged images
- **Parser env vars**: `EXTRACTION_DIR` and `DATA_DIR` via `parser_paths.py`

## Versioning
Uses `1.X.Y` — 1=codex major, X=bumps on Mega Crit game patch, Y=our fixes/improvements.
Current: **v1.0.20**

## Known Limitations
- 6 monsters lack images entirely (Crusher, Doormaker, Flyconid, Ovicopter, Rocket, Decimillipede)
- Some monster sprites are low-res due to tiny source atlas textures (fuzzy_wurm_crawler, thieving_hopper)
- Some card descriptions have unresolved conditionals (`{InCombat:...}`, `{IsTargeting:...}`)
- Card color "event" has no matching energy icon — falls back to "colorless"
- Docker builds can fail with Turbopack panic if disk space is low (`docker system prune -f`)
- Root-level `data/*.json` files may be stale/wrong language — always use `data/eng/*.json` for diffs
- i18n is partial — entity data fully translated via API, UI chrome ~60% translated via `lib/ui-translations.ts`
  - Compare graphs broken in non-English (keyword matching uses English names)
  - Merchant page section headings/descriptions/fake relic table still English
  - About and Changelog pages delegate to English components (content not translated)
  - Recommend migrating to `next-intl` for complete i18n coverage

## Future Enhancements
- ~~Individual detail pages~~ ✅
- ~~Global search~~ ✅
- ~~SEO (structured data + meta tags)~~ ✅
- ~~Tooltip widget~~ ✅
- ~~Character comparison pages~~ ✅
- ~~Keyword hub pages~~ ✅
- ~~Merchant guide~~ ✅
- ~~International SEO~~ ✅
- ~~Developer docs + data exports~~ ✅
- ~~WebGL sprite rendering~~ ✅
- ~~Monster multi-hit display~~ ✅
- ~~IndexNow integration~~ ✅
- ~~Shareable changelogs~~ ✅
- ~~Localized detail pages (/{lang}/cards/{id})~~ ✅ — all entity types, 1:1 with English
- ~~Full site localization routes~~ ✅ — all 30+ pages have /{lang}/ equivalents
- ~~UI translations (tabs, nav, headings, taglines)~~ ✅ — partial, via lib/ui-translations.ts
- ~~Community guides~~ ✅ — markdown guides with submission form, tooltip widget, author socials
- ~~Game mechanics / drop rates page~~ ✅ — 27 individual SEO pages covering card/relic/potion odds, map generation, combat, boss pools, secrets
- ~~Monster innate powers~~ ✅ — 42 monsters with powers parsed from AfterAddedToRoom
- ~~Achievement unlock conditions~~ ✅ — category, character, threshold, condition from C# source
- ~~Card upgrade descriptions~~ ✅ — upgrade_description for all 403 upgradable cards
- ~~Event dynamic values~~ ✅ — escalating costs, gold ranges, heal-to-full resolved correctly
- ~~Event preconditions~~ ✅ — `IsAllowed` bodies translated to human-readable strings (gold thresholds, act restrictions, deck requirements); handles both `RunState` and `IRunState` signatures
- ~~Monster attack patterns~~ ✅ — cycle/random/conditional move-machine parsing from `GenerateMoveStateMachine`
- ~~Multi-version beta browsing~~ ✅ — versioned `data-beta/vX.Y.Z/` dirs with `latest` symlink, version-aware loader
- ~~Leaderboards + run browser revamp~~ ✅ — `/leaderboards` 3-tab page (Fastest Wins, Highest Ascension, Browse), drag-and-drop submit, ranked-table stats replacing `/meta`, filter by seed/username/character/win/version/sort
- ~~In-game-style run summary~~ ✅ — `/runs/[hash]` mimics the end-of-run screen with map-node rows, clickable encounter/event links, tiny-card deck grid
- ~~TinyCard primitive + docs~~ ✅ — shared React component reproducing the in-game card thumbnail; live preview + recipes on `/developers`
- ~~Search bar redesign~~ ✅ — hero search on home, middle-of-nav on other pages, icon-only on mobile
- i18n refactor — migrate from manual t() calls to `next-intl` for complete translation coverage
  - Known gaps: compare graphs (keyword matching), merchant prose, about/changelog content, scattered client component strings
  - Current t() approach doesn't scale — hundreds of strings across dozens of components
  - `next-intl` handles URL-based locale detection, server/client components, centralized message files
- Discord bot (card lookup, patch alerts)
- Deck builder / run simulator
- Database (SQLite/Postgres) instead of JSON files
- User accounts with deck/run sharing
