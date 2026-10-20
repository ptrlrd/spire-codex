# Spire Codex - Frontend

Next.js 16 frontend for Spire Codex, a Slay the Spire 2 database.

## Setup

```bash
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Needs Node >=24 (`engines` in `package.json`). Runs at **http://localhost:3000**. Requires the backend running on port 8000.

`predev` and `prebuild` run two generators first: `scripts/generate-site-pages.mjs` (the page inventory for global search, written to `lib/site-pages.json` and `data/site_pages.json`) and `scripts/generate-client-i18n.mjs` (`lib/i18n-server-only-keys.json`, the UI strings the browser catalog can skip).

## Scripts

| Script                 | What it does                            |
| ---------------------- | --------------------------------------- |
| `npm run dev`          | Dev server (after the generators)       |
| `npm run build`        | Production build                        |
| `npm run lint`         | ESLint                                  |
| `npm run format:check` | Prettier check; `npm run format` writes |
| `npm test`             | vitest                                  |

CI runs `lint`, `npx tsc --noEmit` and `format:check` on every PR; run `npm test` yourself before pushing.

## Pages

Every page lives under `app/[locale]/` (next-intl); English has no prefix and the other 14 languages get one (`/jpn/cards`). Old stats URLs like `/community-stats`, `/leaderboards/metrics` and `/charts` redirect through `lib/moved-pages.ts`.

| Route                                                                                  | Description                                                                                                     |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/`                                                                                    | Home - entity counts, category cards, character links                                                           |
| `/cards`                                                                               | Filterable card grid with upgrade toggle and beta art                                                           |
| `/cards/[id]`                                                                          | Card detail - stats, upgrade info, image                                                                        |
| `/characters`                                                                          | Character overview grid                                                                                         |
| `/characters/[id]`                                                                     | Character detail - stats, starting deck/relics, quotes, NPC dialogues                                           |
| `/relics`                                                                              | Filterable relic grid                                                                                           |
| `/relics/[id]`                                                                         | Relic detail with rich text                                                                                     |
| `/monsters`                                                                            | Monster grid with Spine-rendered sprites                                                                        |
| `/monsters/[id]`                                                                       | Monster detail - HP, moves, damage, ascension scaling                                                           |
| `/potions`                                                                             | Filterable potion grid (rarity, character pool)                                                                 |
| `/potions/[id]`                                                                        | Potion detail                                                                                                   |
| `/enchantments`                                                                        | Enchantments with card type filter                                                                              |
| `/enchantments/[id]`                                                                   | Enchantment detail                                                                                              |
| `/encounters`                                                                          | Encounters by act/room type                                                                                     |
| `/encounters/[id]`                                                                     | Encounter detail - monster lineup, room type                                                                    |
| `/events`                                                                              | Multi-page event trees with expandable choices                                                                  |
| `/events/[id]`                                                                         | Event detail - pages, options, Ancient dialogue                                                                 |
| `/powers`                                                                              | Buffs, debuffs with type/stack filters                                                                          |
| `/timeline`                                                                            | Epoch progression with era grouping                                                                             |
| `/reference`                                                                           | Keywords, intents, orbs, afflictions, modifiers, achievements, acts, ascensions                                 |
| `/images`                                                                              | Browsable game assets with ZIP download                                                                         |
| `/changelog`                                                                           | Data diffs between game updates                                                                                 |
| `/about`                                                                               | Project info, live stats, pipeline visualization                                                                |
| `/tier-list`                                                                           | Codex Score tier-list hub (cards / relics / potions)                                                            |
| `/tier-list/[type]`                                                                    | S → F tier rows for one entity type, sourced from `/api/runs/scores/{type}`                                     |
| `/stats`                                                                               | Community stats hub (cards/relics/potions metrics, encounters, decisions, charts), default cohort Standard Solo |
| `/stats/scoring`                                                                       | Codex Score methodology - Bayesian shrinkage, prior weight, tier cutoffs                                        |
| `/stats/chart-builder`                                                                 | Build a chart from any metrics table and save it to your profile                                                |
| `/charts/[id]`                                                                         | A saved chart, re-drawn from the live metrics API                                                               |
| `/leaderboards`                                                                        | Fastest Wins and Highest Ascension ladders                                                                      |
| `/top-players`                                                                         | Nightly Codex Elo board, from `/api/leaderboards/elo`                                                           |
| `/runs`                                                                                | Run browser over `/api/runs/list`                                                                               |
| `/runs/submit`                                                                         | Upload `.run` files                                                                                             |
| `/replays`                                                                             | Runs with a replay journal, from `/api/replays`                                                                 |
| `/runs/[hash]/replay`                                                                  | Replay viewer for one run                                                                                       |
| `/live`                                                                                | Live runs from the mod's presence heartbeats; `/live/[steamId]` is one player's run                             |
| `/players/[username]`                                                                  | Public player profile (stats + insights from `/api/players/{username}/*`)                                       |
| `/profile`, `/settings`                                                                | Signed-in profile and account settings                                                                          |
| `/tier-list-maker`                                                                     | Tier list maker, saved to the account (`/api/tierlists`) and shareable by handle                                |
| `/deck-builder`                                                                        | Deck builder                                                                                                    |
| `/seed-finder`                                                                         | Seed finder over `/api/runs/seed-finder`                                                                        |
| `/compare/[pair]`                                                                      | Character comparison pages                                                                                      |
| `/archetypes`                                                                          | Community deck archetypes                                                                                       |
| `/ancients`, `/badges`, `/unlocks`, `/mechanics/[slug]`, `/merchant`, `/guides/[slug]` | Reference and guide pages                                                                                       |
| `/mod`, `/overlay`, `/exporter`, `/knowledge-demon`, `/developers`                     | The Steam mod, Overwolf overlay, exporter, Discord bot and API docs pages                                       |
| `/news`                                                                                | Mirrored Steam announcements feed; `/news/codex` is site news                                                   |
| `/news/[...slug]`                                                                      | Single news article: sanitized BBCode body, NewsArticle JSON-LD                                                 |
| `/runs/[hash]`                                                                         | Shared run - in-game-style summary with "by {username}" link                                                    |

## Key Components

- **`RichDescription.tsx`** - Tokenizer + tree builder for nested Godot BBCode tags (colors, effects, icons, placeholders)
- **`SearchFilter.tsx`** - Reusable search bar + dropdown filters
- **`GlobalSearch.tsx`** - Press `.` anywhere to search across all categories
- **`CardGrid.tsx`** - Card grid with inline icons, upgrade rendering
- **`JsonLd.tsx`** - Server component rendering `<script type="application/ld+json">` blocks
- **`Navbar.tsx`** - Navigation with search trigger
- **`Footer.tsx`** - Footer with feedback modal
- **`ScoreBadge.tsx`** - S/A/B/C/D/F tier pill (sm/md/lg)
- **`EntityRunStats.tsx`** - Detail-page Stats tab - score hero badge + prose summary + recent runs links
- **`TierList.tsx`** - Visual S→F tier rows for `/tier-list/{cards,relics,potions}`

## SEO

Every page includes structured data and meta tags:

- **Home**: WebSite JSON-LD, keyword-rich title/description
- **List pages** (10): CollectionPage + BreadcrumbList JSON-LD, ItemList with entity names/URLs (first 50)
- **Detail pages** (7): Article + BreadcrumbList JSON-LD, per-entity OG images, Twitter `summary_large_image`
- **All pages**: Canonical URLs, global OG image fallback, `metadataBase` for relative URL resolution

### Sitemap

`app/sitemap.ts` is one flat `force-dynamic` sitemap at `/sitemap.xml`, rendered at request time (the backend API isn't available during the Docker build) and cached for about 30 minutes between crawler hits. It emits the static pages, every entity list and detail page, the tier-list filter pages and the localized copies, but only for routes that really exist under `app/[locale]/`: `LANG_LIST_ROUTES` and `LANG_DETAIL_ROUTES` in the file are the allowlist, so a new page needs an entry there to be crawled in other languages.

Shared utilities in `lib/seo.ts` (stripTags, SITE_URL, SITE_NAME, `buildLanguageAlternates(path)`) and `lib/jsonld.ts` (schema builders for BreadcrumbList, CollectionPage, Article, NewsArticle, WebSite).

**Title format (standardized)**: `"Slay the Spire 2 (sts2) {Page Title} | Spire Codex"`. Run pages use `"{username} - {char} - Ascension {N} {win/loss} - Slay the Spire 2 (sts2) | Spire Codex"`. "(sts2)" is inline so cross-locale `sts2 tier list` / `sts2 card list` queries match.

**Bidirectional hreflang**: English root pages emit alternates for all 14 other locales + `x-default` via `buildLanguageAlternates(path)`. Fixes the GSC "Crawled - not indexed" cluster where Google was treating localized pages as duplicates without back-references.

## Environment Variables

| Variable                       | Default                   | Description                                                                                           |
| ------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`          | `http://localhost:8000`   | Backend API URL                                                                                       |
| `NEXT_PUBLIC_SITE_URL`         | `https://spire-codex.com` | Public site URL (used for canonical URLs, JSON-LD, OG tags)                                           |
| `API_INTERNAL_URL`             | (none)                    | Internal API URL for server-side fetches (Docker networking)                                          |
| `NEXT_PUBLIC_CDN_URL`          | (none)                    | Image CDN base (`https://cdn.spire-codex.com`), used by `lib/image-url.ts`                            |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | (site default)            | Umami analytics website id, a build-time var (Dockerfile build ARG) read in `app/[locale]/layout.tsx` |

## Docker

```bash
docker build -t spire-codex-frontend .
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=http://backend:8000 spire-codex-frontend
```

Output is set to `standalone` mode for Docker builds (see `next.config.ts`).
