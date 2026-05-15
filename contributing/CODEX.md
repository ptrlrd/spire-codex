# Codex / AI Assistant Context

This file provides context for AI coding assistants (GitHub Copilot, Cursor, Codex, etc.) working on Spire Codex.

## Project Summary

Spire Codex is a comprehensive database for Slay the Spire 2, built by reverse-engineering the game files. FastAPI backend + Next.js frontend. All game data is extracted from decompiled C# source code.

## Quick References

- **Backend**: Python 3.12, FastAPI, Pydantic, SQLite
- **Frontend**: Next.js 16, TypeScript, Tailwind CSS, recharts
- **Data**: JSON files in `data/{lang}/`, 14 languages
- **API docs**: `http://localhost:8000/docs`
- **Run locally**: `docker compose up --build`

## Key Conventions

- Use CSS variables for colors, not Tailwind color classes for character-specific UI
- All pages that fetch from API need `export const dynamic = "force-dynamic"`
- API filter parameters always use English values regardless of display language
- `_key` fields (e.g., `rarity_key`, `type_key`) preserve English values for logic
- IDs are UPPER_SNAKE_CASE (e.g., `BURNING_BLOOD`, `IRON_WAVE`)
- Entity types use the `cleanId` function to strip prefixes like `CARD.`, `RELIC.`, `POTION.`

## Common Tasks

### Add a new page
1. Create `frontend/app/{route}/page.tsx` (server component, metadata)
2. Create `frontend/app/{route}/{Name}Client.tsx` (client component)
3. Add `export const dynamic = "force-dynamic"` to page.tsx
4. Add to `frontend/app/components/Navbar.tsx`
5. Add to `frontend/app/sitemap.ts`

### Add a new API endpoint
1. Create `backend/app/routers/{name}.py`
2. Register in `backend/app/main.py` (import + `app.include_router`)
3. Add Pydantic models to `backend/app/models/schemas.py` if needed
4. Add TypeScript interfaces to `frontend/lib/api.ts`

### Fix a card/monster data issue
1. Check `data/eng/{entity}.json` for current values
2. Fix the parser in `backend/app/parsers/{entity}_parser.py`
3. Re-parse: `cd backend/app/parsers && python3 {entity}_parser.py`
4. Verify the fix in the JSON output

## File Map

```
backend/app/main.py                       → App entry, router registration, `_warm_run_entity_stats()` startup pre-warm
backend/app/routers/                      → API endpoints (one file per entity)
backend/app/models/schemas.py             → Pydantic models
backend/app/services/runs_db.py           → SQLite runs database
backend/app/services/run_entity_stats.py  → Codex Score — Bayesian-shrunk win rate per entity, S/A/B/C/D/F tier
backend/app/parsers/                      → C# → JSON parsers
frontend/app/layout.tsx                   → Root layout (navbar, footer, providers)
frontend/app/globals.css                  → CSS variables, theme
frontend/lib/api.ts                       → API client + TypeScript interfaces
frontend/lib/seo.ts                       → SITE_URL, SITE_NAME, `buildLanguageAlternates(path)` for bidirectional hreflang
frontend/lib/use-entity-scores.ts         → Hook — bulk Codex Scores per type via `/api/runs/scores/{type}`
frontend/lib/ui-translations.ts           → Manual UI translations
frontend/app/components/                  → Shared components (incl. ScoreBadge, EntityRunStats, TierList)
```

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — full system architecture
- [DATA_GUIDE.md](DATA_GUIDE.md) — data structure and parsing
- [API_REFERENCE.md](API_REFERENCE.md) — complete API documentation
