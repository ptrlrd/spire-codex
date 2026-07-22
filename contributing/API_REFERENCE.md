# API Reference

Base URL: `https://spire-codex.com` (production) or `http://localhost:8000` (local)

All data endpoints accept `?lang=` (default: `eng`). Rate limited to 60 req/min per IP.

## Game Data

| Endpoint | Filters | Description |
|----------|---------|-------------|
| `GET /api/cards` | `color`, `type`, `rarity`, `keyword`, `tag`, `search` | All cards |
| `GET /api/cards/{id}` | | Single card |
| `GET /api/characters` | `search` | All characters |
| `GET /api/characters/{id}` | | Single character (with quotes, dialogues) |
| `GET /api/relics` | `rarity`, `pool`, `search` | All relics |
| `GET /api/relics/{id}` | | Single relic |
| `GET /api/monsters` | `type`, `search` | All monsters |
| `GET /api/monsters/{id}` | | Single monster |
| `GET /api/potions` | `rarity`, `pool`, `search` | All potions |
| `GET /api/potions/{id}` | | Single potion |
| `GET /api/enchantments` | `card_type`, `search` | All enchantments |
| `GET /api/enchantments/{id}` | | Single enchantment |
| `GET /api/encounters` | `room_type`, `act`, `search` | All encounters |
| `GET /api/encounters/{id}` | | Single encounter |
| `GET /api/events` | `type`, `act`, `search` | All events |
| `GET /api/events/{id}` | | Single event |
| `GET /api/powers` | `type`, `stack_type`, `search` | All powers |
| `GET /api/powers/{id}` | | Single power |
| `GET /api/keywords` | | Card keywords |
| `GET /api/keywords/{id}` | | Single keyword |
| `GET /api/intents` | | Monster intents |
| `GET /api/intents/{id}` | | Single intent |
| `GET /api/orbs` | | All orbs |
| `GET /api/orbs/{id}` | | Single orb |
| `GET /api/afflictions` | | Card afflictions |
| `GET /api/afflictions/{id}` | | Single affliction |
| `GET /api/modifiers` | | Run modifiers |
| `GET /api/modifiers/{id}` | | Single modifier |
| `GET /api/achievements` | | All achievements |
| `GET /api/achievements/{id}` | | Single achievement |
| `GET /api/badges` | `tiered`, `multiplayer_only`, `requires_win`, `search` | All run-end badges (Bronze/Silver/Gold tiers) |
| `GET /api/badges/{id}` | | Single badge with tier breakdown |
| `GET /api/epochs` | `era`, `search` | Timeline epochs |
| `GET /api/acts` | | All acts |
| `GET /api/acts/{id}` | | Single act |
| `GET /api/ascensions` | | Ascension levels (0-10) |
| `GET /api/ascensions/{id}` | | Single ascension |
| `GET /api/ancient-pools` | | Ancient relic offering pools |
| `GET /api/ancient-pools/{id}` | | Single ancient's pools |

### Card image fields

Each card from `/api/cards` and `/api/cards/{id}` carries image URLs:

| Field | Description |
|-------|-------------|
| `image_url` | Portrait art only (relative `/static/images/...` path, served via the CDN) |
| `image_url_card` | Full game-rendered card (frame + art + banner + text). Absolute CDN URL. Ancient cards are animated webps. `null` for `mad_science` (no render), fall back to `image_url` |
| `image_url_card_upg` | Full game-rendered **upgraded** card. `null` when the card has no upgrade |

Full-card base URL is `https://cdn.spire-codex.com/cards-full/stable/<id>.webp` (and `<id>_upg.webp`). Override server-side with the `CARD_FULL_BASE` env var (e.g. to point at a beta render set).

## Guides

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/guides` | GET | All guides. Filters: `category`, `difficulty`, `tag`, `search` |
| `GET /api/guides/{slug}` | GET | Single guide with full markdown content |
| `POST /api/guides` | POST | Submit a guide (proxied to Discord webhook). Rate limited: 3/min |

## Run Data

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /api/runs` | POST | Submit a run. Optional `?username=` param (32 char max) |
| `GET /api/runs/stats` | GET | Aggregated community stats. Filters: `character`, `win`, `ascension`, `game_mode`, `players` |
| `GET /api/runs/list` | GET | Browse runs. Filters: `character`, `win`, `username`, `seed` (LIKE), `build_id`, `build_ids` (comma list), `players` (`single`/`multi`), `game_mode`, `ascension`, `ascension_min`, `ascension_max`, `card`, `relic` (exact id; comma-separated = AND), `today`, `sort` (`date`, `time_asc`, `time_desc`, `ascension_desc`), `page`, `limit` |
| `GET /api/runs/shared/{hash}` | GET | Retrieve a shared run by hash. Response merges `username` from the runs DB so the shared-run page can render "by {username}" without a second round trip. |
| `GET /api/runs/leaderboard` | GET | Ranked wins-only leaderboard. Filters: `category` (`fastest`, `highest_ascension`), `character`, `players`, `game_mode`, `today`, `page`, `limit` |
| `GET /api/runs/leaderboard/rank/{hash}` | GET | Rank of one winning run within its ladder. `category` filter. |
| `POST /api/runs/claim` | POST | Body `{ username, hashes: [] }` — attaches a username to previously-submitted runs (only rows with a null/empty username). |
| `GET /api/runs/scores/{type}` | GET | Codex Score per entity. `type` ∈ `cards` / `relics` / `potions`. Returns `{ id, score (0–100), tier (S/A/B/C/D/F), wins, losses, n }[]`. Bayesian-shrunk win rate graded against the per-type average, materialized to MongoDB by a single leader and read by all workers. See `services/run_entity_stats.py` and `/leaderboards/scoring`. |
| `GET /api/runs/metrics/{type}` | GET | Dense metrics table (powers `/leaderboards/metrics`). `type` ∈ `cards` / `relics` / `potions`. Optional `cohort` ∈ `all` (default) / `solo` / `2p` / `3p` / `4p` / `a10` (ascension 10) / `daily` / `custom` slices to a pre-built run cohort (all cohorts are materialized in the same snapshot, so it stays a single cached read). Returns `{ entity_type, cohort, baseline_win_rate, total_runs, rows: [{ id, score, tier, elo, win_rate, pick_rate, picks, wins, losses, offered, picked, pick_rate_by_act:[A1,A2,A3] }] }`. **Codex Elo** is a revealed-preference Bradley-Terry rating built from card-reward picks (the card you take beats the cards you skip), so it's largely skill-agnostic. Cards only; relics/potions return `null` Elo/pick fields. Served from the same pre-built snapshot as `/scores` (no per-request aggregation). |
| `GET /api/runs/encounter-stats` | GET | Per-encounter aggregation. Query params: `act` (comma-separated 1/2/3), `room_type` (comma-separated monster/elite/boss), `multiplayer` (`only`/`exclude`), `page`, `limit` (max 200, default 50). Returns `{ encounters: [{ encounter_id, act, room_type, total, fatal, avg_damage, avg_turns, characters: [{ character, total, fatal, avg_damage, avg_turns }] }], page, limit, total, has_next }`. Mongo-only; returns empty when no Mongo backend is configured. |
| `GET /api/runs/versions` | GET | Distinct `build_id` values across submitted runs — powers the version filter dropdown |

## User Accounts

Cookie/JWT session. Sign in with Steam (OpenID) or Discord (OAuth). Requires `MONGO_URL` + the auth env vars (`JWT_SECRET`, `DISCORD_CLIENT_ID/SECRET`, `FRONTEND_URL`, `SPIRE_CODEX_PUBLIC_BASE`).

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/auth/me` | GET | Current user, or 401 |
| `GET /api/auth/steam/redirect` | GET | Begin Steam OpenID flow |
| `GET /api/auth/discord/start` | GET | Begin Discord OAuth flow |
| `POST /api/auth/logout` | POST | Clear the session cookie |
| `POST /api/auth/set-cookie` | POST | Exchange a token for an httpOnly cookie (cross-origin dev) |
| `PATCH /api/auth/username` | PATCH | Update username (32 char max, 3 changes/day) |
| `PATCH /api/auth/email` | PATCH | Update email |
| `GET /api/auth/runs` | GET | The user's runs (paginated) |
| `POST /api/auth/runs/upload` | POST | Multi-file `.run` upload, claimed to the user |
| `DELETE /api/auth/runs/{hash}` | DELETE | Soft-delete one of the user's runs |
| `GET /api/auth/stats` | GET | Per-user aggregated stats (profile page) |
| `GET /api/auth/personal-bests` | GET | Fastest solo/co-op, highest ascension, today's + all-time daily |
| `GET /api/auth/competitive` | GET | Today's daily leaderboard, per-best global rank, win rate vs community |

## Utility

| Endpoint | Description |
|----------|-------------|
| `GET /api/stats` | Entity counts across all categories |
| `GET /api/languages` | Available languages |
| `GET /api/translations` | Translation maps for filters and UI strings |
| `GET /api/images` | Image categories with file lists. Beta-prefixed categories accept `?version=`. |
| `GET /api/images/beta/versions` | Available beta image archive versions (newest-first) + the `latest` symlink target. `main` is included as a synthetic entry that maps the beta-* categories to the stable image tree. |
| `GET /api/images/{category}/download` | ZIP download of image category. Beta categories accept `?version=` to scope the zip to a specific patch. |
| `GET /api/changelogs` | Changelog summaries |
| `GET /api/changelogs/{tag}` | Full changelog for a version |
| `GET /api/versions` | Version metadata exposed by the active data root. Public beta clients should use `channel=beta`; archived beta image versions are listed by `/api/images/beta/versions`. |
| `GET /api/unlocks` | Aggregated unlockables grouped by entity type with epoch + score thresholds |
| `GET /api/news` | Steam announcements + community news (locally archived). Filters: `feed_type`, `feedname`, `tag`, `since`, `search`, `limit`, `offset` |
| `GET /api/news/{gid}` | Single Steam news article with raw HTML/BBCode body |
| `GET /api/merchant/config` | Merchant pricing config (auto-extracted from C#: card/potion/relic prices, removal tiers, blacklist) |
| `GET /api/names/{type}/{id}` | Cross-language name lookup |
| `GET /api/exports/{lang}` | ZIP download of all entity JSON |
| `GET /api/history/{type}/{id}` | Per-entity version history (newest first, case-insensitive id match) |
| `POST /api/feedback` | Submit feedback (proxied to Discord) |

## Languages

| Code | Language | Code | Language |
|------|----------|------|----------|
| `eng` | English | `kor` | 한국어 |
| `deu` | Deutsch | `pol` | Polski |
| `esp` | Español (ES) | `ptb` | Português (BR) |
| `fra` | Français | `rus` | Русский |
| `ita` | Italiano | `spa` | Español (LA) |
| `jpn` | 日本語 | `tha` | ไทย |
| `tur` | Türkçe | `zhs` | 简体中文 |
