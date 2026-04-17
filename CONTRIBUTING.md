# Contributing to Spire Codex

Thanks for your interest in contributing! This project is open to community contributions — bug fixes, data corrections, new features, and improvements are all welcome.

## Getting Started

1. **Fork the repo** on [GitHub](https://github.com/ptrlrd/spire-codex)
2. **Clone your fork** locally
3. **Set up the dev environment** (see below)
4. **Create a branch** for your changes (never commit directly to `main`)
5. **Submit a PR** against `main` — CI will run lint, type-check, format check, and secret scanning automatically
6. **Once approved and merged**, CI builds Docker images and deploys to production

## Dev Environment

### Prerequisites
- Docker

### Running Locally
```bash
docker compose up --build
```

Backend runs at `http://localhost:8000`, frontend at `http://localhost:3000`.

## Project Structure

```
backend/          Python FastAPI backend
  app/
    routers/      API endpoints
    services/     Data loading, SQLite runs DB
    parsers/      C# source → JSON parsers
    models/       Pydantic schemas
  static/images/  Game images (not committed)
frontend/         Next.js 16 + TypeScript + Tailwind
  app/            Pages and components
  lib/            API client, utilities, i18n
data/             Parsed JSON data (per-language, stable)
  changelogs/     Version changelogs
  ancient_pools.json
data-beta/        Parsed beta data (versioned: v0.102.0/, v0.103.0/, latest symlink)
tools/            Spine renderer, diff tool, deploy script
```

## What to Contribute

### Bug Reports
- Use the **Submit Feedback** button on the site, or open a GitHub issue
- Include the URL, what you expected, and what you saw
- Screenshots help and if you're experiencing a bug provide the exact steps you took

### Data Corrections
If a card description, damage value, or relic effect is wrong:
- Check the parsed JSON in `data/eng/` first
- If the data is wrong, the fix is usually in `backend/app/parsers/`
- The parsers extract data from decompiled C# in `extraction/decompiled/` (not committed — see README for extraction instructions)

### Frontend Changes
- Pages are in `frontend/app/` using Next.js App Router
- Components are in `frontend/app/components/`
- API client and types are in `frontend/lib/api.ts`
- `fetch-cache.ts` handles version-aware API calls (beta multi-version support) — all `cachedFetch` calls automatically get `&version=X` appended on the beta site
- Colors use CSS variables defined in `frontend/app/globals.css` — character colors are sampled from the game's energy icons

### New API Endpoints
- Routers go in `backend/app/routers/`
- Register them in `backend/app/main.py`
- Pydantic models in `backend/app/models/schemas.py`

### Guides
- Guides are markdown files in `data/guides/` with YAML frontmatter
- Parser at `backend/app/parsers/guide_parser.py` converts to `data/guides.json`
- Supports `[[Card Name]]` tooltip syntax (rendered via the tooltip widget)
- Submissions go through Discord webhook — reviewer creates the `.md` file
- Author social links (website, Bluesky, Twitter, Twitch) shown at bottom of guide

### Run Data / Meta
- Run submission and stats use SQLite (`data/runs.db`, not committed)
- Schema and queries are in `backend/app/services/runs_db.py`
- The meta page is at `frontend/app/meta/`

### Game Mechanics
- Static content pages at `frontend/app/mechanics/`
- 27 individual SEO pages at `/mechanics/[slug]`
- Section metadata in `frontend/app/mechanics/sections.ts`
- Content components in `frontend/app/mechanics/[slug]/MechanicContent.tsx`

## Changelog Retention

Files under `data/changelogs/` are the **only durable record of per-version
data history** — every entity-detail page reads them through `/api/history/`
to render its version-history rail. Once a tag's changelog is in `main`, it
is **write-once**. CI (`.github/workflows/changelog-guard.yml`) blocks any
PR that modifies or deletes an existing file under `data/changelogs/`.

**Adding a new tag** — always allowed:

```bash
# After parsing the new game data into data/eng/...
python3 tools/diff_data.py vPREV --format json \
  --game-version NEW --date YYYY-MM-DD --title "Update title"
# Hand-edit data/changelogs/NEW.json to add `features`, `fixes`,
# `api_changes` arrays. Commit + PR.
```

The PR shows `A data/changelogs/NEW.json` → guard passes.

**Editing an existing changelog** — requires the `changelog-edit-approved`
label. Legitimate cases:

- Typo / metadata fix in `title`, `date`, etc.
- Re-running `diff_data.py` against a tag (e.g. after fixing a parser bug
  that produced incorrect values). Hand-curated `features` / `fixes` /
  `api_changes` are preserved through regen — `diff_data.py` merges them
  back in if the file already exists.
- One-time format normalization across all historical changelogs.

Add the label on the GitHub PR page — the check re-runs on label change
and turns green. The bar isn't "you can't edit", it's "you must consciously
say you meant to."

**What this protects against**

- Regen-by-accident (running `diff_data.py vWRONG_TAG` and silently
  overwriting last month's release notes)
- Merge-conflict resolutions that drop a hand-curated section
- Scripts that loop over `data/changelogs/*.json` and rewrite them

The changelog files survive in git history, but the guard catches the
mistake at PR review rather than after-the-fact.

## Code Style

- **Python**: Standard formatting, type hints where practical
- **TypeScript**: Strict mode, prefer `const`, use our CSS variables for colors
- **No unnecessary dependencies**: Keep it lean
- **No AI-generated comments**: Don't add docstrings or comments to code you didn't change

## Colors

We use game-accurate colors sampled from the actual game assets. Don't use generic Tailwind colors for character-specific UI:

| Character   | Color     | Source            |
|-------------|-----------|-------------------|
| Ironclad    | `#d53b27` | Energy icon       |
| Silent      | `#23935b` | Energy icon       |
| Defect      | `#3873a9` | Energy icon       |
| Necrobinder | `#bf5a85` | Energy icon       |
| Regent      | `#f07c1e` | Energy icon       |

These are defined as CSS variables (`--color-ironclad`, etc.) in `globals.css`.

## Localization

- Game entity data (names, descriptions) comes from the game's localization files in 14 languages
- UI chrome translations are in `frontend/lib/ui-translations.ts`
- All parsers run per-language via `backend/app/parsers/parse_all.py`
- Filter parameters always use English values regardless of display language

## Testing Your Changes

```bash
docker compose up --build
```

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`

## Community

- **Discord**: [discord.gg/xMsTBeh](https://discord.gg/xMsTBeh) — discuss changes before big PRs
- **Showcase**: Built something with the API? Share it in Discord and we'll add it to `/showcase`

## Reference Docs

- **[Architecture](contributing/ARCHITECTURE.md)** — how the project is structured, backend/frontend patterns, color system, Spine rendering
- **[Data Guide](contributing/DATA_GUIDE.md)** — what data is parsed, file structure, parsing commands, rich text tags, merchant pricing
- **[API Reference](contributing/API_REFERENCE.md)** — all endpoints with filters and descriptions

## AI Tools and IDE
- This project is OK with using AI tools and assistance via the IDE. It's up to you to validate that the fix works and read the code you're submitted. Code that is not tested or validated will be denied.
- The `contributing/` folder includes sample Claude & Codex files that you can use as context.
- Ideally I would prefer to keep AI files within the contributing folder.

## License

This project is for educational purposes. Game data belongs to Mega Crit Games.
