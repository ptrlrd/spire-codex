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

## Guides

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/guides` | GET | All guides. Filters: `category`, `difficulty`, `tag`, `search` |
| `GET /api/guides/{slug}` | GET | Single guide with full markdown content |
| `POST /api/guides` | POST | Submit a guide (proxied to Discord webhook). Rate limited: 3/min |

## Run Data

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /api/runs` | POST | Submit a run. Optional `?username=` param (25 char max) |
| `GET /api/runs/stats` | GET | Aggregated community stats. Filters: `character`, `win`, `ascension`, `game_mode`, `players` |
| `GET /api/runs/list` | GET | Browse runs. Filters: `character`, `win`, `username`, `seed` (LIKE), `build_id`, `sort` (`date`, `time_asc`, `time_desc`, `ascension_desc`), `page`, `limit` |
| `GET /api/runs/shared/{hash}` | GET | Retrieve a shared run by hash |
| `GET /api/runs/leaderboard` | GET | Ranked wins-only leaderboard. Filters: `category` (`fastest`, `highest_ascension`), `character`, `page`, `limit` |
| `GET /api/runs/versions` | GET | Distinct `build_id` values across submitted runs — powers the version filter dropdown |

## Utility

| Endpoint | Description |
|----------|-------------|
| `GET /api/stats` | Entity counts across all categories |
| `GET /api/languages` | Available languages |
| `GET /api/translations` | Translation maps for filters and UI strings |
| `GET /api/images` | Image categories with file lists |
| `GET /api/images/{category}/download` | ZIP download of image category |
| `GET /api/changelogs` | Changelog summaries |
| `GET /api/changelogs/{tag}` | Full changelog for a version |
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
