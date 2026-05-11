# Spire Codex — Frontend

Next.js 16 frontend for Spire Codex, a Slay the Spire 2 database.

## Setup

```bash
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Runs at **http://localhost:3000**. Requires the backend running on port 8000.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home — entity counts, category cards, character links |
| `/cards` | Filterable card grid with upgrade toggle and beta art |
| `/cards/[id]` | Card detail — stats, upgrade info, image |
| `/characters` | Character overview grid |
| `/characters/[id]` | Character detail — stats, starting deck/relics, quotes, NPC dialogues |
| `/relics` | Filterable relic grid |
| `/relics/[id]` | Relic detail with rich text |
| `/monsters` | Monster grid with Spine-rendered sprites |
| `/monsters/[id]` | Monster detail — HP, moves, damage, ascension scaling |
| `/potions` | Filterable potion grid (rarity, character pool) |
| `/potions/[id]` | Potion detail |
| `/enchantments` | Enchantments with card type filter |
| `/enchantments/[id]` | Enchantment detail |
| `/encounters` | Encounters by act/room type |
| `/encounters/[id]` | Encounter detail — monster lineup, room type |
| `/events` | Multi-page event trees with expandable choices |
| `/events/[id]` | Event detail — pages, options, Ancient dialogue |
| `/powers` | Buffs, debuffs with type/stack filters |
| `/timeline` | Epoch progression with era grouping |
| `/reference` | Keywords, intents, orbs, afflictions, modifiers, achievements, acts, ascensions |
| `/images` | Browsable game assets with ZIP download |
| `/changelog` | Data diffs between game updates |
| `/about` | Project info, live stats, pipeline visualization |
| `/tier-list` | Codex Score tier-list hub (cards / relics / potions) |
| `/tier-list/[type]` | S → F tier rows for one entity type, sourced from `/api/runs/scores/{type}` |
| `/leaderboards/scoring` | Codex Score methodology — Bayesian shrinkage, prior weight, tier cutoffs |
| `/news` | Mirrored Steam announcements feed |
| `/news/[gid]` | Single Steam announcement — sanitized BBCode body, NewsArticle JSON-LD |
| `/runs/[hash]` | Shared run — in-game-style summary with "by {username}" link |

## Key Components

- **`RichDescription.tsx`** — Tokenizer + tree builder for nested Godot BBCode tags (colors, effects, icons, placeholders)
- **`SearchFilter.tsx`** — Reusable search bar + dropdown filters
- **`GlobalSearch.tsx`** — Press `.` anywhere to search across all categories
- **`CardGrid.tsx`** — Card grid with inline icons, upgrade rendering
- **`JsonLd.tsx`** — Server component rendering `<script type="application/ld+json">` blocks
- **`Navbar.tsx`** — Navigation with search trigger
- **`Footer.tsx`** — Footer with feedback modal
- **`ScoreBadge.tsx`** — S/A/B/C/D/F tier pill (sm/md/lg)
- **`EntityRunStats.tsx`** — Detail-page Stats tab — score hero badge + prose summary + recent runs links
- **`TierList.tsx`** — Visual S→F tier rows for `/tier-list/{cards,relics,potions}`

## SEO

Every page includes structured data and meta tags:

- **Home**: WebSite JSON-LD, keyword-rich title/description
- **List pages** (10): CollectionPage + BreadcrumbList JSON-LD, ItemList with entity names/URLs (first 50)
- **Detail pages** (7): Article + BreadcrumbList JSON-LD, per-entity OG images, Twitter `summary_large_image`
- **All pages**: Canonical URLs, global OG image fallback, `metadataBase` for relative URL resolution

### Sitemap

`app/sitemap.ts` uses `generateSitemaps()` to produce a sitemap index with 8 sub-sitemaps (~1,385 URLs):

- `/sitemap/static.xml` — 15 static pages (home, list pages, reference, etc.)
- `/sitemap/cards.xml` — ~576 card detail pages with image URLs
- `/sitemap/characters.xml` — 5 character pages with image URLs
- `/sitemap/relics.xml` — ~289 relic pages with image URLs
- `/sitemap/monsters.xml` — ~111 monster pages with image URLs
- `/sitemap/potions.xml` — ~63 potion pages with image URLs
- `/sitemap/powers.xml` — ~260 power pages with image URLs
- `/sitemap/events.xml` — ~66 event pages with image URLs

Sitemaps use ISR (`revalidate: 3600`) so they regenerate hourly at runtime — this is critical because the backend API isn't available during the Docker build. Entity entries include `images` for Google Image search indexing.

Shared utilities in `lib/seo.ts` (stripTags, SITE_URL, SITE_NAME, `buildLanguageAlternates(path)`) and `lib/jsonld.ts` (schema builders for BreadcrumbList, CollectionPage, Article, NewsArticle, WebSite).

**Title format (standardized)**: `"Slay the Spire 2 (sts2) {Page Title} | Spire Codex"`. Run pages use `"{username} - {char} - Ascension {N} {win/loss} - Slay the Spire 2 (sts2) | Spire Codex"`. "(sts2)" is inline so cross-locale `sts2 tier list` / `sts2 card list` queries match.

**Bidirectional hreflang**: English root pages emit alternates for all 13 locales + `x-default` via `buildLanguageAlternates(path)`. Fixes the GSC "Crawled - not indexed" cluster where Google was treating localized pages as duplicates without back-references.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend API URL |
| `NEXT_PUBLIC_SITE_URL` | `https://spire-codex.com` | Public site URL (used for canonical URLs, JSON-LD, OG tags) |
| `API_INTERNAL_URL` | (none) | Internal API URL for server-side fetches (Docker networking) |

## Docker

```bash
docker build -t spire-codex-frontend .
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=http://backend:8000 spire-codex-frontend
```

Output is set to `standalone` mode for Docker builds (see `next.config.ts`).
