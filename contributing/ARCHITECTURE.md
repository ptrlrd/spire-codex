# Architecture

## Overview

Spire Codex extracts game data from Slay the Spire 2 (Godot 4 / C#/.NET 8) and serves it through a FastAPI backend + Next.js frontend.

## Data Pipeline

1. **PCK Extraction** - GDRE Tools extracts the Godot `.pck` file → images, Spine animations, localization (~9,947 files)
2. **DLL Decompilation** - ILSpy decompiles `sts2.dll` → ~3,300 C# source files
3. **Data Parsing** - Python regex parsers extract structured data from C# + localization JSON → per-language JSON in `data/{lang}/`
4. **Spine Rendering** - Headless Node.js renderer (Playwright + spine-webgl) → 512×512 monster/character PNGs
5. **API + Frontend** - FastAPI serves parsed JSON, Next.js consumes it

## Key Discovery

The game is built with Godot 4 but all logic is in a C#/.NET 8 DLL, not GDScript. Only 48 GDScript files exist (VFX testers).

## Backend (`backend/`)

- **FastAPI** with Pydantic schemas, slowapi rate limiting, GZip compression
- **~65 routers** in `app/routers/` (68 `include_router` lines in `main.py`): one per entity type + guides, runs, search, leaderboards, players, presence, replays, charts, tier lists, API keys, auth connectors, feedback, news, merchant, admin
- **Data service** loads stable JSON from `data/{lang}/` and active beta JSON from `data-beta/<latest>/{lang}/` with LRU caching. `get_channel` resolves `?channel=beta|stable` into a request-local `ContextVar`, and beta files fall back to stable when absent.
- **MongoDB** (self-hosted single-node replica set on the DB origin) for community run submissions, users, saved charts and tier lists. SQLite (`data/runs.db`) is kept as the offline-fallback codepath in `services/runs_db.py` when `MONGO_URL` is unset.
- **DuckDB lake** (`app/services/lake_stats.py`, built by `lab/`): every analytics surface serves from here: the community payload and cube, the entity store and cube, encounter stats, deep item tables, charts, the leaderboard boards and the frame. The lake is mounted at `LAKE_DIR` (default `/lake`), built by the ingest box's cycle and delivered by the artifact bus. Serving reads stored artifacts; only builders touch parquet. The Mongo `stats_summary` docs that `/api/runs/stats` reads are filled by the lake's `stats_core` and `deep_tables` stages (the old Mongo aggregation is retired), and the entity snapshot stays as the automatic fallback for unsupported brackets and errors.
- **Codex Score** (`app/services/run_entity_stats.py`): the Bayesian-shrunk win rate, graded against the per-type average → 0–100 → S/A/B/C/D/F tier, per card/relic/potion. The lake's entity cube is what the metrics endpoints fold; the snapshot walk is the fallback.
- **Redis** (`app/services/cache.py`, `services/rate_limit_config.py`): a fail-safe JSON cache in front of the hot read endpoints, and the shared store for the rate-limit counters so a cap means the same thing across all workers. `REDIS_URL` unset means every cache call no-ops and slowapi falls back to per-worker counters.
- **API keys** (`routers/api_keys.py`, `services/rate_limit_config.py`): `X-API-Key` buckets by key and uses its tier's cap (general 15, registered 60, academia 100, paid 120 per minute per route); no key is 300/min per IP. Tiers and per-path clamps are editable at runtime from the admin console.
- **Search** (`app/services/search_index.py`): one tantivy index over every entity in every language, reference entries, mechanics pages, guides, news, site pages and image files. One worker builds it under a file lock at startup, the rest mmap it. `services/semantic_search.py` adds meaning-based entity search over Workers AI bge-m3 embeddings (`scripts.build_embeddings`), with Redis in front of query embeddings; it degrades to nothing when no vectors or token exist.
- **Run vectors** (`app/services/run_vectors.py`): nightly per-character run-composition shards behind similar runs, archetypes, deck advisor, pick coach and encounter builds.
- **User accounts** (`app/routers/auth.py`, `services/auth_jwt.py`, `services/users_db.py`): Steam OpenID sign-in (Discord OAuth kept for existing accounts), JWT session cookies, profile stats, personal bests, and competitive comparison. Twitch (`auth_twitch.py`) links power the `/live` roster; Patreon (`auth_patreon.py`) links drive the paid API-key tier. Users + their claimed runs live in MongoDB. Needs `JWT_SECRET`, `DISCORD_CLIENT_ID/SECRET`, `FRONTEND_URL`, `SPIRE_CODEX_PUBLIC_BASE`.
- **Presence and replays** (`routers/presence.py`, `routers/replays.py`, `routers/replays_browse.py`): the in-game mod heartbeats a live run to `/api/presence` (bearer token) and uploads gzipped NDJSON replays against runs the player owns; `/live` and `/replays` read them.
- **Images** are served from the Cloudflare R2 CDN at `cdn.spire-codex.com` (webp). `resolve_image_url` builds CDN URLs from `CDN_BASE_URL`; the frontend uses `NEXT_PUBLIC_CDN_URL`. `services/r2_storage.py` uploads tier-list preview images to their own R2 bucket.

### Parsers (`backend/app/parsers/`)

Each parser reads decompiled C# source + localization JSON and outputs structured data:

| Parser | Extracts |
|--------|----------|
| `card_parser.py` | Cards - cost, type, rarity, damage, block, keywords, upgrades, DynamicVars |
| `monster_parser.py` | Monsters - HP, moves with intents/powers/damage/hit counts, innate powers, encounter context |
| `relic_parser.py` | Relics - rarity, pool, descriptions, image variants |
| `potion_parser.py` | Potions |
| `power_parser.py` | Powers - type (Buff/Debuff), stack type, inheritance resolution |
| `event_parser.py` | Events - multi-page decision trees, choices from C# source order, runtime-computed values |
| `encounter_parser.py` | Encounters - monster compositions, room type, act, tags |
| `character_parser.py` | Characters |
| `enchantment_parser.py` | Enchantments |
| `keyword_parser.py` | Keywords, intents, orbs and afflictions |
| `act_parser.py`, `ascension_parser.py` | Acts and ascension levels |
| `badge_parser.py` | Run-end badges |
| `epoch_parser.py` | Epochs and story/timeline data |
| `pool_parser.py`, `ancient_pool_parser.py` | Item pool assignments and ancient relic-offering pools |
| `rest_site_parser.py` | Rest-site option catalog |
| `merchant_parser.py` | Merchant pricing constants → `data/merchant_config.json` |
| `mechanics_constants_parser.py` | Named numeric constants from the odds / economy / progression files |
| `localization_parser.py`, `message_parser.py`, `icu_check.py` | The game's localization tables as an ICU MessageFormat pack (`data/{lang}/messages.json`), the SmartFormat → ICU converter, and the structural validator |
| `translation_parser.py` | `translations.json` per language (English filter values → localized names) |
| `guide_parser.py` | Guides: markdown with YAML frontmatter |
| `news_parser.py` | Steam announcements + community news archive |
| `orphan_filter.py` | Detects orphan C# class files left over from previous game versions |
| `description_resolver.py` | Shared SmartFormat template resolver |
| `parser_paths.py` | Shared path config: supports `EXTRACTION_DIR`/`DATA_DIR` env vars for beta, `CDN_BASE_URL` for image URLs |
| `parse_all.py` | Orchestrates all parsers for all 15 languages |

### Key Patterns

- **Card DynamicVars**: `new DamageVar(8m)`, `new BlockVar(5m)`, `new PowerVar<VulnerablePower>(2m)`
- **CalculatedDamage**: Cards like Ashen Strike use `CalculationBase + ExtraDamage * multiplier` - display shows base only
- **Power inheritance**: 19 powers inherit from Temporary{Strength,Dexterity,Focus}Power
- **Monster move effects**: Extracted from `PowerCmd.Apply<T>()` in move method bodies
- **Monster innate powers**: Extracted from `AfterAddedToRoom` (42 monsters)
- **Card upgrade descriptions**: `upgrade_description` resolved with upgraded var values for correct plurals/icons
- **Event dynamic values**: Runtime-computed values via special handlers (Tablet of Truth, Abyssal Baths) and CalculateVars patterns (`+=`/`-=` with NextInt/NextFloat)
- **ID format**: PascalCase class name → UPPER_SNAKE_CASE

## Frontend (`frontend/`)

- **Next.js 16** App Router with server + client components
- **Tailwind CSS** with CSS variables for theming
- **Every page lives under `app/[locale]/`** and `next-intl` (`i18n/routing.ts`, `i18n/request.ts`, `i18n/messages.ts` assembling the `lib/i18n-x*.ts` message modules) owns locale detection, the `/{lang}/` prefixes and the UI strings. English is the unprefixed root.
- **Rendering**: `dynamic = "force-dynamic"` is the norm (34 `page.tsx` files, server rendered per request behind the Cloudflare cache). Only 6 pages still use `force-static` + `revalidate = N` (the cards, relics, monsters, acts, ascensions and compare detail pages). The caching work is done by the response headers and the CF Cache Rules below, not by build-time generation.
- **TypeScript** strict mode, interfaces in `lib/api/types.ts`

### Key Files

| File | Purpose |
|------|---------|
| `lib/api/` | API client: `endpoint.server.ts` (server fetches with `timeoutMs` and ISR windows) and `endpoint.client.ts` (hooks over `fetch-cache`), `endpoint.common.ts` (the endpoint table), `prefix.*.ts` (beta channel detection from the path) and `types.ts` (all TypeScript interfaces) |
| `lib/languages.ts` | The 15 locale codes, hreflang mappings, native names |
| `lib/ui-translations.ts` | Manual UI string translations for non-game-data text; every key has an `eng` fallback |
| `lib/seo.ts` | Title builders (`entityTitle`, `pageTitle`, `gameName`) and SEO constants |
| `lib/use-entity-scores.ts` | Client hook - bulk-fetches Codex Scores per entity type via `/api/runs/scores/{type}`. |
| `lib/steam-news.ts` | Steam HTML/BBCode → safe HTML sanitizer for `/news` (resolves `{STEAM_CLAN_IMAGE}`, BBCode → HTML, strips scripts/iframes/event handlers). |
| `lib/replay.ts`, `lib/replay-scene.ts` | Replay file decoding and the battle-scene model for `/replays` |
| `app/globals.css` | CSS variables - colors, theme |
| `app/components/RichDescription.tsx` | BBCode tag renderer for game text |
| `app/components/CardGrid.tsx` | Card grid with inline icons |
| `app/components/ScoreBadge.tsx` | S/A/B/C/D/F tier pill (sm/md/lg) used on detail Stats tabs and tier-list rows. |
| `app/components/EntityRunStats.tsx` | Detail-page Stats tab - score hero badge + prose summary + recent runs links. |
| `app/components/TierList.tsx` | Visual S→F rows for `/tier-list/{cards,relics,potions}`. |
| `app/contexts/AuthContext.tsx` | Signed-in user state |

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

All endpoints accept `?lang=` (default: `eng`). Responses are GZip-compressed; entity reads have a 5-minute browser cache, an hour-long edge cache, run endpoints 30s edge cache.

- **List endpoints**: `GET /api/cards`, `GET /api/monsters`, etc. with filters
- **Detail endpoints**: `GET /api/cards/{id}`, `GET /api/monsters/{id}`, etc.
- **Runs**: `POST /api/runs` (submit), `GET /api/runs/stats` (aggregated meta: reads the materialized `stats_summary` docs the lake fills), `GET /api/runs/list` (browse: accepts `seed`, `build_id`, `sort` filters), `GET /api/runs/leaderboard` (ranked wins-only), `GET /api/runs/versions` (distinct game versions), `GET /api/runs/shared/{hash}` (shared run detail: merges `username` from MongoDB so the shared-run page can show "by {username}"), `GET /api/runs/scores/{type}` (Codex Score per entity), `GET /api/runs/metrics/{type}` (the dense `/stats` tables, folded from the lake's entity cube per `bracket`)
- **Search**: `GET /api/search` (tantivy, everything in every language), `GET /api/search/semantic` (embeddings)
- **Keys**: `GET /api/rate-limits`, `GET|POST /api/keys`, `DELETE /api/keys/{id}`
- **Guides**: `GET /api/guides` (list with filters), `GET /api/guides/{slug}` (detail), `POST /api/guides` (Discord webhook submission)
- **News**: `GET /api/news`, `GET /api/news/{gid}` - Steam announcement archive (`data/news/{gid}.json`, survives Steam's sliding window)
- **Merchant config**: `GET /api/merchant/config` - auto-extracted from C# pricing constants
- **Docs**: `http://localhost:8000/docs` (Swagger UI)

Filter parameters always use English values regardless of language.

## Codex Score

Per-entity grade derived from community-submitted runs. Lives in `backend/app/services/run_entity_stats.py`.

The raw observed win rate is unstable for small samples (a card that's only appeared in 1 game and won would otherwise rank S). To prevent this, we **shrink** the observed rate toward a baseline (the global community win rate) using a Bayesian prior:

```
shrunk_rate = (wins + PRIOR_WEIGHT × baseline) / (n + PRIOR_WEIGHT)
score = clamp((shrunk_rate - baseline) / SCALE_RANGE × 50 + 50, 0, 100)
```

Constants:
- `PRIOR_WEIGHT = 50` - pulls low-sample entries toward the baseline
- `SCALE_RANGE = 0.15` - a 15-point swing in shrunk win rate is the full 0–100 scale

Tier cutoffs (from `frontend/app/components/ScoreBadge.tsx::scoreToTier`): **S** ≥90, **A** 78–89, **B** 65–77, **C** 50–64, **D** 35–49, **F** <35.

`get_all_entity_scores(entity_type)` returns the full table for one type. Results are cached and pre-warmed on FastAPI startup via `_warm_run_entity_stats()` in `main.py` (background thread, so app boot isn't blocked).

## Performance / Caching

The site serves cached responses in 50–80ms edge-to-end globally (17–25ms warm-tab). Three layers cooperate:

1. **The DuckDB lake + materialized docs.** Nothing aggregates at request time. The ingest box runs the lake cycle (`lab/ingest.py`, stages in `lab/run_stage.py`: `payload`, `entity_store`, `encounter_store`, `entity_cube`, `deep_tables`, `charts_blob`, `stats_core`, `leaderboard_summary`, `frame`, `history`, `profiles`, `replay_guard`, `player_elo`, `player_stats`) and publishes the artifacts; the serving box pulls them and `services/lake_stats.py` reads stored artifacts. `/api/runs/stats` still does a `find_one` on the `stats_summary` docs, which the `stats_core` and `deep_tables` stages fill (the ~80 min Mongo aggregation that used to do it is retired). Hot read endpoints also sit behind the Redis JSON cache in `services/cache.py`.

2. **Backend cache-control middleware** (`main.py::CORSStaticMiddleware`). Path-tiered `Cache-Control` so CF and browsers cache appropriately:
   - `/static/*` → `max-age=31536000, immutable`
   - `/api/runs/*` → `s-maxage=30` (live-ish for new submissions)
   - `/api/*` → `s-maxage=3600` (entity data, only changes on deploy)
   - `/metrics`, `/health` → `no-store` (Prometheus scrapes)
   - Headers are skipped on 4xx/5xx so errors don't get cached.

3. **Cloudflare Cache Rules + ISR.** Two CF Cache Rules opt JSON / HTML into caching (off by default for `Content-Type: application/json`):
   - **API rule**: URI starts with `/api/` → eligible, use origin TTL.
   - **HTML rule**: URI doesn't start with `/api/` and doesn't start with `/static/` → eligible, use origin TTL.
   - The few `force-static` detail pages set their own `revalidate = N`, and Next.js emits `Cache-Control: s-maxage=N, stale-while-revalidate=...` for them. The `force-dynamic` majority renders per request; the server-side fetches in `lib/api/endpoint.server.ts` carry their own ISR windows (catalog data 3600s, run-derived stats 300s) so the backend calls are still cached.

Pages that read `searchParams` for filters (`/leaderboards`, `/tier-list/*`, `/news`, the `/stats` grids) serve from origin per request. They're the trade: caching them would require moving the filter logic client-side.

Surfaces:
- `GET /api/runs/scores/{type}` - bulk feed for tier-list pages
- `ScoreBadge` on entity detail Stats tab (`EntityRunStats`)
- `/tier-list/{cards,relics,potions}` - visual S→F rows
- `/stats/{cards,relics,potions,shops,events,campfires,encounters}`: the dense metric grids
- `/stats/scoring`: methodology page (explains the formula above for end users)

## Localization

- 15 languages from game's localization files (`zht` shipped in game v0.109.0 with English fallback for untranslated strings)
- `_key` fields preserve English values alongside localized display strings (e.g., `rarity_key: "Rare"` stays English while `rarity: "稀有"` is localized)
- UI chrome goes through next-intl; the game's own strings ship as ICU packs in `data/{lang}/messages.json` and `GET /api/localizations`

## Spine Rendering

Monster sprites are Spine skeletal animations (.skel + .atlas + .png), not static images.

- **WebGL renderer** (`tools/spine-renderer/render_webgl.mjs`) - Playwright + spine-webgl via headless Chrome, single frame.
- **Batch renderer** (`tools/spine-renderer/render_all_webgl.mjs`) - all 138 skeletons as static PNGs.
- **Animation renderer** (`tools/spine-renderer/render_gif.mjs`) - animated WebP/GIF/APNG with skin variant and animation selection support. Streams frames to disk for WebP/APNG to avoid OOM.
- **Static output**: 512×512 transparent PNGs (+ same-source WebPs).
- **Animation output**: 209 lossless animated WebPs (characters at 512×512, monsters at 256×256).

### Renderer flags (`render_webgl.mjs`)

| Flag | Purpose | Example |
|---|---|---|
| `--skin=a,b,c` | Combine variant skins with `default`. Required for skeletons that split body / eye / variant across multiple skins. | `--skin=moss1,diamondeye` for cubex_construct, `--skin=skin1` for scroll_of_biting |
| `--anim=name` | Override the auto-picked idle animation. | `--anim=attack` |
| `--anim-time=<seconds>` | Advance the animation N seconds before snapshotting. For skeletons that assemble over the first few frames. | `--anim-time=0.5` |
| `--white` | Convert all visible pixels to white silhouette. | - |
| `--only-slots=<pattern>` | Render only slots matching a substring. | - |

### Hidden slots + smoke substitution

The renderer maintains two lists for placeholder content the game replaces with shaders at runtime:

- **`HIDDEN_SLOTS`** (stripped before draw) - `smokeplacholder`, `smoke_placeholder`, `megatail`, `megablade`, `soundwave`, `beckonwave`. These are weapon / soundwave VFX with no good static substitute.
- **`SMOKE_PLACEHOLDER_PAGES`** (texture swapped with a generated cloud) - `gas_bomb_2.png`, `the_forgotten_2.png`, `living_smog_2.png`. Each placeholder atlas page is replaced with a procedurally generated dark plum smoke texture at the same dimensions before GL upload, so the slot's mesh deformation drives a real-looking smoke effect. Slot `color.a` is forced to `1.0` for substituted slots - the original artists set low alpha (0.26-0.38) expecting a shader to add density, and without the shader the cloud reads washed out.

### Re-framing undersized renders

`tools/rescale_bestiary.py` is a post-processor that crops to the **true alpha bbox** (not the Spine vertex bbox) and rescales each monster's PNG + WebP to fill 92% of the 512×512 frame. Run it after `render_all_webgl.mjs` for monsters whose visible sprite was sitting at low frame coverage.

```bash
python3 tools/rescale_bestiary.py fuzzy_wurm_crawler thieving_hopper terror_eel
```

## Badges

Run-end mini-achievements awarded on the Game Over screen (introduced in v0.103.x beta, shipped to stable in Major Update #1).

- **Parser** (`backend/app/parsers/badge_parser.py`) - reads `MegaCrit.Sts2.Core.Models.Badges/*.cs` for `Id` / `RequiresWin` / `MultiplayerOnly`, groups bronze/silver/gold tier titles + descriptions from `localization/<lang>/badges.json`. Outputs 25 badges per language (Thai is empty upstream).
- **Schema** (`backend/app/models/schemas.py`): `Badge` + `BadgeTier` Pydantic models.
- **Router** (`backend/app/routers/badges.py`): `GET /api/badges` (filters: `tiered`, `multiplayer_only`, `requires_win`, `search`), `GET /api/badges/{id}`.
- **Frontend**: `/badges` list page (tiered / single-tier / multiplayer sections), `/badges/[id]` detail page (Bronze / Silver / Gold tier breakdown). Lives under `app/[locale]/badges`, so every one of the 15 languages gets it.

## Image Pipeline

`backend/scripts/copy_images.py` copies game art from `extraction/raw/images/` to `backend/static/images/`. Each PNG is copied **and** a sibling WebP is generated from the same source (`quality=95`, `method=6`) - never a re-conversion of an existing backend WebP. Skips when the WebP is already newer than the source PNG so reruns don't churn untouched art.

That tree is only the staging copy. What the site serves is the R2 bucket behind `cdn.spire-codex.com`; `parser_paths.py` writes CDN URLs into the JSON when `CDN_BASE_URL` is set, and `/images` browses and zips the CDN folders through `GET /api/images/game/{version}/{category}/...`.

## Entity Version History

Every detail page renders a Version History rail powered by `GET /api/history/{entity_type}/{entity_id}`. The endpoint scans every changelog under `data/changelogs/` for entries that touched the requested entity, returns them **newest first**, and matches case-insensitively (URLs use lowercased ids; changelog ids are upper-snake).

`tools/diff_data.py` produces the field-level changes via `_deep_diff()` - recurses into nested dicts and lists so each leaf becomes its own row (`vars.DamageVar: 8 → 10`) instead of opaque `vars: 2 fields → 2 fields`. List items with stable `id` fields are matched by id (so `moves[BEAM_MOVE]` rather than `moves[2]`).

Hand-curated `features` / `fixes` / `api_changes` arrays in a changelog are preserved through regenerations of an existing tag. The data-diff portion is overwritten but those release-note arrays merge through.

### Write-once retention

Files under `data/changelogs/` are write-once historical records. `.github/workflows/changelog-guard.yml` blocks any PR that modifies or deletes an existing changelog file. New files (`A`) are always allowed; modifications require the `changelog-edit-approved` PR label. See `CONTRIBUTING.md → Changelog Retention`.
