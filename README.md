<p align="center">
  <img src="frontend/public/spire-codex-white-silent-black-background.png" alt="Spire Codex logo" width="200" />
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README_deu.md">Deutsch</a> ·
  <a href="README_esp.md">Español (ES)</a> ·
  <a href="README_fra.md">Français</a> ·
  <a href="README_ita.md">Italiano</a> ·
  <a href="README_jpn.md">日本語</a> ·
  <a href="README_kor.md">한국어</a> ·
  <a href="README_pol.md">Polski</a> ·
  <a href="README_ptb.md">Português (BR)</a> ·
  <a href="README_rus.md">Русский</a> ·
  <a href="README_spa.md">Español (LA)</a> ·
  <a href="README_tha.md">ไทย</a> ·
  <a href="README_tur.md">Türkçe</a> ·
  <a href="README_zhs.md">简体中文</a> ·
  <a href="README_zht.md">繁體中文</a>
</p>

# Spire Codex

A comprehensive database and API for **Slay the Spire 2** game data, built by reverse-engineering the game files. Supports all **15 languages** shipped with the game.

**Live site**: [spire-codex.com](https://spire-codex.com)

**Steam App ID**: 2868840

## How It Was Built

Slay the Spire 2 is built with Godot 4 but all game logic lives in a C#/.NET 8 DLL (`sts2.dll`), not GDScript. The data pipeline:

1. **PCK Extraction** - [GDRE Tools](https://github.com/bruvzg/gdsdecomp) extracts the Godot `.pck` file to recover images, Spine animations, and localization data (~9,947 files).

2. **DLL Decompilation** - [ILSpy](https://github.com/icsharpcode/ILSpy) decompiles `sts2.dll` into ~3,300 readable C# source files containing all game models.

3. **Data Parsing** - 22 Python regex-based parsers extract structured data from the decompiled C# source, outputting per-language JSON to `data/{lang}/`:
   - **Cards**: `base(cost, CardType, CardRarity, TargetType)` constructors + `DamageVar`, `BlockVar`, `PowerVar<T>` for stats
   - **Characters**: `StartingHp`, `StartingGold`, `MaxEnergy`, `StartingDeck`, `StartingRelics`
   - **Relics/Potions**: Rarity, pool, descriptions resolved from SmartFormat templates
   - **Monsters**: HP ranges, ascension scaling via `AscensionHelper`, move state machines with per-move intents (Attack/Defend/Buff/Debuff/Status/Summon/Heal), damage values, multi-hit counts (including AscensionHelper patterns), innate powers from `AfterAddedToRoom` (42 monsters with ascension variants), powers applied per move (target + amount from `PowerCmd.Apply<T>`), block, healing, encounter context (act, room type), **attack patterns** parsed from `GenerateMoveStateMachine()` (112 monsters - cycle, random, conditional, mixed)
   - **Enchantments**: Card type restrictions, stackability, Amount-based scaling
   - **Encounters**: Monster compositions, room type (Boss/Elite/Monster), act placement, tags
   - **Events**: Multi-page decision trees (56 of 66 events), choices with outcomes, act placement, `StringVar` model references resolved to display names, runtime-computed values (escalating costs via `GetDecipherCost()`, gold ranges via `CalculateVars` with `NextInt`/`NextFloat`, heal-to-full patterns), **preconditions** from `IsAllowed()` (25 events - gold, HP, act, deck, relic, potion conditions)
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

4. **Description Resolution** - A shared `description_resolver.py` module resolves SmartFormat localization templates (`{Damage:diff()}`, `{Energy:energyIcons()}`, `{Cards:plural:card|cards}`) into human-readable text with rich text markers for frontend rendering. Runtime-dynamic variables (e.g., `{Card}`, `{Relic}`) are preserved as readable placeholders. `StringVar` references in events (e.g., `{Enchantment1}` → `ModelDb.Enchantment<Sharp>().Title`) are resolved to display names via localization lookup.

5. **Spine Rendering** - Characters and monsters are Spine skeletal animations, not static images. A headless Node.js renderer assembles idle poses into 512×512 portrait PNGs. All 111 monsters have images: 100 rendered from Spine skeletons, 6 aliased from shared skeletons (Flyconid→flying_mushrooms, Ovicopter→egg_layer, Crusher/Rocket→kaiser_crab), and 5 from static game assets (Doormaker). Also renders all 5 characters (combat, rest site, character select poses), NPCs, and backgrounds. Skin-based variants (Cultists, Bowlbugs, Cubex) are rendered individually. See [Spine Renderer](#spine-renderer) below.

6. **Images** - Card portraits, relic/potion icons, character art, monster sprites, Ancient portrait icons, and boss encounter icons extracted from game assets and served as static files.

7. **Changelog Diffing** - A diff tool compares JSON data between game versions (via git refs or directories), tracking added/removed/changed entities per category with field-level diffs. Changelogs are keyed by Steam game version + optional Codex revision number.

## Project Structure

```
spire-codex/
├── backend/                    # FastAPI backend
│   ├── app/
│   │   ├── main.py             # App entry, CORS, GZip, rate limiting, Sentry, /health, /metrics, static mounts
│   │   ├── dependencies.py     # Shared deps (lang validation, language names)
│   │   ├── metrics.py          # Prometheus multiprocess setup
│   │   ├── routers/            # API endpoints (70+ routers)
│   │   ├── models/schemas.py   # Pydantic models
│   │   ├── services/           # ~50 modules: JSON game data (LRU cached, 15 languages), Mongo runs store,
│   │   │                       #   Redis cache, DuckDB lake readers, auth/JWT, R2 uploads, tantivy search index,
│   │   │                       #   player Elo, seed finder, live presence/overlay, supporters, tier lists
│   │   └── parsers/            # C# source → JSON parsers
│   │       ├── card_parser.py, character_parser.py, monster_parser.py, relic_parser.py, potion_parser.py
│   │       ├── enchantment_parser.py, encounter_parser.py, event_parser.py, power_parser.py
│   │       ├── keyword_parser.py        # Keywords, intents, orbs, afflictions, modifiers, achievements (with unlock conditions)
│   │       ├── badge_parser.py, ancient_pool_parser.py, merchant_parser.py, rest_site_parser.py
│   │       ├── mechanics_constants_parser.py, epoch_parser.py, act_parser.py, ascension_parser.py
│   │       ├── pool_parser.py            # Adds character pool to potions
│   │       ├── localization_parser.py    # Game localization tables → ICU MessageFormat
│   │       ├── message_parser.py, icu_check.py, orphan_filter.py
│   │       ├── translation_parser.py    # Generates translations.json per language
│   │       ├── guide_parser.py          # Markdown guides with YAML frontmatter
│   │       ├── news_parser.py
│   │       ├── description_resolver.py   # Shared SmartFormat resolver
│   │       ├── parser_paths.py           # Shared path config (env var overrides for beta)
│   │       └── parse_all.py              # Orchestrates all parsers (15 languages)
│   ├── scripts/                # copy_images, build_search_index, build_pairings, build_draft_recs,
│   │                           #   build_run_vectors, build_embeddings, backfills and repair scripts
│   ├── tests/                  # pytest suite
│   ├── static/                 # Game images and audio (not committed)
│   ├── Dockerfile
│   ├── requirements.txt
│   └── requirements-dev.txt
├── frontend/                   # Next.js 16 + React 19 + TypeScript + Tailwind CSS
│   ├── app/
│   │   ├── [locale]/           # Every page lives here (next-intl), 15 languages
│   │   │                       #   Pages: cards, characters, relics, monsters, potions, enchantments,
│   │   │                       #   encounters, events, powers, keywords, badges, ancients, unlocks,
│   │   │                       #   timeline, reference, images, changelog, about, merchant, compare,
│   │   │                       #   mechanics/[slug], guides, stats/*, leaderboards, top-players,
│   │   │                       #   players/[username], runs, replays, seed-finder, deck-builder,
│   │   │                       #   tier-list, tier-list-maker, archetypes, live, beta, admin
│   │   ├── contexts/           # AuthContext
│   │   ├── components/         # CardGrid, RichDescription, SearchFilter, GlobalSearch, Navbar,
│   │   │                       #   Footer, LanguageSelector and ~80 more
│   │   └── robots.ts, sitemap.ts
│   ├── i18n/                   # next-intl routing, request config, message loading
│   ├── lib/
│   │   ├── api/                # API client, endpoint helpers + TypeScript types
│   │   ├── fetch-cache.ts      # Client-side in-memory fetch cache (5min TTL)
│   │   ├── seo.ts              # Shared SEO utilities (stripTags, SITE_URL, SITE_NAME)
│   │   ├── jsonld.ts           # JSON-LD schema builders (BreadcrumbList, CollectionPage, Article, WebSite, FAQPage)
│   │   ├── ui-translations.ts, i18n*.ts  # UI strings for all 15 languages
│   │   ├── languages.ts       # i18n config - language codes, hreflang mappings
│   │   └── ...                # run-query, replay, seed-finder-state, pacific, design tokens, vitest specs
│   ├── scripts/                # generate-site-pages.mjs, generate-client-i18n.mjs (run before dev and build)
│   ├── proxy.ts                # Locale prefix routing
│   ├── sentry.*.config.ts, instrumentation*.ts
│   └── Dockerfile
├── tools/
│   ├── spine-renderer/         # Headless Spine skeleton renderer
│   │   ├── render_webgl.mjs     # WebGL renderer (single skeleton) - no seam artifacts
│   │   ├── render_all_webgl.mjs # WebGL batch renderer (all .skel files)
│   │   ├── render_gif.mjs      # Animation renderer (WebP/GIF/APNG with skin + anim support)
│   │   ├── render_hires.mjs    # High-resolution renders
│   │   ├── render.mjs, render_all.mjs  # Legacy canvas renderers (have triangle seams)
│   │   ├── render_skins2.mjs    # Skin variant renderer
│   │   ├── render_utils.mjs     # Shared canvas rendering utilities
│   │   └── package.json
│   ├── beta-watch/             # Beta ingest: watch.sh, process.sh, sync-images.sh, launchd plist
│   ├── diff_data.py            # Changelog diff generator
│   ├── update.py               # Cross-platform update pipeline
│   ├── deploy.py               # Local Docker build + push to Docker Hub
│   ├── startup.sh              # Release and rollback on the prod box
│   ├── warm_cache.py           # Visits every page to warm the caches
│   ├── build_image_manifest.py, extraction_manifest.py  # Image dump and extraction manifests
│   ├── extract_*.py, frames_to_gif.py, rescale_bestiary.py  # Asset helpers (card frames, flames, ascension icons, bestiary)
│   ├── character_themes.py     # Generates the character theme CSS blocks
│   └── audit_events_*.py       # QA audits of event numbers against the C# source
├── lab/                        # DuckDB analytics lake: extract.py, build_lake.py, *.sql, queries/, ingest.py,
│                               #   publish_lake.py, pull_lake.py, player_elo_board.py, player_stats.py, export_dump.py
├── infrastructure/ansible/     # Prod box playbooks (deploy, rollback, mongo-install, backups), bin/op-ansible wrapper
├── alloy/                      # Grafana Alloy configs: container and nginx logs to Loki, cadvisor and host metrics
├── contributing/               # Architecture, API reference, data guide, contributor quickstart
├── extraction-manifests/       # Per-build file manifests of the extracted game (gzipped JSON)
├── markdown-docs/              # Design notes (beta diff, live presence)
├── data/                       # Parsed JSON data files
│   ├── {lang}/                 # 15 languages: eng, deu, esp, fra, ita, jpn, kor, pol, ptb, rus, spa, tha, tur, zhs, zht
│   ├── changelogs/             # Changelog JSON files (keyed by game version)
│   ├── guides/                 # Markdown guide files with YAML frontmatter
│   ├── guides.json             # Parsed guide data
│   ├── mechanics_pages/, news/ # Mechanics markdown and the archived news feed
│   ├── runs/                   # Submitted run JSON files (runtime, not committed)
│   └── runs.db                 # Legacy SQLite fallback when MONGO_URL is unset (runtime, not committed)
├── extraction/                 # Raw game files (not committed)
│   ├── raw/                    # GDRE extracted Godot project
│   ├── decompiled/             # ILSpy output
│   └── beta/                   # Steam beta branch (raw/ + decompiled/)
├── data-beta/                  # Parsed beta data (versioned: v0.110.0/, v0.111.0/, latest → symlink)
├── docker-compose.yml          # Local dev: backend, redis, frontend
├── docker-compose.prod.yml     # Production: backend, redis, frontend, lake-ingest (ops profile)
├── docker-compose.mongo.yml    # MongoDB single-node replica set
├── docker-compose.lab.yml      # Lake extract, shadow and duckdb containers
├── docker-compose.monitoring.yml, docker-compose.monitoring-ingest.yml  # Grafana Alloy + node-exporter
├── docker-compose.umami.yml    # Self-hosted Umami analytics
└── .github/workflows/
    ├── ci.yml                  # Secret scan, lint, type-check, pytest, Docker build+push
    ├── changelog-guard.yml
    ├── news-refresh.yml
    └── runs-db-backup.yml
```

## Public Services

| Host                                                 | Purpose                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [`spire-codex.com`](https://spire-codex.com)         | Public website and same-origin API. The active beta channel lives under `/beta`.                             |
| `cdn.spire-codex.com`                                | Cloudflare R2 object host for game art, full card renders, localized renders, and archived beta assets.      |
| [`bot.spire-codex.com`](https://bot.spire-codex.com) | Knowledge Demon landing page and Discord-authenticated staff dashboard. The bot consumes the main Codex API. |
| `analytics.spire-codex.com`                          | Self-hosted Umami script and dashboard. Its PostgreSQL database stays on a private Docker network.           |
| `tierlists.spire-codex.com`                          | Dedicated R2 object host for generated tier-list preview images.                                             |
| `beta.spire-codex.com`                               | Retired public host. Cloudflare redirects requests to the same path on the apex domain.                      |

The CDN and tier-list hosts are object stores rather than browsable websites, so a `404` at either root is expected.

## Website Pages

| Page               | Route                  | Description                                                                                                                                                                                                                            |
| ------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home               | `/`                    | Dashboard with entity counts, category cards, character links                                                                                                                                                                          |
| Cards              | `/cards`               | Filterable card grid with modal detail view                                                                                                                                                                                            |
| Card Detail        | `/cards/[id]`          | Full card stats, upgrade info, image                                                                                                                                                                                                   |
| Characters         | `/characters`          | Character overview grid                                                                                                                                                                                                                |
| Character Detail   | `/characters/[id]`     | Stats, starting deck/relics, quotes, NPC dialogue trees                                                                                                                                                                                |
| Relics             | `/relics`              | Filterable relic grid                                                                                                                                                                                                                  |
| Relic Detail       | `/relics/[id]`         | Full relic info with rich text flavor                                                                                                                                                                                                  |
| Monsters           | `/monsters`            | Monster grid with HP, moves, Spine renders                                                                                                                                                                                             |
| Monster Detail     | `/monsters/[id]`       | HP, moves with intents/damage/powers/block, encounter links, power tooltips                                                                                                                                                            |
| Potions            | `/potions`             | Filterable potion grid (rarity, character pool)                                                                                                                                                                                        |
| Potion Detail      | `/potions/[id]`        | Full potion info                                                                                                                                                                                                                       |
| Enchantments       | `/enchantments`        | Enchantment list with card type filters                                                                                                                                                                                                |
| Enchantment Detail | `/enchantments/[id]`   | Full enchantment info                                                                                                                                                                                                                  |
| Encounters         | `/encounters`          | Encounter compositions by act/room type                                                                                                                                                                                                |
| Encounter Detail   | `/encounters/[id]`     | Monster lineup, room type, tags                                                                                                                                                                                                        |
| Events             | `/events`              | Multi-page event trees with expandable choices                                                                                                                                                                                         |
| Event Detail       | `/events/[id]`         | Full event pages, options, Ancient dialogue                                                                                                                                                                                            |
| Powers             | `/powers`              | Buffs, debuffs, and neutral powers                                                                                                                                                                                                     |
| Power Detail       | `/powers/[id]`         | Power info with cards that apply this power                                                                                                                                                                                            |
| Keywords           | `/keywords`            | Card keyword list                                                                                                                                                                                                                      |
| Keyword Detail     | `/keywords/[id]`       | Keyword description with filterable card grid                                                                                                                                                                                          |
| Merchant           | `/merchant`            | Card/relic/potion pricing, card removal costs, fake merchant                                                                                                                                                                           |
| Compare            | `/compare`             | Character comparison hub (10 pairs)                                                                                                                                                                                                    |
| Compare Detail     | `/compare/[pair]`      | Side-by-side character comparison                                                                                                                                                                                                      |
| Developers         | `/developers`          | API docs, widget docs, data exports                                                                                                                                                                                                    |
| Showcase           | `/showcase`            | Community project gallery                                                                                                                                                                                                              |
| Timeline           | `/timeline`            | Epoch progression with era grouping, unlock requirements                                                                                                                                                                               |
| Act Detail         | `/acts/[id]`           | Bosses, encounters, events, ancients for an act                                                                                                                                                                                        |
| Ascension Detail   | `/ascensions/[id]`     | Ascension level description with prev/next navigation                                                                                                                                                                                  |
| Intent Detail      | `/intents/[id]`        | Intent icon, description                                                                                                                                                                                                               |
| Orb Detail         | `/orbs/[id]`           | Orb icon, passive/evoke description                                                                                                                                                                                                    |
| Affliction Detail  | `/afflictions/[id]`    | Affliction description, stackability                                                                                                                                                                                                   |
| Modifiers          | `/modifiers`           | Run modifier list                                                                                                                                                                                                                      |
| Modifier Detail    | `/modifiers/[id]`      | Run modifier description                                                                                                                                                                                                               |
| Ancients           | `/ancients`            | Relic pools, offerings and conditions for all 8 Ancients                                                                                                                                                                               |
| Unlocks            | `/unlocks`             | Everything unlocked through timeline progression (cards, relics, potions, characters)                                                                                                                                                  |
| Epoch Detail       | `/timeline/[id]`       | One timeline epoch                                                                                                                                                                                                                     |
| Achievement Detail | `/achievements/[id]`   | Achievement description                                                                                                                                                                                                                |
| Badges             | `/badges`              | All 25 run-end badges grouped by tiered / single-tier / multiplayer-only                                                                                                                                                               |
| Badge Detail       | `/badges/[id]`         | Per-tier breakdown (Bronze / Silver / Gold), requires-win + multiplayer flags, icon                                                                                                                                                    |
| Mechanics          | `/mechanics`           | Game mechanics hub - 27 clickable sections with individual SEO pages                                                                                                                                                                   |
| Mechanic Detail    | `/mechanics/[slug]`    | Card odds, relic distribution, potion drops, map generation, boss pools, combat, secrets & trivia                                                                                                                                      |
| Card Browse        | `/cards/browse`        | Card browse matrix by type, rarity and more; each combination is its own page at `/cards/browse/[slug]`                                                                                                                                |
| Guides             | `/guides`              | Community strategy guides with search/filter; `/guides/[slug]` is one guide, `/guides/submit` is the submission form                                                                                                                   |
| Leaderboards       | `/leaderboards`        | Fastest Wins and Highest Ascension ladders with single/co-op and game-mode filters (standard / daily / Today / custom). All filter state is in the URL so any view is shareable                                                        |
| Browse Runs        | `/runs`                | Full run browser with an expression search bar (`user:`, `char:`, `asc:` ranges, `card:`/`relic:` multi-value AND, `version:` ranges, `mode:`, `result:`, `players:`) plus dropdown filters, sort, and shareable URLs                  |
| Contribute         | `/runs/submit`         | Drag-and-drop `.run` upload with Overwolf companion link, Steam/Discord sign-in to auto-associate runs, and your recent runs                                                                                                           |
| Stats hub          | `/stats`               | Community stats hub with a Stats nav menu: Overview, Cards, Relics, Potions, Encounters, Charts, Chart builder, plus Decisions (Shops, Events, Campfires), Rankings, and Runs columns. Every page defaults to the Standard Solo cohort |
| Card metrics       | `/stats/cards`         | Per-card win rate (Wilson 95% CI), pick rate, hold rate, Codex Elo, and lift, per seat and filterable by cohort/character                                                                                                              |
| Relic metrics      | `/stats/relics`        | Per-relic win rate, hold rate, wax blocks (Toy Box copies split out), and Codex Elo from free choice screens                                                                                                                           |
| Potion metrics     | `/stats/potions`       | Per-potion win rate, hold rate, and use rate from per-floor potion events                                                                                                                                                              |
| Encounters         | `/stats/encounters`    | Deadliest encounters and combat outcomes, defaulting to solo runs                                                                                                                                                                      |
| Decisions          | `/stats/shops`         | Shop purchases, event decisions (`/stats/events`), and campfire picks (`/stats/campfires`), with localized names and per-seat counts                                                                                                   |
| Run Charts         | `/stats/charts`        | Interactive charts over community-submitted runs, shareable                                                                                                                                                                            |
| Chart Builder      | `/stats/chart-builder` | Build a chart from any tracked run stat and save it; saved charts share at `/charts/{id}`                                                                                                                                              |
| Saved Chart        | `/charts/[id]`         | A saved chart from the chart builder, re-drawn from the live metrics API                                                                                                                                                               |
| Top Players        | `/top-players`         | Nightly Codex Elo board over solo A10 standard runs, from `/api/leaderboards/elo`                                                                                                                                                      |
| Replays            | `/replays`             | Runs with a replay journal from the in-game mod, with the same filters as the run browser                                                                                                                                              |
| Replay Viewer      | `/runs/[hash]/replay`  | Plays back one run's replay journal                                                                                                                                                                                                    |
| Seed Finder        | `/seed-finder`         | Find seeds the community has played into a combination of offers, events, bosses and shops                                                                                                                                             |
| Seed Detail        | `/seed-finder/[seed]`  | What one seed offers: Neow relics, card rewards by floor, bosses, shops and outcomes from real runs                                                                                                                                    |
| Archetypes         | `/archetypes`          | Community deck archetypes, clustered nightly from submitted runs                                                                                                                                                                       |
| Player Profile     | `/players/[username]`  | Public profile: win rate and percentile, what kills them, campfire choices, card picks vs the community, records                                                                                                                       |
| Live               | `/live`                | Who is in a run with the mod right now; `/live/[steamId]` follows one player's live run                                                                                                                                                |
| Mod                | `/mod`                 | The Steam Workshop mod: automatic run uploads, in-game community insights, route planner                                                                                                                                               |
| Exporter           | `/exporter`            | The Workshop tool that generates the site's images: card renders, Spine art, animations, texture dumps                                                                                                                                 |
| Overlay            | `/overlay`             | The Overwolf companion overlay: in-game lookups plus a live run tracker that reads the save file                                                                                                                                       |
| Link Overwolf      | `/link/overwolf`       | Link an Overwolf subscription to the signed-in account                                                                                                                                                                                 |
| Uninstall          | `/uninstall`           | Feedback form for people who uninstalled the companion                                                                                                                                                                                 |
| Deck Builder       | `/deck-builder`        | Build a deck and get suggestions from the winning decks nearest to it                                                                                                                                                                  |
| Profile            | `/profile`             | Signed-in user's stats (top cards/relics/potions, character breakdown), personal bests, competitive comparison (today's daily leaderboard, global ranks, win rate vs community), and run management                                    |
| Settings           | `/settings`            | Account settings: username, email, linked Steam/Discord                                                                                                                                                                                |
| Shared Run         | `/runs/[hash]`         | In-game-style victory/defeat summary with clickable map-node icons, relic strip, and tiny-card grid                                                                                                                                    |
| Reference          | `/reference`           | All items clickable - acts, ascensions, keywords, orbs, afflictions, intents, modifiers, achievements                                                                                                                                  |
| Images             | `/images`              | Browsable game assets with ZIP download per category                                                                                                                                                                                   |
| Changelog          | `/changelog`           | Data diffs between game updates                                                                                                                                                                                                        |
| About              | `/about`               | Project info, stats, pipeline visualization                                                                                                                                                                                            |
| Thank You          | `/thank-you`           | Ko-fi supporters and community contributors (split from About so the page can be linked directly)                                                                                                                                      |
| Knowledge Demon    | `/knowledge-demon`     | Info page for the Discord bot - slash commands, moderation features, install CTA                                                                                                                                                       |
| News               | `/news`                | Mirrored Steam announcements feed; canonical links back to Steam so it's additive, not duplicative                                                                                                                                     |
| News article       | `/news/[...slug]`      | Single Steam announcement with sanitized BBCode body and `NewsArticle` JSON-LD                                                                                                                                                         |
| Site news          | `/news/codex/[slug]`   | One Spire Codex site news entry                                                                                                                                                                                                        |
| Tier List          | `/tier-list`           | Codex Score tier-list hub (S → F tiers) for cards / relics / potions                                                                                                                                                                   |
| Tier List Detail   | `/tier-list/cards`     | Visual S/A/B/C/D/F rows for one entity type (`/tier-list/relics`, `/tier-list/potions` too), sourced from `/api/runs/scores/{type}`                                                                                                    |
| Tier List Maker    | `/tier-list-maker`     | Build and save your own tier lists: `/new`, `/[id]` to edit, `/shared/[shareId]` is the public share link                                                                                                                              |
| Scoring            | `/stats/scoring`       | Codex Score methodology page - Bayesian shrinkage, prior weight, scale range, tier cutoffs                                                                                                                                             |
| Meta               | `/meta`                | Legacy alias that sends visitors to `/stats`                                                                                                                                                                                           |
| Privacy, Terms     | `/privacy`, `/terms`   | Privacy policy and terms                                                                                                                                                                                                               |
| Beta               | `/beta`                | What the current beta adds, changes and removes, plus beta copies of the cards, relics, potions, monsters, powers, enchantments, encounters, events, keywords and orbs pages under `/beta/...`                                          |
| Admin              | `/admin`               | Staff console (analytics, banners, cache, Elo, feedback, guides, keys, news, rate limits, runs, searches, thanks, users); admins only                                                                                                   |

## API Endpoints

All data endpoints accept an optional `?lang=` query parameter (default: `eng`) and `?channel=beta` for the beta data. Responses are **GZip-compressed** and most carry `Cache-Control: public, max-age=300`. The full, always-current list is the OpenAPI spec at `/openapi.json` and the Swagger UI at `/docs`; this table covers the public routes.

**Game data**

| Endpoint                                            | Description                                                                                                         | Filters                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `GET /api/cards`                                    | All cards                                                                                                           | `color`, `type`, `rarity`, `keyword`, `tag`, `spawns`, `cost`, `search`, `lang` |
| `GET /api/cards/{id}`                               | Single card                                                                                                         | `lang`                                                                          |
| `GET /api/characters`                               | All characters                                                                                                      | `search`, `lang`                                                                |
| `GET /api/characters/{id}`                          | Single character (with quotes, dialogues)                                                                           | `lang`                                                                          |
| `GET /api/relics`                                   | All relics                                                                                                          | `rarity`, `pool`, `ancient`, `search`, `lang`                                   |
| `GET /api/relics/{id}`                              | Single relic                                                                                                        | `lang`                                                                          |
| `GET /api/monsters`                                 | All monsters                                                                                                        | `type`, `search`, `lang`                                                        |
| `GET /api/monsters/{id}`                            | Single monster                                                                                                      | `lang`                                                                          |
| `GET /api/potions`                                  | All potions                                                                                                         | `rarity`, `pool`, `search`, `lang`                                              |
| `GET /api/potions/{id}`                             | Single potion                                                                                                       | `lang`                                                                          |
| `GET /api/enchantments`                             | All enchantments                                                                                                    | `card_type`, `search`, `lang`                                                   |
| `GET /api/enchantments/{id}`                        | Single enchantment                                                                                                  | `lang`                                                                          |
| `GET /api/encounters`                               | All encounters                                                                                                      | `room_type`, `act`, `search`, `lang`                                            |
| `GET /api/encounters/{id}`                          | Single encounter                                                                                                    | `lang`                                                                          |
| `GET /api/events`                                   | All events                                                                                                          | `type`, `act`, `search`, `lang`                                                 |
| `GET /api/events/{id}`                              | Single event                                                                                                        | `lang`                                                                          |
| `GET /api/powers`                                   | All powers                                                                                                          | `type`, `stack_type`, `search`, `lang`                                          |
| `GET /api/powers/{id}`                              | Single power                                                                                                        | `lang`                                                                          |
| `GET /api/keywords`                                 | Card keyword definitions                                                                                            | `lang`                                                                          |
| `GET /api/keywords/{id}`                            | Single keyword                                                                                                      | `lang`                                                                          |
| `GET /api/intents`                                  | Monster intent types                                                                                                | `lang`                                                                          |
| `GET /api/intents/{id}`                             | Single intent                                                                                                       | `lang`                                                                          |
| `GET /api/orbs`                                     | All orbs                                                                                                            | `lang`                                                                          |
| `GET /api/orbs/{id}`                                | Single orb                                                                                                          | `lang`                                                                          |
| `GET /api/afflictions`                              | Card afflictions                                                                                                    | `lang`                                                                          |
| `GET /api/afflictions/{id}`                         | Single affliction                                                                                                   | `lang`                                                                          |
| `GET /api/modifiers`                                | Run modifiers                                                                                                       | `lang`                                                                          |
| `GET /api/modifiers/{id}`                           | Single modifier                                                                                                     | `lang`                                                                          |
| `GET /api/achievements`                             | All achievements                                                                                                    | `lang`                                                                          |
| `GET /api/achievements/{id}`                        | Single achievement                                                                                                  | `lang`                                                                          |
| `GET /api/badges`                                   | All run-end badges                                                                                                  | `tiered`, `multiplayer_only`, `requires_win`, `search`, `lang`                  |
| `GET /api/badges/{id}`                              | Single badge with tier breakdown                                                                                    | `lang`                                                                          |
| `GET /api/epochs`                                   | Timeline epochs                                                                                                     | `story`, `search`, `lang`                                                       |
| `GET /api/epochs/{id}`                              | Single epoch                                                                                                        | `lang`                                                                          |
| `GET /api/stories`                                  | Story entries                                                                                                       | `lang`                                                                          |
| `GET /api/stories/{id}`                             | Single story                                                                                                        | `lang`                                                                          |
| `GET /api/acts`                                     | All acts                                                                                                            | `lang`                                                                          |
| `GET /api/acts/{id}`                                | Single act                                                                                                          | `lang`                                                                          |
| `GET /api/ascensions`                               | Ascension levels (0-10)                                                                                             | `lang`                                                                          |
| `GET /api/ascensions/{id}`                          | Single ascension level                                                                                              | `lang`                                                                          |
| `GET /api/glossary`                                 | Glossary terms                                                                                                      | `lang`                                                                          |
| `GET /api/glossary/{id}`                            | Single glossary term                                                                                                | `lang`                                                                          |
| `GET /api/ancient-pools`                            | Every ancient's relic pools (generated from the game code)                                                          | -                                                                               |
| `GET /api/ancient-pools/{id}`                       | Relic pools for one ancient                                                                                         | -                                                                               |
| `GET /api/unlocks`                                  | Unlockable entities grouped by type, with epoch context                                                             | `lang`                                                                          |
| `GET /api/merchant/config`                          | Auto-extracted merchant pricing config                                                                              | -                                                                               |
| `GET /api/mechanics/constants`                      | Parsed mechanics constants (room odds, gold ranges, ascension tuning)                                               | -                                                                               |
| `GET /api/mechanics/sections`                       | Index of the mechanics pages                                                                                        | -                                                                               |
| `GET /api/mechanics/sections/{slug}`                | One mechanics page as markdown, template tokens already resolved                                                    | -                                                                               |
| `GET /api/stats`                                    | Entity counts across all categories                                                                                 | `lang`                                                                          |
| `GET /api/history/{entity_type}/{entity_id}`        | Per-entity version history from the changelogs (case-insensitive, newest first)                                     | -                                                                               |
| `GET /api/update-history/{entity_type}/{entity_id}` | Game-patch changes for one entity, newest first; 404 when no patch touched it                                       | -                                                                               |
| `GET /api/names/{entity_type}/{entity_id}`          | The entity's display name in every language                                                                         | -                                                                               |
| `GET /api/search`                                   | Site search across entities, reference entries, mechanics, guides, news, pages and image files, with typo tolerance | `q`, `lang`                                                                     |
| `GET /api/search/semantic`                          | Meaning-based entity search; empty when the feature is off                                                          | `q`, `limit`                                                                    |

**Languages and localization**

| Endpoint                         | Description                                                                                                                           | Filters          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `GET /api/languages`             | Available languages with display names                                                                                                | -                |
| `GET /api/translations`          | Translation maps for filter values and UI strings                                                                                     | `lang`           |
| `GET /api/localizations`         | The game's own localization tables converted to ICU MessageFormat, all of them or just the named ones (max 50; unknown names are 404) | `tables`, `lang` |
| `GET /api/localizations/tables`  | Names of the available localization tables                                                                                            | `lang`           |
| `GET /api/localizations/{table}` | One localization table                                                                                                                | `lang`           |

**Versions, changelogs, news, images**

| Endpoint                                             | Description                                                                          | Filters                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `GET /api/versions`                                  | Available data versions                                                              | -                                                                    |
| `GET /api/beta/version`                              | The current beta version                                                             | -                                                                    |
| `GET /api/beta/diff`                                 | What the current beta adds, changes, and removes per entity type                     | -                                                                    |
| `GET /api/changelogs`                                | Changelog summaries (all versions)                                                   | -                                                                    |
| `GET /api/changelogs/recent-additions`               | Newest entity additions across recent changelogs                                     | `entity_type`, `limit`, `max_versions`, `max_age_days`               |
| `GET /api/changelogs/{tag}`                          | Full changelog for a version tag                                                     | -                                                                    |
| `GET /api/news`                                      | Steam announcements + community news (locally archived)                              | `feed_type`, `feedname`, `tag`, `since`, `search`, `limit`, `offset` |
| `GET /api/news/{gid}`                                | Single news article (sanitized body)                                                 | -                                                                    |
| `GET /api/news/codex`                                | Spire Codex site news, newest first                                                  | -                                                                    |
| `GET /api/news/codex/{slug}`                         | One site news entry                                                                  | -                                                                    |
| `GET /api/announcements`                             | Active site banner messages                                                          | -                                                                    |
| `GET /api/images`                                    | Every registered image dump's categories (main and beta), each with a capped preview | -                                                                    |
| `GET /api/images/search`                             | Filename search across the image dumps                                               | `search`, `limit`                                                    |
| `GET /api/images/game/{version}/{category}/browse`   | One folder of a dump: subfolders plus a page of files                                | `path`, `offset`, `limit`                                            |
| `GET /api/images/game/{version}/{category}/download` | ZIP of one dump folder's files (not its subfolders)                                  | `path`                                                               |

**Runs and community stats**

Counts on the metrics tables are per seat: a 4P run is four seats. Every `bracket` parameter that takes the lake grammar (`all`, `solo`, `2p`, `3p`, `4p`, `a10`, `daily`, `custom`, `standard`, `wr30`, `wr50`, `wr75`, composites like `solo:standard`, a game version like `v0.110.0`, or any of those composed with a version like `solo:wr30:v0.110.0`) answers an unknown value with HTTP 400 instead of falling back to all runs. The metrics tables also return `total_runs`, `total_seats`, `total_wins`, and `data_through` (the submission time of the newest run the table includes).

| Endpoint                                    | Description                                                                                                                                                                                                                                                                                                                                                                                                                              | Filters                                                                                                                                                                                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/runs`                            | Submit a run (.run file JSON). Ownership comes only from `Authorization: Bearer <jwt>`; a bare `steam_id` is stored as a hint                                                                                                                                                                                                                                                                                                            | `username`, `steam_id`, `discord_id`                                                                                                                                                                                                                      |
| `POST /api/runs/claim`                      | Attach the signed-in account to previously-submitted anonymous runs by hash                                                                                                                                                                                                                                                                                                                                                              | -                                                                                                                                                                                                                                                         |
| `GET /api/runs/list`                        | List/browse submitted runs. `total_is_lower_bound` is true when the exact count ran out of time and `total` is a capped lower bound                                                                                                                                                                                                                                                                                                      | `character`, `win`, `username`, `steam_id`, `winrate_min`, `winrate_max`, `seed`, `build_id`, `build_ids`, `players`, `game_mode`, `ascension`, `ascension_min`, `ascension_max`, `card`, `relic`, `shop`, `today`, `has_replay`, `sort`, `page`, `limit` |
| `GET /api/runs/shared/{hash}`               | Full run data by hash (merges `username` from the DB)                                                                                                                                                                                                                                                                                                                                                                                    | -                                                                                                                                                                                                                                                         |
| `POST /api/runs/{hash}/hidden`              | Hide or unhide a run from its own page (admin bearer token)                                                                                                                                                                                                                                                                                                                                                                              | -                                                                                                                                                                                                                                                         |
| `GET /api/runs/seed-finder`                 | Seeds whose community runs match a combination of predicates (the `/seed-finder` page). `/seed-finder/meta` lists the filter options, `/seed-finder/random` picks one, `/seed-finder/seed/{seed}` is one seed's profile                                                                                                                                                                                                                  | `character`, `deck`, `offered`, `relics`, `events`, `ancient`, `ancient_act`, `neow`, `ancient_offers`, `bosses`, `elites`, `shop`, `build_id`, `players`                                                                                                 |
| `GET /api/runs/{hash}/similar`              | Nearest winning solo decks to this run, and what those winners took that this run didn't                                                                                                                                                                                                                                                                                                                                                 | `lang`                                                                                                                                                                                                                                                    |
| `GET /api/runs/{hash}/replay`               | The stored replay journal (gzip). `POST` uploads one for a run you own, `DELETE` removes it                                                                                                                                                                                                                                                                                                                                              | -                                                                                                                                                                                                                                                         |
| `GET /api/replays`                          | Runs with a replay to watch, same filters and row shape as `/api/runs/list` plus `replay_url`                                                                                                                                                                                                                                                                                                                                            | `character`, `win`, `username`, `seed`, `build_id`, `build_ids`, `players`, `game_mode`, `ascension`, `ascension_min`, `ascension_max`, `card`, `relic`, `shop`, `today`, `sort`, `page`, `limit`                                                         |
| `GET /api/replays/summary`                  | How many replays are watchable, overall and per character                                                                                                                                                                                                                                                                                                                                                                                | -                                                                                                                                                                                                                                                         |
| `GET /api/runs/stats`                       | Aggregated community stats (or one uploader's with `username`)                                                                                                                                                                                                                                                                                                                                                                           | `character`, `win`, `ascension`, `game_mode`, `players`, `username`, `compact`                                                                                                                                                                            |
| `GET /api/runs/pulse`                       | Community run and win totals plus `data_through`                                                                                                                                                                                                                                                                                                                                                                                         | -                                                                                                                                                                                                                                                         |
| `GET /api/runs/snapshot-status`             | Whether the stats are loaded or rebuilding                                                                                                                                                                                                                                                                                                                                                                                               | -                                                                                                                                                                                                                                                         |
| `GET /api/runs/versions`                    | Distinct game versions across submitted runs                                                                                                                                                                                                                                                                                                                                                                                             | -                                                                                                                                                                                                                                                         |
| `GET /api/runs/leaderboard`                 | Ranked wins-only leaderboard. Also returns `total_is_lower_bound`                                                                                                                                                                                                                                                                                                                                                                        | `category` (`fastest`, `highest_ascension`), `character`, `players` (`single`, `multi`, `1`-`4`), `game_mode`, `ascension_min`, `winrate_min`, `build_id`, `today`, `page`, `limit`                                                                       |
| `GET /api/runs/leaderboard/rank/{hash}`     | Rank of a single winning run within its ladder                                                                                                                                                                                                                                                                                                                                                                                           | `category`                                                                                                                                                                                                                                                |
| `GET /api/runs/leaderboard/seed-rank`       | Seed and global standing for one seed (used by the in-game mod)                                                                                                                                                                                                                                                                                                                                                                          | `seed`, `steam_id`                                                                                                                                                                                                                                        |
| `GET /api/leaderboards/elo`                 | Top players by Codex Elo over solo A10 standard runs, refreshed nightly (the `/top-players` page)                                                                                                                                                                                                                                                                                                                                        | `limit`, `min_runs`                                                                                                                                                                                                                                       |
| `GET /api/runs/scores/{type}`               | Codex Score (Bayesian-shrunk win-rate score + S/A/B/C/D/F tier) and Codex Elo per entity                                                                                                                                                                                                                                                                                                                                                 | `type` = `cards`/`relics`/`potions`, `bracket`, `stat_filter`, `character`, `act` (relics), `include_skip` (cards)                                                                                                                                        |
| `GET /api/runs/stats/{type}/{id}`           | Community stats for one entity, with per-bracket and per-character splits                                                                                                                                                                                                                                                                                                                                                                | -                                                                                                                                                                                                                                                         |
| `GET /api/runs/stats/{type}/{id}/history`   | Daily Codex Score and Elo history for one entity                                                                                                                                                                                                                                                                                                                                                                                         | `bracket` (`all`, `a10`, `wr30`, `wr50`, `wr75`)                                                                                                                                                                                                          |
| `GET /api/runs/top/{type}/{character}`      | Most-picked entities of a type for one character                                                                                                                                                                                                                                                                                                                                                                                         | `limit`                                                                                                                                                                                                                                                   |
| `GET /api/runs/metrics/{type}`              | Dense metrics table, one row per entity: Codex Score, `win_rate` with a Wilson 95% `win_rate_ci`, `hold_rate` (picks / `total_seats`), `lift` and `lift_n` (floor-adjusted, null under 20 seats), Codex Elo and `pick_rate` from free choice screens for cards and relics, a `wax` block on relics, `used`/`use_rate` on potions. With `character`, rows carry that character's own Elo and Pick% plus `character_runs`/`character_wins` | `type` = `cards`/`relics`/`potions`, `bracket`, `character`                                                                                                                                                                                               |
| `GET /api/runs/metrics/shops`               | Shop shelf table: `seen`, `bought`, `buy_rate`, and the buyers' `win_rate`, `win_rate_ci`, `lift`                                                                                                                                                                                                                                                                                                                                        | `bracket`                                                                                                                                                                                                                                                 |
| `GET /api/runs/metrics/events`              | Event option table: `chosen`, `share` of that event's choices, `win_rate`, `win_rate_ci`, `lift`                                                                                                                                                                                                                                                                                                                                         | `bracket`                                                                                                                                                                                                                                                 |
| `GET /api/runs/metrics/campfires`           | Rest-site choice table with a localized `name`: `chosen`, `share`, `low_hp_share`, `win_rate`, `win_rate_ci`, `lift`                                                                                                                                                                                                                                                                                                                     | `bracket`, `lang`                                                                                                                                                                                                                                         |
| `GET /api/runs/community-stats`             | Event decision splits, deadliest encounters, totals by ascension and character, records (the `/stats` hub)                                                                                                                                                                                                                                                                                                                               | `bracket`                                                                                                                                                                                                                                                 |
| `GET /api/runs/encounter-stats`             | Per-encounter aggregates (appearances, fatal rate, avg damage/turns), per character too                                                                                                                                                                                                                                                                                                                                                  | `act`, `room_type`, `multiplayer`, `bracket`, `build_id`, `encounter`, `page`, `limit`                                                                                                                                                                    |
| `GET /api/runs/encounter-series`            | The given encounters (max 20) rolled up per bracket and per recent game version                                                                                                                                                                                                                                                                                                                                                          | `encounter`                                                                                                                                                                                                                                               |
| `GET /api/runs/archetypes`                  | Community deck archetypes, clustered nightly                                                                                                                                                                                                                                                                                                                                                                                             | `lang`                                                                                                                                                                                                                                                    |
| `GET /api/runs/encounter-builds`            | Which archetypes die to an encounter and which walk past it                                                                                                                                                                                                                                                                                                                                                                              | `encounter`, `lang`                                                                                                                                                                                                                                       |
| `GET /api/runs/deck-advisor`                | What the winning decks nearest a partial deck carry that it doesn't yet                                                                                                                                                                                                                                                                                                                                                                  | `character`, `cards`, `relics`, `limit`, `lang`                                                                                                                                                                                                           |
| `GET /api/runs/pick-coach`                  | Nearest archetypes for a partial deck and a score per offered card                                                                                                                                                                                                                                                                                                                                                                       | `character`, `cards`, `relics`, `offer`, `target`, `lang`                                                                                                                                                                                                 |
| `GET /api/pairings/{item_type}/{item_id}`   | Cards, relics and potions that show up in the same runs as this item                                                                                                                                                                                                                                                                                                                                                                     | `lang`                                                                                                                                                                                                                                                    |
| `GET /api/draft-recs/{item_type}/{item_id}` | Cards players most often draft when they already hold this item                                                                                                                                                                                                                                                                                                                                                                          | `lang`                                                                                                                                                                                                                                                    |
| `POST /api/draft-advice`                    | Rank offered cards for the current deck                                                                                                                                                                                                                                                                                                                                                                                                  | -                                                                                                                                                                                                                                                         |
| `GET /api/runs/me/picks`                    | The signed-in player's own pick rates (bearer token)                                                                                                                                                                                                                                                                                                                                                                                     | -                                                                                                                                                                                                                                                         |
| `GET /api/players/{username}/insights`      | One player's public insights with community comparison; 404 for unknown or private profiles                                                                                                                                                                                                                                                                                                                                              | `character`, `ascension`, `version`, `players`                                                                                                                                                                                                            |
| `GET /api/players/{username}/stats`         | One player's public stats grids (the `/players/[username]` page)                                                                                                                                                                                                                                                                                                                                                                         | -                                                                                                                                                                                                                                                         |
| `GET /api/players/flair`                    | Supporter flair for a batch of usernames                                                                                                                                                                                                                                                                                                                                                                                                 | `u`                                                                                                                                                                                                                                                       |

**Charts**

| Endpoint                                             | Description                                                                                                                             | Filters                                                                                                                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/charts/meta`                               | The explorer's chart registry: charts, filters, splits, run stats                                                                       | -                                                                                                                                                                          |
| `GET /api/charts/{key}`                              | One pre-aggregated explorer chart, or a saved chart when `key` is a saved chart id (public ones for anyone, private ones for the owner) | `players`, `ascension`, `game_mode`, `username`, `split`, `stat`, `x`, `y`, `encounter`, `event`, `etype`, `entity`, `bracket` (`a10`, `wr30`, `wr50`, `wr75`), `build_id` |
| `POST /api/charts`                                   | Save a chart spec to your profile (bearer token, 100 per account)                                                                       | -                                                                                                                                                                          |
| `PATCH /api/charts/{id}` / `DELETE /api/charts/{id}` | Update or delete your own saved chart                                                                                                   | -                                                                                                                                                                          |
| `GET /api/charts/mine`                               | Your saved charts, newest first (bearer token)                                                                                          | -                                                                                                                                                                          |
| `GET /api/charts/public`                             | Newest public saved charts                                                                                                              | `limit`                                                                                                                                                                    |

**Tier lists, exports, everything else**

| Endpoint                                     | Description                                                                                                                                                                                                                                                                       | Filters                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `POST /api/tierlists` / `GET /api/tierlists` | Save a tier list, or list your own (signed in)                                                                                                                                                                                                                                    | -                                            |
| `GET /api/tierlists/{id}`                    | One of your tier lists; `PATCH` and `DELETE` for the owner                                                                                                                                                                                                                        | -                                            |
| `GET /api/tierlists/shared/{share_id}`       | Public read-only view of a shared tier list                                                                                                                                                                                                                                       | -                                            |
| `GET /api/exports/runs`                      | Bulk run export as gzipped JSONL. With no params it redirects to the daily dump `/exports/runs-latest.jsonl.gz`; `?version=v0.111.0` redirects to that patch's static file `/exports/runs-v0.111.0.jsonl.gz` (or filters a paged pull by `build_id`); its own 120-per-hour budget | `limit`, `start`, `end`, `cursor`, `version` |
| `GET /api/exports/runs/manifest`             | When the daily dump was generated, how many runs it holds, and the per-version files in `versions`                                                                                                                                                                                | -                                            |
| `GET /api/exports/{lang}`                    | ZIP of all entity JSON for one language (10 per hour)                                                                                                                                                                                                                             | -                                            |
| `GET /api/guides`                            | Community guides                                                                                                                                                                                                                                                                  | `category`, `difficulty`, `tag`, `search`    |
| `GET /api/guides/{slug}`                     | Single guide (with markdown content)                                                                                                                                                                                                                                              | -                                            |
| `POST /api/guides`                           | Submit a guide (proxied to Discord)                                                                                                                                                                                                                                               | -                                            |
| `POST /api/feedback`                         | Submit feedback (proxied to Discord)                                                                                                                                                                                                                                              | -                                            |
| `GET /api/presence/active`                   | Live runs from the in-game mod, deepest first                                                                                                                                                                                                                                     | `limit`                                      |
| `GET /api/presence/{steam_id}`               | One player's live run; 404 when they aren't in one                                                                                                                                                                                                                                | -                                            |
| `POST /api/presence`                         | Heartbeat from the in-game mod (bearer token); `{"ended": true}` clears the entry                                                                                                                                                                                                 | -                                            |
| `GET /api/thanks`                            | GitHub contributors, special thanks, and public supporters                                                                                                                                                                                                                        | -                                            |
| `GET /api/mod/latest`                        | Latest mod build and the game version it was verified against                                                                                                                                                                                                                     | -                                            |
| `GET /api/rate-limits`                       | The public rate-limit tiers                                                                                                                                                                                                                                                       | -                                            |
| `GET /health`                                | Liveness check                                                                                                                                                                                                                                                                    | -                                            |

**User accounts** (cookie/JWT session; sign in with Steam or Discord, then link Discord, Twitch and Patreon to the account). These are first-party routes for the site, the overlay and the in-game mod, hidden from `/docs`:

| Endpoint                                                                                                                 | Description                                                              |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `GET /api/auth/me`                                                                                                       | Current signed-in user                                                   |
| `GET /api/auth/steam/redirect`                                                                                           | Start Steam OpenID sign-in                                               |
| `POST /api/auth/steam/start` / `GET /api/auth/steam/callback` / `GET /api/auth/steam/poll/{session_id}`                  | Popup Steam sign-in: open a session, finish it, poll for the result      |
| `POST /api/auth/steam/ticket`                                                                                            | Exchange a Steamworks web auth ticket for the site JWT (in-game sign-in) |
| `POST /api/auth/refresh`                                                                                                 | Swap a valid token for a fresh one                                       |
| `POST /api/auth/set-cookie`                                                                                              | Set the session cookie from a bearer token                               |
| `GET /api/auth/discord/start` / `GET /api/auth/discord/callback`                                                         | Discord OAuth                                                            |
| `GET /api/auth/twitch/start` / `GET /api/auth/twitch/callback`                                                           | Link a Twitch login (powers the Watch on Twitch link on live runs)       |
| `GET /api/auth/patreon/start` / `GET /api/auth/patreon/callback` / `POST /api/auth/patreon/webhook`                      | Link Patreon for supporter perks; the webhook keeps membership current   |
| `POST /api/auth/{steam,discord,twitch,patreon}/disconnect`                                                               | Unlink a provider                                                        |
| `POST /api/auth/overwolf/link` / `DELETE /api/auth/overwolf`                                                             | Link or unlink an Overwolf subscription                                  |
| `POST /api/auth/logout`                                                                                                  | Clear the session cookie                                                 |
| `GET /api/auth/username/check`                                                                                           | Is a username free                                                       |
| `PATCH /api/auth/username` / `PATCH /api/auth/email`                                                                     | Update profile fields                                                    |
| `PATCH /api/auth/profile-privacy` / `PATCH /api/auth/theme` / `PATCH /api/auth/thanks-listing`                           | Profile visibility, supporter theme, Thank You listing                   |
| `GET /api/auth/runs` / `POST /api/auth/runs/upload` / `DELETE /api/auth/runs/{hash}` / `POST /api/auth/runs/bulk-delete` | List, upload, and remove the user's runs                                 |
| `GET /api/auth/stats`                                                                                                    | Per-user aggregated stats (profile page)                                 |
| `GET /api/auth/insights`                                                                                                 | The user's own insights with community comparison                        |
| `GET /api/auth/personal-bests`                                                                                           | Fastest solo/co-op, highest ascension, today's and all-time daily        |
| `GET /api/auth/competitive`                                                                                              | Today's daily leaderboard, global ranks, win rate vs community           |
| `GET /api/keys` / `POST /api/keys` / `DELETE /api/keys/{id}`                                                             | Your API keys                                                            |

A few more routers are mounted but kept out of `/docs` on purpose: the admin console under `/api/admin` (plus `/api/admin/{keys,news,rate-limits,replays,searches,thanks}`), the feedback forms (`/api/feedback`, `/api/feedback/run-report`, `/api/qa-feedback`, `/api/uninstall-feedback`), the companion telemetry ping (`/api/telemetry`), the search log, and the Ko-fi webhook. `/metrics` serves Prometheus metrics and is protected by `METRICS_TOKEN` when that is set.

Rate limits count per endpoint: un-keyed traffic gets **300 requests per minute** per IP on each route by default, and an `X-API-Key` header switches to that key's tier (`GET /api/rate-limits` has the live numbers). A few routes carry their own tighter caps, like the run export and the language ZIP. Feedback and guide submission are limited to **3-5 per minute** per IP. Interactive docs at `/docs` (Swagger UI).

### Localization

All game data is served in 15 languages using Slay the Spire 2's own localization files. Pass `?lang=` to any data endpoint. Use `?channel=beta` for the active public beta data. Image dumps are picked by version in the path (`/api/images/game/{version}/...`).

| Code  | Language     | Code  | Language       |
| ----- | ------------ | ----- | -------------- |
| `eng` | English      | `kor` | 한국어         |
| `deu` | Deutsch      | `pol` | Polski         |
| `esp` | Español (ES) | `ptb` | Português (BR) |
| `fra` | Français     | `rus` | Русский        |
| `ita` | Italiano     | `spa` | Español (LA)   |
| `jpn` | 日本語       | `tha` | ไทย            |
| `tur` | Türkçe       | `zhs` | 简体中文       |
| `zht` | 繁體中文     |       |                |

**What's localized**: Game-sourced entity names and descriptions, card types, rarities, keywords, powers, encounters, character names, section titles, localized routes, and most shared UI labels.

**What stays English**: API identifiers and structural filter values such as `room_type`, power `type`/`stack_type`, and `pool`, plus product branding and some editorial or community-authored content.

Filter parameters (`type=Attack`, `rarity=Rare`, `keyword=Exhaust`) always use English values regardless of language - the backend translates them to the localized equivalents before matching.

Example: `GET /api/cards?lang=kor&type=Attack` returns Korean card data where type is "공격", filtered correctly even though the parameter is English.

### Rich Text Formatting

Text fields (`description`, `loss_text`, `flavor`, dialogue `text`, option `title`/`description`) may contain Godot BBCode-style tags preserved from the game's localization data:

| Tag                    | Type        | Example                           | Rendered as              |
| ---------------------- | ----------- | --------------------------------- | ------------------------ |
| `[gold]...[/gold]`     | Color       | `[gold]Enchant[/gold]`            | Gold colored text        |
| `[red]...[/red]`       | Color       | `[red]blood[/red]`                | Red colored text         |
| `[blue]...[/blue]`     | Color       | `[blue]2[/blue]`                  | Blue colored text        |
| `[green]...[/green]`   | Color       | `[green]healed[/green]`           | Green colored text       |
| `[purple]...[/purple]` | Color       | `[purple]Sharp[/purple]`          | Purple colored text      |
| `[orange]...[/orange]` | Color       | `[orange]hulking figure[/orange]` | Orange colored text      |
| `[pink]...[/pink]`     | Color       | -                                 | Pink colored text        |
| `[aqua]...[/aqua]`     | Color       | `[aqua]Ascending Spirit[/aqua]`   | Cyan colored text        |
| `[sine]...[/sine]`     | Effect      | `[sine]swirling vortex[/sine]`    | Wavy animated text       |
| `[jitter]...[/jitter]` | Effect      | `[jitter]CLANG![/jitter]`         | Shaking animated text    |
| `[b]...[/b]`           | Effect      | `[b]bold text[/b]`                | Bold text                |
| `[i]...[/i]`           | Effect      | `[i]whispers[/i]`                 | Italic text              |
| `[energy:N]`           | Icon        | `[energy:2]`                      | Energy icon(s)           |
| `[star:N]`             | Icon        | `[star:1]`                        | Star icon(s)             |
| `[Card]`, `[Relic]`    | Placeholder | `[Card]`                          | Runtime-dynamic (italic) |

Tags can be nested: `[b][jitter]CLANG![/jitter][/b]`, `[gold][sine]swirling vortex[/sine][/gold]`.

If you're consuming the API directly, you can strip these with a regex like `\[/?[a-z]+(?::\d+)?\]` or render them in your own frontend. The `description_raw` field (where available) contains the unresolved SmartFormat template.

## Running Locally

### Prerequisites

- Python 3.12 (what the Dockerfile and CI use)
- Node.js 26+

### Backend

```bash
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip3 install -r backend/requirements.txt

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

Starts backend (8000), redis, and frontend (3000).

### Tests and lint

CI runs the same checks, so run them before a PR:

```bash
cd frontend
npm run lint            # ESLint (React Compiler rules included)
npm run format:check    # Prettier
npm test                # vitest

cd backend
pip install -r requirements-dev.txt
pytest
ruff check app/
ruff format --check app/
```

### Environment variables

The core read-only API needs no configuration. Everything below is optional
and read from the backend's environment (or the compose file). Each variable
is listed with where it is read.

**Core**

| Variable                                   | Purpose                                                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `MONGO_URL`                                | Runs database (community stats, leaderboards, accounts). Unset falls back to SQLite at `DATA_DIR/runs.db`.      |
| `REDIS_URL`                                | Application cache (`services/cache.py`). Unset means every cache call no-ops.                                   |
| `RATE_LIMIT_REDIS_URL`                     | Shared rate-limit counters across workers (`rate_limit_config.py`).                                             |
| `DATA_DIR`, `BETA_DATA_DIR`, `STATIC_DIR`  | Where the parsed JSON, the beta data tree, and the static assets live.                                          |
| `EXTRACTION_DIR`                           | Parser input override (`parser_paths.py`), used for beta parses.                                                |
| `CORS_ORIGINS`                             | Comma-separated allowed origins.                                                                                 |
| `PUBLIC_SITE_BASE`, `SPIRE_CODEX_PUBLIC_BASE`, `FRONTEND_URL` | Public site base for share URLs and OAuth return URLs.                                       |
| `ENVIRONMENT`                              | `production` turns on secure cookies (`auth_jwt.py`).                                                           |
| `LOG_LEVEL`, `MAX_REQUEST_BODY_BYTES`, `GIT_SHA` | Logging level, request body cap (default 64 MB), and the build SHA reported by `/health`.                  |
| `DISABLE_RUN_SUBMISSIONS`                  | `1` makes the instance read-only for runs.                                                                      |

**Auth and accounts**

| Variable                                                  | Purpose                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `JWT_SECRET`                                              | Signs session tokens.                                                                |
| `PLAYER_TOKEN_SECRET`                                     | Signs player tokens for the mod (`player_token.py`); falls back to `JWT_SECRET`.     |
| `ADMIN_IDS`                                               | Comma-separated user ids with admin access.                                          |
| `STEAM_WEB_API_KEY`                                       | Verifies Steamworks auth tickets (`auth_steam.py`).                                  |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`              | Discord OAuth.                                                                       |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`                | Twitch linking and the live-stream check (`twitch_live.py`).                         |
| `PATREON_CLIENT_ID`, `PATREON_CLIENT_SECRET`, `PATREON_WEBHOOK_SECRET` | Patreon linking and membership webhook.                                 |
| `OVERWOLF_STORE_ID`, `OVERWOLF_EXTENSION_ID`, `OVERWOLF_GRACE_DAYS` | Overwolf subscription verification (`supporters.py`).                      |
| `KOFI_VERIFICATION_TOKEN`, `KOFI_MONTHLY_GRACE_DAYS`      | Ko-fi webhook and how long a monthly supporter stays active.                         |
| `SUPPORTER_EMAIL_SALT`                                    | Hashes supporter emails; falls back to `JWT_SECRET`.                                 |

**Storage and CDN**

| Variable                                                                                  | Purpose                                                           |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL` | R2 uploads for tier-list preview images (`r2_storage.py`).      |
| `CDN_BASE_URL`, `GAME_CDN_BASE`                                                           | CDN base for parser image URLs and the `/images` gallery.         |
| `CF_TOKEN`, `CF_ZONE`, `CF_ACCOUNT_ID`                                                    | Cloudflare cache purge from the admin console; Workers AI account.|
| `SEARCH_INDEX_DIR`, `VECTORS_DIR`, `LAKE_DIR`, `LAKE_CACHE_DIR`, `QA_DIR`                 | On-disk locations for the search index, run vectors, lake, and QA fixtures. |

**Observability**

| Variable                                                | Purpose                                                               |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| `SENTRY_DSN`, `SENTRY_ENV`                              | Sentry error reporting.                                               |
| `METRICS_TOKEN`, `PROMETHEUS_MULTIPROC_DIR`             | Bearer token for `/metrics`; shared dir for multi-worker counters.    |
| `UMAMI_URL`, `UMAMI_USERNAME`, `UMAMI_PASSWORD`, `UMAMI_WEBSITE_ID` | Admin analytics panel reads from Umami.                   |
| `TELEMETRY_SALT`                                        | Hashes companion telemetry ids.                                       |

**Integrations**

| Variable                                                                 | Purpose                                                          |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `FEEDBACK_WEBHOOK_URL`, `GUIDE_WEBHOOK_URL`                              | Discord webhooks for feedback and guide submissions.             |
| `RESEND_API_KEY`, `UNINSTALL_FORWARD_TO`                                 | Email forwarding for uninstall feedback.                         |
| `GITHUB_TOKEN`, `THANKS_GITHUB_REPOS`, `THANKS_GITHUB_EXCLUDE`           | Contributor list on the Thank You page.                          |
| `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_REPO`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_PRIVATE_KEY_PATH` | GitHub App that files issues from reports. |
| `WORKERS_AI_TOKEN`                                                       | Semantic search embeddings (with `CF_ACCOUNT_ID`).               |
| `MOD_LATEST_VERSION`, `MOD_DOWNLOAD_URL`, `MOD_STS2_TESTED`              | What `/api/mod/latest` reports.                                  |
| `MENTIONS_POLLER`, `MENTIONS_WEBHOOK_URL`, `MENTIONS_INGEST_TOKEN`       | Mentions inbox poller toggle, Discord alert webhook, and the token bots use to push Discord messages. |
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`          | Reddit app-only OAuth for the mentions poller.                   |
| `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD`                                 | Bluesky login for live post search.                              |
| `YOUTUBE_API_KEY`                                                        | YouTube data search over video titles and descriptions.          |

**Stats and lake tuning**

| Family                                                    | Purpose                                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `LAKE_BUILD_MEMORY`, `LAKE_DEEP_TABLES`, `FRAME_FROM_LAKE` | DuckDB memory cap, optional deep tables, and building the chart frame from the lake. |
| `STATS_REFRESHER`, `STATS_SUMMARY_INTERVAL_SECONDS`       | Background stats refresher and its interval.                                  |
| `CHART_PREWARM_INTERVAL_SECONDS`, `CHART_PREWARM_BUDGET_S` | Chart pre-warm cadence and time budget.                                      |
| `RUN_VECTORS`, `RUN_VECTORS_INTERVAL_SECONDS`             | Nightly run-vector rebuild (similar runs, deck advisor).                      |
| `ENTITY_STATS_REBUILD_WORKERS`, `ENTITY_STATS_RECENT_VERSIONS_N` | Parallel entity-stats rebuild and how many versions it keeps.          |
| `REPLAY_DB_NAME`, `REPLAY_MAX_GZ_BYTES`, `REPLAY_MAX_RAW_BYTES`, `REPLAY_MAX_LINES` | Replay storage and upload limits.                   |
| `LIVE_OVERLAY`, `RUN_BLOBS_STARTUP_BACKFILL`, `COMMUNITY_ANCIENT_MIN_OFFERS` | Hot-counter overlay, startup blob backfill, Ancient sample floor. |
| `SIM_CLI_PATH`, `SIM_DATA_ROOT`                           | Seed profile simulator binary and data.                                       |
| `INTERNAL_RATE_LIMIT`                                     | Rate limit for first-party traffic (default `6000/minute`).                   |

**Frontend**

| Variable                        | Purpose                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`           | Build-time API base; empty in prod so images/data resolve same-origin.             |
| `API_INTERNAL_URL`              | Server-side fetch base (falls back to `NEXT_PUBLIC_API_URL`, then localhost:8000). |
| `NEXT_PUBLIC_CDN_URL`           | When set (e.g. `https://cdn.spire-codex.com`), images load from the CDN.           |
| `NEXT_PUBLIC_SITE_URL`          | Canonical site URL for metadata.                                                   |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID`  | Build-time Umami property id.                                                      |

User accounts, Redis, and the CDN are off by default, so the project runs end-to-end
without any of these.

## Update Pipeline

A cross-platform Python script handles the full update workflow when a new game version is released:

```bash
# Full pipeline - extract game files, parse data, render sprites, copy images:
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
| Data parsing | Python 3.12 | Built-in |
| Image copying | Python 3.12 | Built-in |
| Spine rendering | Node.js 26+ | [nodejs.org](https://nodejs.org) |

### Manual Steps

If you prefer to run steps individually:

```bash
# Parse all data (all 15 languages)
cd backend/app/parsers && python3 parse_all.py

# Parse a single language
cd backend/app/parsers && python3 parse_all.py --lang eng

# Copy images from extraction to static (PNG + WebP from same source - no
# lossy chain through an existing backend WebP). WebP at quality=95, method=6.
python3 backend/scripts/copy_images.py

# Render Spine sprites (WebGL - no triangle seam artifacts)
cd tools/spine-renderer && npm install
npx playwright install chromium           # First time only
node render_all_webgl.mjs                 # All 138 skeletons via headless Chrome
node render_webgl.mjs <skel_dir> <out> [size] [--skin=a,b] [--anim=name] [--anim-time=N]

# Common per-monster overrides:
#   --skin=moss1,diamondeye   combine variant skins with default (cubex_construct)
#   --skin=skin1              swap default for a variant (scroll_of_biting)
#   --anim-time=0.5           advance animation N seconds before snapshot
#   --anim=attack             override the auto-picked idle animation
#
# Smoke-placeholder substitution: gas_bomb_2.png, the_forgotten_2.png, and
# living_smog_2.png ship as magenta "Smoke Placeholder" boards in the source.
# render_webgl.mjs swaps them for a procedurally generated dark plum cloud
# at the same dimensions before GL upload, then forces slot.color.a = 1.0
# on substituted slots (the artists set low alpha expecting a shader).

# Re-frame undersized monster sprites (post-process - crops to true alpha
# bbox, scales to fill ~92% of the 512x512 frame):
python3 tools/rescale_bestiary.py fuzzy_wurm_crawler thieving_hopper terror_eel

# Legacy canvas renderer (has triangle seam artifacts - avoid)
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

| Field                                | Description                                                                                                                                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app_id`                             | Steam App ID (2868840)                                                                                                                                                                                           |
| `game_version`                       | Steam game version (e.g. `"0.98.2"`)                                                                                                                                                                             |
| `build_id`                           | Steam build ID                                                                                                                                                                                                   |
| `tag`                                | Unique version key (e.g. `"1.0.3"`)                                                                                                                                                                              |
| `date`                               | Date of the update                                                                                                                                                                                               |
| `title`                              | Human-readable title                                                                                                                                                                                             |
| `summary`                            | Counts: `{ added, removed, changed }`                                                                                                                                                                            |
| `features` / `fixes` / `api_changes` | Hand-curated release notes. Preserved through `diff_data.py` regenerations of an existing tag - the data diff is overwritten but these arrays merge through.                                                     |
| `categories`                         | Per-category diffs with added/removed/changed entities. Field changes recurse into nested dicts/lists so each leaf is its own row (e.g. `vars.DamageVar: 8 → 10`) instead of opaque `vars: 2 fields → 2 fields`. |

### Write-once retention

Files under `data/changelogs/` are write-once historical records. `.github/workflows/changelog-guard.yml` blocks any PR that **modifies or deletes** an existing changelog. New files (`A`) are always allowed; modifications require the `changelog-edit-approved` label on the PR. See `CONTRIBUTING.md → Changelog Retention` for the policy and override workflow.

### Per-entity history

`GET /api/history/{entity_type}/{entity_id}` walks every changelog and returns the entries that touched the requested entity, newest first. The Version History rail on every detail page (`/cards/{id}`, `/monsters/{id}`, etc.) is powered by this endpoint.

## Deploying

### CI/CD (GitHub Actions)

Pushes to `main` trigger `.github/workflows/ci.yml` on the self-hosted runner (pull requests run on `ubuntu-latest`). The workflow runs secret scanning, ESLint, TypeScript and Prettier checks, ruff lint and format checks, and pytest, then builds and pushes the backend and frontend images to Docker Hub as `:latest` and `:<git sha>`. Data-only pushes (`data/`, `data-beta/`) skip lint and the image build since those trees are bind-mounted on the box. There is one channel: the beta site is served by the same containers at `/beta`, so there are no `:beta` images.

CI does **not** deploy. Releases are manual (see Production).

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

Everything runs on one DigitalOcean droplet: the backend and frontend containers from `docker-compose.prod.yml`, Redis in the same compose file, nginx, and MongoDB installed by the `mongo-install` playbook (`docker-compose.mongo.yml`, a single-node replica set). Public traffic uses `spire-codex.com`.

**Release** - nothing reaches prod until someone runs it on the box:

```bash
cd /var/www/spire-codex
./tools/startup.sh release    # pull :latest, recreate backend + frontend, wait for health, reload nginx
./tools/startup.sh rollback   # put the :previous images back, no git or CI involved
```

`startup.sh` wraps `/usr/local/bin/spire-codex-autodeploy` (installed from `infrastructure/ansible/files/autodeploy.sh` by the `install-autodeploy` playbook). Every deploy tags the images it replaces as `:previous`, so a rollback takes about 30 seconds. The old hourly cron is gone; the playbook removes it. Code deploys do not purge Cloudflare; news-only commits purge just the news URLs. Logs land in `/var/log/spire-codex-autodeploy.log`.

**Ansible** - the playbooks in `infrastructure/ansible/` cover deploy, rollback, restart, verify, secrets sync, Mongo install and backups, monitoring and Umami install, and disk cleanup. The wrapper pulls the SSH key from 1Password for one run and wipes it after:

```bash
cd infrastructure/ansible
./bin/op-ansible playbooks/deploy.yml
```

See [`infrastructure/ansible/README.md`](infrastructure/ansible/README.md) for the full playbook list.

**Lake ingest** - the analytics lake is rebuilt by `lab/ingest.py` running as the `lake-ingest` service (compose profile `ops`), kicked by a host cron rather than `up -d`. It takes a lock so overlapping runs exit early.

Production data is bind-mounted (`./data:/data:ro` for the frontend and read-write for the backend). News and run state are read from the mounted data at request time, so `data/news/*.json` updates do not require a container restart.

### Beta Channel (spire-codex.com/beta)

The site serves main and Steam `public-beta` data as two content channels from the same containers. Beta pages live at [`spire-codex.com/beta`](https://spire-codex.com/beta), with localized routes at `/{lang}/beta/...`. The main `/images` page also exposes the archived beta asset versions.

`beta.spire-codex.com` is retired. Cloudflare redirects it to the same path on the apex domain, which lands on the main channel. API clients pass the channel explicitly, for example `https://spire-codex.com/api/cards?channel=beta`.

**Architecture**: `get_channel` resolves `?channel=beta|stable` into a Python `ContextVar`. `data_service.py` loads beta requests from `data-beta/<latest>/` and falls back to main per file. `GET /api/beta/diff` and `GET /api/beta/version` describe the active beta, and the frontend renders the selected channel under `/beta`.

**Data layout**: each archived build lives under `data-beta/<version>/`, and the `latest` pointer selects the active build. Each version has its own `changelogs/` directory.

**Automated ingest** - `tools/beta-watch/` runs as a launchd job on the development Mac on Thursdays from 15:00 to 22:45, every 15 minutes. When SteamCMD reports a new `public-beta` build ID, it extracts and decompiles the game, parses every language, generates the diff, syncs versioned images, and opens an `auto/beta-<version>` PR. See [`tools/beta-watch/README.md`](tools/beta-watch/README.md) for installation and operations.

**Manual ingest**:

```bash
VERSION=vX.Y.Z
PREVIOUS=vA.B.C

# Extract and decompile the beta game files first, then parse from the repo root.
(cd backend/app/parsers && \
  EXTRACTION_DIR=../../../extraction/beta \
  DATA_DIR="../../../data-beta/$VERSION" \
  python3 parse_all.py)

VERSION="$VERSION" tools/beta-watch/sync-images.sh

python3 tools/diff_data.py "data-beta/$PREVIOUS/eng" "data-beta/$VERSION/eng" \
  --format json --output-dir "data-beta/$VERSION/changelogs" \
  --game-version "${VERSION#v}" --title "Beta ${VERSION#v}"
```

`sync-images.sh` updates the `latest` image symlink. The ingest PR carries the versioned data and image changes; after merge, the data arrives on the box with the next release's `git pull`.

## Spine Renderer

Monster sprites in StS2 are [Spine](http://esotericsoftware.com/) skeletal animations - each monster is a `.skel` (binary skeleton) + `.atlas` + `.png` spritesheet, not a single image. The renderer assembles these into static portrait PNGs.

### WebGL Renderer (Current)

The WebGL renderer (`render_webgl.mjs`, `render_all_webgl.mjs`) uses **Playwright + spine-webgl** to render skeletons via headless Chrome's GPU. This produces clean renders with **no triangle seam artifacts**.

**How it works:**

1. Launches headless Chrome via Playwright with WebGL enabled
2. Loads skeleton data + atlas + textures as base64 into the browser page
3. Creates a WebGL canvas, sets up spine-webgl shader + polygon batcher
4. Applies the idle animation, calculates bounds (excluding shadow/ground slots)
5. Renders via GPU triangle rasterization - no canvas clip paths, no seams
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

| Category         | Rendered | Total    | Notes                                                            |
| ---------------- | -------- | -------- | ---------------------------------------------------------------- |
| Monsters         | 99       | 103 dirs | All 111 game monsters have images (99 rendered + aliases/static) |
| Characters       | 16       | 16       | Combat, rest site, and select poses                              |
| Backgrounds/NPCs | 14       | 17       | Neow, Tezcatara, merchant rooms, main menu                       |
| VFX/UI           | 9        | 22       | Most VFX need specific animation frames                          |
| **Total**        | **138**  | **158**  | 20 skipped (no atlas, VFX-only, blank)                           |

### Animation Renderer

The animation renderer (`render_gif.mjs`) renders Spine idle/attack animations as animated WebP, GIF, or APNG. Supports skin variants, animation selection, and streaming frame-to-disk for large animations.

**Supported output formats:**

- **`.webp`** (recommended) - lossless animated WebP with full alpha, ~33% smaller than APNG. Frames streamed to disk to avoid OOM.
- **`.gif`** - 256 colors, binary transparency. Smallest files but lowest quality.
- **`.apng`** - full alpha like WebP but larger files.

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

- `@esotericsoftware/spine-webgl` ^4.2.107 - Spine runtime for WebGL (current)
- `playwright` - Headless Chrome for WebGL rendering
- `gif-encoder-2` - GIF encoding for animation renderer
- `canvas` ^3.1.0 - Node.js Canvas implementation (frame buffer for animation renderer)
- `Pillow` (Python) - assembles WebP/APNG from rendered PNG frames
- `@esotericsoftware/spine-canvas` ^4.2.106 - Spine runtime for Canvas (legacy)

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

| Segment | Meaning                                                  |
| ------- | -------------------------------------------------------- |
| **1**   | Spire Codex major version (stays unless a full rewrite)  |
| **X**   | Bumps when Mega Crit releases a game patch               |
| **Y**   | Bumps for our own parser/frontend fixes and improvements |

Examples: `v1.0.0` = initial release, `v1.0.1` = our bug fixes, `v1.1.0` = first Mega Crit patch incorporated.

## SEO

- **Structured data (JSON-LD)**: WebSite + VideoGame (home), CollectionPage + ItemList (list pages), Article + BreadcrumbList + FAQPage (detail pages), SoftwareApplication (developers), NewsArticle (news/[gid])
- **Title format**: `"Slay the Spire 2 (sts2) {Page Title} | Spire Codex"` - standardized across all pages. Runs use `"{username} - {char} - Ascension {N} {win/loss} - Slay the Spire 2 (sts2) | Spire Codex"`. "(sts2)" inline so cross-locale `sts2 tier list` / `sts2 card list` queries match.
- **Sitemap**: Flat XML at `/sitemap.xml` with `force-dynamic` (renders server-side, not build-time). ~20,000+ URLs including entity detail pages, browse matrix pages, tier-list pages, scoring methodology, runs/[hash] detail, and i18n mirrors for all entity types
- **International SEO**: `/{lang}/` routes for all 15 languages (eng at the root plus 14 prefixes) with **bidirectional** hreflang alternates - English root pages also emit alternates for every locale + `x-default` via `buildLanguageAlternates(path)` in `lib/seo.ts` (fixes the GSC "Crawled - not indexed" duplicate-content cluster where Google was treating localized pages as duplicates without back-references)
- **Programmatic SEO**: 41 card browse pages at `/cards/browse/` (rare-attacks, ironclad-skills, etc.) + 3 tier-list pages (`/tier-list/{cards,relics,potions}`)
- **Locale-aware EntityProse**: Detail pages render a short locale-specific paragraph instead of identical English bodies in every locale
- **Internal linking**: Powers ↔ cards, encounters → monsters, card keywords → keyword hub pages, monster moves → power pages (with tooltips), act pages → encounters/events, tier-list rows → entity detail Stats tab
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
- ~~Multi-language support (15 languages)~~ ✅
- ~~SEO (JSON-LD, OG/Twitter, sitemap, hreflang)~~ ✅
- ~~Tooltip widget (all 13 entity types)~~ ✅
- ~~Character comparison pages (10 pairs)~~ ✅
- ~~Keyword hub pages~~ ✅
- ~~Merchant guide (pricing from decompiled C#)~~ ✅
- ~~Developer docs + data exports~~ ✅
- ~~International SEO (15 languages)~~ ✅
- ~~Card browse matrix (41 programmatic SEO pages)~~ ✅
- ~~Community guides~~ ✅ - Markdown with YAML frontmatter, submission form, tooltip widget, author socials
- ~~Game mechanics page~~ ✅ - 27 individual SEO pages: drop rates, combat, map, bosses, secrets & trivia
- ~~Community runs~~ ✅ - Run submission, browser, shared runs, live stats
- ~~Card upgrade descriptions~~ ✅ - upgrade_description for all 403 upgradable cards
- ~~Monster innate powers~~ ✅ - 42 monsters with powers from AfterAddedToRoom
- ~~Achievement unlock conditions~~ ✅ - Category, character, threshold from C# source
- ~~Monster attack patterns~~ ✅ - 112 monsters with cycle/random/conditional/mixed AI from C# state machines
- ~~Event preconditions~~ ✅ - 25 events with IsAllowed() conditions parsed from C# source
- ~~Beta archive retention~~ ✅ - Versioned beta data and images remain preserved; `/beta` serves the active build and `/images` browses archived assets
- ~~Discord bot~~ ✅ - [Knowledge Demon](https://bot.spire-codex.com): slash commands for every entity (`/card`, `/relic`, `/monster`, `/potion`, `/character`, `/event`, `/power`, `/enchantment`, `/lookup`, `/meta`), Steam-news RSS, plus a full moderation toolkit forked from [Kernel](https://github.com/ptrlrd/kernel)
- ~~Codex Score & Tier List~~ ✅ - Per-entity grade computed from community runs using **Bayesian shrinkage**: `shrunk = (wins + PRIOR_WEIGHT × baseline) / (n + PRIOR_WEIGHT)`, then scaled to 0–100 and mapped to S/A/B/C/D/F. Prevents tiny-sample noise (a 1-game card going 1/1 doesn't get an S - it regresses to the prior). Pre-warmed on backend startup. Surfaced as `ScoreBadge` on detail-page Stats tab, dedicated tier-list pages, and methodology page at `/stats/scoring`.
- ~~Detail-page Stats tab~~ ✅ - Score hero badge + prose summary + recent runs links via `EntityRunStats`.
- ~~Deck builder~~ ✅ - `/deck-builder` with suggestions from the nearest winning decks (`/api/runs/deck-advisor`, `/api/runs/pick-coach`)
- ~~Tier list maker~~ ✅ - Saved, editable tier lists with public share links and R2 preview images
- ~~Replays~~ ✅ - Replay journals from the in-game mod, browsed at `/replays` and played back at `/runs/[hash]/replay`
- ~~Seed finder~~ ✅ - Search community runs by seed content, plus a per-seed profile page
- ~~Live presence and overlay~~ ✅ - `/live` roster from mod heartbeats, per-player live view, Overwolf overlay
- ~~Overwolf link~~ ✅ - Link an Overwolf subscription for supporter perks
- ~~Archetypes~~ ✅ - Nightly clustered deck archetypes at `/archetypes`, used by the encounter-builds and pick-coach endpoints
- ~~Players~~ ✅ - Public player profiles at `/players/[username]` and the Codex Elo board at `/top-players`
- ~~Beta channel~~ ✅ - `/beta` on the main site, `?channel=beta` on the API
- ~~API keys~~ ✅ - Per-key rate-limit tiers, managed from Settings
- **Database backend** - Game data still loads from per-language JSON. Runs live in MongoDB and the stats come from a DuckDB parquet lake rebuilt by `lab/ingest.py`.

## Acknowledgments

Thanks to **vesper-arch**, **terracubist**, **U77654**, **Purple Aspired Dreaming**, **Kobaru**, and **Severi** for QA testing, bug reports, and contributions. The full supporter list - including Ko-fi donors who keep the lights on - lives at [spire-codex.com/thank-you](https://spire-codex.com/thank-you).

## Tech Stack

- **Backend**: Python 3.12, FastAPI, Pydantic, slowapi, GZip compression, numpy/scipy for the stats math
- **Runs database**: MongoDB (runs, leaderboards, user accounts), with a materialized `stats_summary` collection and a leader-elected background refresher. Legacy SQLite path kept as an offline fallback.
- **Analytics lake**: DuckDB + pyarrow parquet lake built in `lab/`, read by the backend for stats, boards and charts
- **Cache**: Redis (response cache and shared rate-limit counters), fail-safe when absent
- **Search**: embedded tantivy index over every entity, page, guide and image in all 15 languages
- **Accounts**: Steam OpenID sign-in, Discord/Twitch/Patreon OAuth linking, Overwolf and Ko-fi supporter checks, JWT session cookies
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, next-intl, 15 languages
- **Images/CDN**: Cloudflare R2 (boto3) served via `cdn.spire-codex.com` (webp)
- **Analytics & observability**: Sentry (backend and frontend), Prometheus metrics at `/metrics`, Grafana Alloy shipping logs and cadvisor/host metrics, node-exporter, self-hosted Umami
- **Spine Renderer**: Node.js, Playwright, @esotericsoftware/spine-webgl (WebGL via headless Chrome)
- **Infrastructure**: Docker Compose on one DigitalOcean droplet, GitHub Actions CI (self-hosted runner) with registry-backed BuildKit cache, Ansible playbooks, manual releases with `tools/startup.sh`
- **Tools**: Python (update pipeline, changelog diffing, image copying)

## License

- **Source code**: [PolyForm Noncommercial 1.0.0](LICENSE.md) - free to use, modify, and redistribute for noncommercial purposes. Selling the software is not permitted.
- **Hosted API**: [API_TERMS.md](API_TERMS.md) - free for any use within the published rate limits; reach out on Discord or in an issue if you need more.
- **Game data** (cards, relics, monsters, etc.): © Mega Crit Games. Served here as a community reference under fair-use / educational terms. Do not use this data to recompile, repackage, or redistribute the game.

Contributions are accepted under the same PolyForm Noncommercial 1.0.0 terms - see [CONTRIBUTING.md](CONTRIBUTING.md#license).
