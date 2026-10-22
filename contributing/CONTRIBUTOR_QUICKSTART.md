# Contributor Quick Start

This file provides concise project context for contributors and coding assistants working on Spire Codex.

## Project Summary

Spire Codex is a comprehensive database for Slay the Spire 2, built by reverse-engineering the game files. FastAPI backend + Next.js frontend. All game data is extracted from decompiled C# source code.

## Quick References

- **Backend**: Python 3.12, FastAPI, Pydantic
- **Runs DB**: MongoDB (community stats, leaderboards, accounts); legacy SQLite fallback when `MONGO_URL` is unset
- **Analytics**: DuckDB lake built by `lab/`, served read-only by `backend/app/services/lake_stats.py`
- **Redis**: fail-safe JSON cache + shared rate-limit counters (`REDIS_URL`; everything works without it)
- **Search**: tantivy index (`services/search_index.py`), built at startup
- **Accounts**: Steam OpenID sign-in (Discord OAuth for existing accounts), JWT session cookies; Twitch and Patreon are account links
- **Frontend**: Node 26, Next.js 16, TypeScript, Tailwind CSS, chart.js (`react-chartjs-2`), next-intl
- **Data**: game-entity JSON files in `data/{lang}/`, 15 languages (runs live in MongoDB)
- **Images**: Cloudflare R2 CDN (`cdn.spire-codex.com`) when `NEXT_PUBLIC_CDN_URL` is set
- **API docs**: `http://localhost:8000/docs`
- **Run locally**: `docker compose up --build`

## Key Conventions

- Use CSS variables for colors, not Tailwind color classes for character-specific UI
- Pages that fetch from the API default to `export const dynamic = "force-dynamic"`; only a few entity detail pages use `force-static` + `revalidate`
- API filter parameters always use English values regardless of display language
- `_key` fields (e.g., `rarity_key`, `type_key`) preserve English values for logic
- IDs are UPPER_SNAKE_CASE (e.g., `BURNING_BLOOD`, `IRON_WAVE`)
- Entity types use the `cleanId` function to strip prefixes like `CARD.`, `RELIC.`, `POTION.`

## Common Tasks

### Add a new page
1. Create `frontend/app/[locale]/{route}/page.tsx` (server component, metadata)
2. Create `frontend/app/[locale]/{route}/{Name}Client.tsx` (client component)
3. Add `export const dynamic = "force-dynamic"` to page.tsx
4. Add to `frontend/app/components/Navbar.tsx`
5. Add to `frontend/app/sitemap.ts`
6. UI strings go through next-intl, not hardcoded English

### Add a new API endpoint
1. Create `backend/app/routers/{name}.py`
2. Register in `backend/app/main.py` (import + `app.include_router`)
3. Add Pydantic models to `backend/app/models/schemas.py` if needed
4. Add TypeScript interfaces to `frontend/lib/api/types.ts`

### Fix a card/monster data issue
1. Check `data/eng/{entity}.json` for current values
2. Fix the parser in `backend/app/parsers/{entity}_parser.py`
3. Re-parse: `cd backend/app/parsers && python3 {entity}_parser.py`
4. Verify the fix in the JSON output

## File Map

```
backend/app/main.py                       → App entry, router registration, Redis-backed rate limiter
backend/app/routers/                      → API endpoints (one file per entity, plus runs, search, players, presence, replays, keys, auth connectors)
backend/app/models/schemas.py             → Pydantic models
backend/app/services/runs_db.py           → Runs DB dispatcher (Mongo when MONGO_URL set, else SQLite)
backend/app/services/runs_db_mongo.py      → MongoDB runs store
backend/app/services/lake_stats.py        → Read-only DuckDB lake access; every analytics surface serves from here
backend/app/services/cache.py             → Fail-safe Redis JSON cache
backend/app/services/rate_limit_config.py → Rate-limit tiers per API key, editable at runtime
backend/app/services/search_index.py      → tantivy site search index
backend/app/routers/auth.py                → User accounts (profile, runs, stats, personal-bests, competitive)
backend/app/services/run_entity_stats.py  → Codex Score: Bayesian-shrunk win rate per entity, S/A/B/C/D/F tier
backend/app/parsers/                      → C# → JSON parsers
backend/scripts/                          → One-off builders (search index, embeddings, run vectors) and Mongo repairs
lab/                                      → DuckDB lake: ingest cycle + stages (lab/run_stage.py)
frontend/app/[locale]/layout.tsx          → Locale layout (navbar, footer, providers, next-intl)
frontend/app/globals.css                  → CSS variables, theme
frontend/lib/api/                         → API client (endpoint.server.ts / endpoint.client.ts) + `types.ts` interfaces
frontend/lib/seo.ts                       → Title builders, SITE constants, `buildLanguageAlternates(path)` for bidirectional hreflang
frontend/lib/use-entity-scores.ts         → Hook - bulk Codex Scores per type via `/api/runs/scores/{type}`
frontend/i18n/                            → next-intl routing, request config, message loader (`lib/i18n-x*.ts`)
frontend/app/components/                  → Shared components (incl. ScoreBadge, EntityRunStats, TierList)
```

## Tests and lint

CI runs everything below except `npm test`; run that one yourself.

```bash
# frontend (Node >=26)
cd frontend && npm ci
npm run lint            # eslint
npx tsc --noEmit        # type-check
npm run format:check    # prettier
npm test                # vitest run (not in CI yet)

# backend (Python 3.12)
cd backend && pip install -r requirements.txt pytest
ruff check app/ && ruff format --check app/
python -m pytest -q
```

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) - full system architecture
- [DATA_GUIDE.md](DATA_GUIDE.md) - data structure and parsing
- [API_REFERENCE.md](API_REFERENCE.md) - complete API documentation
