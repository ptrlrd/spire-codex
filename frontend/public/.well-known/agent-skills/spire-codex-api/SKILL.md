---
name: spire-codex-api
description: Look up Slay the Spire 2 game data and community stats through the Spire Codex REST API.
---

# Spire Codex API

Spire Codex serves Slay the Spire 2 game data (cards, relics, potions, monsters, events, powers) and community run statistics over a public REST API.

## Usage

- Base URL: https://spire-codex.com/api
- OpenAPI schema: https://spire-codex.com/openapi.json
- Docs: https://spire-codex.com/developers
- No key needed to browse. Send an `X-API-Key` header for higher rate limits (see /auth.md).

## Common calls

- `GET /api/cards?lang=eng` — every card; also /api/relics, /api/potions, /api/monsters, /api/events, /api/powers
- `GET /api/cards/{id}` — one entity by id
- `GET /api/runs/scores/{cards|relics|potions}` — Codex Scores and Elo per entity
- `GET /api/runs/metrics/{cards|relics|potions}?bracket=a10` — win/pick rates by bracket
- `GET /api/runs/community-stats` — event decisions, deadliest encounters, records
- 14 languages via `?lang=` (eng, deu, jpn, zhs, ...)
