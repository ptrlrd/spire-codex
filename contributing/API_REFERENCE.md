# API Reference

Base URL: `https://spire-codex.com` (production) or `http://localhost:8000` (local)

All data endpoints accept `?lang=` (default: `eng`).

Rate limits count per route, not across the whole API. Without a key you get 300 req/min per IP on each route. Send an `X-API-Key` header and the cap comes from the key's tier instead: general 15/min, registered 60/min (what `/api/keys` hands out), academia 100/min, paid 120/min (Patreon-linked). Admins can change those numbers and clamp single paths at runtime, so `GET /api/rate-limits` is the source of truth. Endpoints with their own tighter limit (auth, feedback, guide submission, exports, run submission) keep it regardless of key.

## Game Data

| Endpoint | Filters | Description |
|----------|---------|-------------|
| `GET /api/cards` | `color`, `type`, `rarity`, `keyword`, `tag`, `search` | All cards |
| `GET /api/cards/{id}` | | Single card |
| `GET /api/characters` | `search` | All characters |
| `GET /api/characters/{id}` | | Single character (with quotes, dialogues) |
| `GET /api/relics` | `rarity`, `pool`, `ancient`, `search` | All relics |
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
| `GET /api/epochs/{id}` | | Single epoch |
| `GET /api/stories` | | Stories |
| `GET /api/stories/{id}` | | Single story |
| `GET /api/glossary` | | Glossary terms |
| `GET /api/glossary/{id}` | | Single glossary term |
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
| `GET /api/runs/scores/{type}` | GET | Codex Score per entity. `type` ∈ `cards` / `relics` / `potions`. Returns `{ id, score (0–100), tier (S/A/B/C/D/F), wins, losses, n }[]`. Bayesian-shrunk win rate graded against the per-type average, materialized to MongoDB by a single leader and read by all workers. See `services/run_entity_stats.py` and `/stats/scoring`. |
| `GET /api/runs/metrics/{type}` | GET | Dense metrics table (powers `/stats/cards`, `/stats/relics`, `/stats/potions`). `type` ∈ `cards` / `relics` / `potions`. `bracket` slices to a run bracket: `all` (default), `solo`, `2p`, `3p`, `4p`, `a10`, `daily`, `custom`, `standard`, the skill tiers `wr30` / `wr50` / `wr75`, composites like `solo:a10`, and game versions (`v0.110.0`, or `solo:wr30:v0.110.0`). Unknown bracket is a 400. `cohort` is a deprecated alias for `bracket`. `character` (e.g. `IRONCLAD`) combines with any bracket and adds `character_runs` / `character_wins`. Rows carry Codex Score, win rate with a Wilson `win_rate_ci`, floor-adjusted `lift`, **Codex Elo** (a revealed-preference Bradley-Terry rating from choice screens: the card you take beats the cards you skip), pick rate, per-act pick splits and raw per-seat counts; relics add `removed` / `removed_rate` and a `wax` block, potions add `used` / `use_rate`. Served from the DuckDB lake's entity cube, one in-memory fold per bracket. |
| `GET /api/runs/metrics/shops` | GET | Shop shelf table for one `bracket` (powers `/stats/shops`) |
| `GET /api/runs/metrics/events` | GET | Event choice table for one `bracket` (powers `/stats/events`) |
| `GET /api/runs/metrics/campfires` | GET | Rest-site choice table for one `bracket` (powers `/stats/campfires`) |
| `GET /api/runs/stats/{type}/{id}` | GET | Community run stats for one card, relic or potion |
| `GET /api/runs/stats/{type}/{id}/history` | GET | Daily Codex Score + Elo history for one entity. `bracket` filter |
| `GET /api/runs/top/{type}/{character}` | GET | Most-picked entities of a type for one character. `limit` (default 5) |
| `GET /api/runs/community-stats` | GET | Community / fun stats for the `/stats` hub. Optional `bracket` |
| `GET /api/runs/pulse` | GET | Community totals as of the store cursor (5s shared cache) |
| `GET /api/runs/snapshot-status` | GET | Whether the stats snapshot is loaded or rebuilding |
| `GET /api/runs/versions` | GET | Distinct `build_id` values across submitted runs, powers the version filter dropdown |
| `GET /api/runs/encounter-stats` | GET | Per-encounter aggregation. Query params: `act` (comma-separated 1/2/3), `room_type` (comma-separated monster/elite/boss), `multiplayer` (`only`/`exclude`), `page`, `limit` (max 200, default 50). Returns `{ encounters: [{ encounter_id, act, room_type, total, fatal, avg_damage, avg_turns, characters: [{ character, total, fatal, avg_damage, avg_turns }] }], page, limit, total, has_next }`. Mongo-only; returns empty when no Mongo backend is configured. |
| `GET /api/runs/encounter-series` | GET | Up to 20 comma-separated `encounter` ids rolled up for charts, same fields as `/encounter-stats` |
| `GET /api/runs/leaderboard/seed-rank` | GET | Seed + global standing for the in-game mod. `seed`, optional `steam_id` |
| `GET /api/runs/me/picks` | GET | The signed-in player's own pick rates across decision surfaces (self only) |

Signed-in admins can also `POST /api/runs/{hash}/hidden` to hide or unhide a run from its own page.

### Deck intelligence

Built from the nightly run composition vectors and the DuckDB lake. All take `lang`.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/runs/{hash}/similar` | GET | Nearest winning solo decks to this run, plus what those winners took that this run didn't |
| `GET /api/runs/archetypes` | GET | Community deck archetypes per character (the data behind `/archetypes`) |
| `GET /api/runs/encounter-builds` | GET | Which archetypes die to an `encounter` and which walk past it |
| `GET /api/runs/deck-advisor` | GET | `character`, `cards`, `relics`, `limit`: what the nearest winning decks carry that this partial deck doesn't |
| `GET /api/runs/pick-coach` | GET | `character`, `cards`, `relics`, `offer`, `target`: nearest archetypes for a partial deck and offer-conditioned lift |
| `GET /api/runs/seed-finder` | GET | Seed search. `character`, `deck`, `offered`, `relics`, `events`, `ancient`, `ancient_act`, `neow`, `ancient_offers`, `bosses` |
| `GET /api/runs/seed-finder/meta` | GET | Filter options for the seed finder |
| `GET /api/runs/seed-finder/random` | GET | A random seed. `build_id`, `min_runs` |
| `GET /api/runs/seed-finder/seed/{seed}` | GET | Everything community runs have shown for one seed. `build_id`, `party` |
| `GET /api/draft-recs/{type}/{id}` | GET | Given a card/relic you hold, the cards players most often draft with it |
| `POST /api/draft-advice` | POST | Rank the offered cards for the current deck. Body carries `deck` and the offer |
| `GET /api/pairings/{type}/{id}` | GET | Which cards / relics / potions show up in the same runs as this item |

### Leaderboards, players, presence

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/leaderboards/elo` | GET | Top players by hidden Elo over solo A10 standard runs. `limit`, `min_runs` |
| `GET /api/players/{username}/stats` | GET | One player's public cards, relics, potions, events, shops and campfire tables. `character`, `ascension`, `version`, `players`. 404 for unknown or private profiles |
| `GET /api/players/{username}/insights` | GET | One player's public insights, same filters and privacy rule |
| `GET /api/players/flair` | GET | Supporter flair for a batch of usernames (`u`, repeated, up to 100) |
| `POST /api/presence` | POST | Heartbeat from the in-game mod (bearer token). Body `{"ended": true}` clears it |
| `GET /api/presence/active` | GET | Public roster of live runs, deepest first. `limit` |
| `GET /api/presence/{steam_id}` | GET | One player's full live run (deck, relics, potions, map), 404 when not in a run |

### Replays

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /api/runs/{hash}/replay` | POST | Store the gzipped NDJSON replay for a run you own (upload the `.run` first) |
| `GET /api/runs/{hash}/replay` | GET | The stored replay, as the original gzip bytes |
| `DELETE /api/runs/{hash}/replay` | DELETE | Remove your replay |
| `GET /api/replays` | GET | Browse watchable replays. Same filters as `/api/runs/list` (`character`, `win`, `username`, `seed`, `build_id`, `players`, `sort`, ...) |
| `GET /api/replays/summary` | GET | How many replays are watchable, overall and per character |

### Charts and tier lists

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/charts/meta` | GET | Controls for the chart explorer |
| `GET /api/charts/{chart_key}` | GET | One chart's series. `players`, `ascension`, `game_mode`, `username`, `split` |
| `GET /api/charts/mine` | GET | The signed-in player's saved charts |
| `GET /api/charts/public` | GET | Newest public saved charts. `limit` |
| `POST /api/charts` | POST | Save a chart spec (100 per account). `PATCH` / `DELETE /api/charts/{id}` edit and remove |
| `GET /api/tierlists` | GET | The signed-in user's tier lists. `POST` creates one, `GET` / `PATCH` / `DELETE /api/tierlists/{id}` are owner-scoped |
| `GET /api/tierlists/shared/{share_id}` | GET | Public read-only tier list by share handle |

## User Accounts

Cookie/JWT session. Sign in with Steam (OpenID); Discord OAuth still works for accounts that already use it. Twitch and Patreon are account links, not sign-ins. Requires `MONGO_URL` + the auth env vars (`JWT_SECRET`, `DISCORD_CLIENT_ID/SECRET`, `FRONTEND_URL`, `SPIRE_CODEX_PUBLIC_BASE`).

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/auth/me` | GET | Current user, or 401 |
| `GET /api/auth/session` | GET | Current user, or null for anonymous visitors |
| `POST /api/auth/steam/start` | POST | Begin a Steam OpenID flow (popup); `GET /api/auth/steam/redirect` is the redirect form, `/callback` finishes it |
| `GET /api/auth/steam/poll/{session_id}` | GET | Client polls this until the callback writes the identity |
| `POST /api/auth/steam/ticket` | POST | Silent sign-in for the in-game mod with a Steamworks auth ticket (needs `STEAM_WEB_API_KEY`) |
| `GET /api/auth/discord/start` | GET | Begin Discord OAuth flow (`/callback` finishes it) |
| `GET /api/auth/twitch/start` | GET | Link a Twitch account (`/callback` finishes it). Powers the "Watch on Twitch" link on `/live` |
| `GET /api/auth/patreon/start` | GET | Link Patreon to a signed-in account; sets `is_paid` and promotes the account's API keys. `POST /api/auth/patreon/webhook` takes membership changes from Patreon |
| `POST /api/auth/{steam,discord,twitch,patreon}/disconnect` | POST | Unlink that provider |
| `POST /api/auth/logout` | POST | Clear the session cookie |
| `POST /api/auth/set-cookie` | POST | Exchange a token for an httpOnly cookie (cross-origin dev) |
| `POST /api/auth/refresh` | POST | Swap a valid token for a fresh one |
| `PATCH /api/auth/username` | PATCH | Update username (32 char max, 3 changes/day). `GET /api/auth/username/check` tests availability |
| `PATCH /api/auth/email` | PATCH | Update email |
| `PATCH /api/auth/theme` | PATCH | Save the supporter theme and whether others see it |
| `PATCH /api/auth/profile-privacy` | PATCH | Toggle the public `/players` page for this account |
| `PATCH /api/auth/thanks-listing` | PATCH | Opt in or out of being named on the Thank You page |
| `POST /api/auth/overwolf/link` | POST | Link the account to an Overwolf user (`DELETE /api/auth/overwolf` unlinks) |
| `GET /api/auth/runs` | GET | The user's runs (paginated). `GET /api/auth/runs/stats` is the totals |
| `POST /api/auth/runs/upload` | POST | Multi-file `.run` upload, claimed to the user |
| `DELETE /api/auth/runs/{hash}` | DELETE | Soft-delete one of the user's runs. `POST /api/auth/runs/bulk-delete` does several |
| `GET /api/auth/stats` | GET | Per-user aggregated stats (profile page) |
| `GET /api/auth/player-stats` | GET | The signed-in player's own stats tables, private profiles included |
| `GET /api/auth/insights` | GET | The signed-in player's personal community-stats |
| `GET /api/auth/personal-bests` | GET | Fastest solo/co-op, highest ascension, today's + all-time daily |
| `GET /api/auth/competitive` | GET | Today's daily leaderboard, per-best global rank, win rate vs community |

### API keys

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/rate-limits` | GET | The public rate-limit tiers (no auth) |
| `GET /api/keys` | GET | Your API keys (metadata only) |
| `POST /api/keys` | POST | Create a key (registered tier). The `raw_key` is shown only in this response |
| `DELETE /api/keys/{key_id}` | DELETE | Revoke a key |

## Utility

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Liveness check |
| `GET /api/stats` | Entity counts across all categories |
| `GET /api/languages` | Available languages |
| `GET /api/search` | Search every entity type, reference entry, mechanics page and guide. `q` (1-80 chars), `lang` |
| `GET /api/search/semantic` | Meaning-based entity search over embeddings. `q` (3-120 chars), `limit` (max 20). Empty when no vectors are built |
| `GET /api/localizations` | Every localization table for the language as ICU MessageFormat strings, or only `tables=` (comma list). `/tables` lists the names, `/{table}` returns one |
| `GET /api/translations` | **Deprecated.** Old translation maps for filters and UI strings; use `/api/localizations` |
| `GET /api/images` | Image categories |
| `GET /api/images/search` | Search image files by name. `search`, `limit` |
| `GET /api/images/game/{version}/{category}/browse` | Browse one CDN image folder. `path`, `offset`, `limit` |
| `GET /api/images/game/{version}/{category}/download` | ZIP download of one CDN image folder. `path` |
| `GET /api/changelogs` | Changelog summaries |
| `GET /api/changelogs/recent-additions` | Newest entity additions across recent changelogs. `entity_type`, `limit`, `max_versions`, `max_age_days` |
| `GET /api/changelogs/{tag}` | Full changelog for a version |
| `GET /api/versions` | Version metadata exposed by the active data root. Public beta clients should use `channel=beta`. |
| `GET /api/beta/version` | The current beta version |
| `GET /api/beta/diff` | What the current beta adds, changes and removes, per entity type |
| `GET /api/unlocks` | Aggregated unlockables grouped by entity type with epoch + score thresholds |
| `GET /api/mechanics/sections` | Index of mechanics pages; `/sections/{slug}` is one page as markdown |
| `GET /api/mechanics/constants` | Parsed mechanics constants (card rarity, potion odds, ...) |
| `GET /api/news` | Steam announcements + community news (locally archived). Filters: `feed_type`, `feedname`, `tag`, `since`, `search`, `limit`, `offset` |
| `GET /api/news/{gid}` | Single Steam news article with raw HTML/BBCode body |
| `GET /api/news/codex` | Published Spire Codex site news, newest first; `/codex/{slug}` is one entry |
| `GET /api/announcements` | Active site banner messages |
| `GET /api/merchant/config` | Merchant pricing config (auto-extracted from C#: card/potion/relic prices, removal tiers, blacklist) |
| `GET /api/names/{type}/{id}` | Cross-language name lookup |
| `GET /api/exports/{lang}` | ZIP download of all entity JSON. 10/hour |
| `GET /api/exports/runs` | Bulk export of submitted runs as gzipped JSONL. `limit`, `version`. 120/hour, weighted by size |
| `GET /api/exports/runs/manifest` | When the daily full-corpus dump was generated and how many runs it holds |
| `GET /api/history/{type}/{id}` | Per-entity version history (newest first, case-insensitive id match) |
| `GET /api/update-history/{type}/{id}` | Game-patch changes for one entity, newest first |
| `GET /api/mod/latest` | Latest published mod build and the newest game version it was verified against |
| `GET /api/thanks` | GitHub contributors, special thanks and public Ko-fi supporters |
| `POST /api/feedback` | Submit feedback (proxied to Discord). `POST /api/feedback/run-report` reports a run |

Hidden routers are not listed here: the `/api/admin/*` console routes, auth internals (callbacks, Steam poll), uninstall and QA feedback, the search log and `/api/telemetry` only exist for the site and the mod.

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
| `zht` | 繁體中文 | | |
