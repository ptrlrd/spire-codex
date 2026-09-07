import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import JsonLd from "@/app/components/JsonLd";
import { buildSoftwareApplicationJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import TinyCard, { TINY_CARD_POOL_COLOR, TINY_CARD_BANNER_COLOR } from "@/app/components/TinyCard";

const API_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://spire-codex.com";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Live tier caps from the admin-tunable config, so this table can't drift from
// what the limiter actually enforces. Falls back to the shipped defaults.
async function fetchRateLimits(): Promise<{ browse: string; tiers: Record<string, string> }> {
  const fallback = {
    browse: "300/minute",
    tiers: { general: "15/minute", registered: "60/minute", academia: "100/minute", paid: "120/minute" },
  };
  try {
    const res = await fetch(`${API_INTERNAL}/api/rate-limits`, { next: { revalidate: 300 } });
    if (!res.ok) return fallback;
    const d = await res.json();
    return { browse: d.browse || fallback.browse, tiers: { ...fallback.tiers, ...(d.tiers || {}) } };
  } catch {
    return fallback;
  }
}

function tierRows(t: TFn): { key: string; label: string; how: string }[] {
  return [
    { key: "general", label: t("No API key"), how: "" },
    { key: "registered", label: t("Registered User"), how: t("create one on your profile") },
    { key: "academia", label: t("Academia"), how: t("granted on request") },
    { key: "paid", label: t("Paid"), how: t("supporters") },
  ];
}

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/developers", title: t("Developer API & Tooltip Widget"), description: t("developers_meta_description") });
}

export default async function DevelopersPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const heading = pageHeading(locale, t("Developers"));
  const limits = await fetchRateLimits();
  const tiers = tierRows(t);
  const jsonLd = [
    buildSoftwareApplicationJsonLd(),
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Developers"), href: localePath(locale, "/developers") },
    ]),
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
        {heading}
      </h1>
      <p className="text-[var(--text-secondary)] mb-8">
        {t("Build tools, bots, and content with Spire Codex data. Everything is free and open.")}
      </p>

      {/* Tooltip Widget */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          {t("Tooltip Widget")}
        </h2>
        <p className="text-[var(--text-secondary)] mb-4">
          {t("Add Wowhead-style hoverable tooltips for cards, relics, and potions to any website. One script tag, zero dependencies.")}
        </p>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            {t("Installation")}
          </h3>
          <pre className="bg-[var(--bg-primary)] rounded-lg p-4 text-sm text-[var(--text-secondary)] overflow-x-auto">
            <code>{`<script src="${API_URL}/widget/spire-codex-tooltip.js"></script>`}</code>
          </pre>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            {t("Syntax")}
          </h3>
          <div className="space-y-2 text-sm">
            {[
              { syntax: "[[Strike]]", desc: t("Card tooltip (default type)") },
              { syntax: "[[card:Bash]]", desc: t("Card (explicit)") },
              { syntax: "[[relic:Burning Blood]]", desc: t("Relic") },
              { syntax: "[[potion:Fire Potion]]", desc: t("Potion") },
              { syntax: "[[character:Ironclad]]", desc: t("Character") },
              { syntax: "[[monster:Jaw Worm]]", desc: t("Monster") },
              { syntax: "[[power:Strength]]", desc: t("Power") },
              { syntax: "[[event:Neow]]", desc: t("Event") },
              { syntax: "[[encounter:Lagavulin]]", desc: t("Encounter") },
              { syntax: "[[enchantment:Sharp]]", desc: t("Enchantment") },
              { syntax: "[[keyword:Exhaust]]", desc: t("Keyword") },
              { syntax: "[[orb:Lightning]]", desc: t("Orb") },
              { syntax: "[[affliction:Bound]]", desc: t("Affliction") },
              { syntax: "[[achievement:Minimalist]]", desc: t("Achievement") },
            ].map((item) => (
              <div key={item.syntax} className="flex gap-4">
                <code className="text-[var(--accent-gold)] whitespace-nowrap">{item.syntax}</code>
                <span className="text-[var(--text-muted)]">{item.desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            {t("JavaScript API")}
          </h3>
          <div className="space-y-2 text-sm">
            <div>
              <code className="text-[var(--accent-gold)]">SpireCodex.scan()</code>
              <span className="text-[var(--text-muted)] ml-2">{t("Re-scan the page for new [[...]] patterns (for SPAs)")}</span>
            </div>
            <div>
              <code className="text-[var(--accent-gold)]">SpireCodex.scan(element)</code>
              <span className="text-[var(--text-muted)] ml-2">{t("Scan a specific DOM element")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Changelog Widget */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          {t("Changelog Widget")}
        </h2>
        <p className="text-[var(--text-secondary)] mb-4">
          {t("Embed a compact, interactive changelog viewer showing Spire Codex update history with version switching.")}
        </p>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            {t("Installation")}
          </h3>
          <pre className="bg-[var(--bg-primary)] rounded-lg p-4 text-sm text-[var(--text-secondary)] overflow-x-auto">
            <code>{`<div id="scx-changelog"></div>
<script src="${API_URL}/widget/spire-codex-changelog.js"></script>`}</code>
          </pre>
          <div className="space-y-2 text-sm mt-3">
            <div className="flex gap-4">
              <code className="text-[var(--accent-gold)] whitespace-nowrap">data-version=&quot;1.0.4&quot;</code>
              <span className="text-[var(--text-muted)]">{t("Show a specific version (default: latest)")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* REST API */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          {t("REST API")}
        </h2>
        <p className="text-[var(--text-secondary)] mb-4">
          {t("Full game database accessible via a public REST API. No authentication required: the per-IP website allowance covers browsing and casual calls, and keyless API usage gets the base rate below.")}{" "}
          {t("For scripts and tools, create an API key and send it as the X-API-Key header.")}{" "}
          <Link href="/profile" className="text-[var(--accent-gold)] hover:underline">{t("Create one on your profile page.")}</Link>{" "}
          {t("A key buckets your requests by identity instead of IP (stable across networks, never shared with other users behind the same NAT) and gives you usage tracking; its tier cap applies per endpoint. Responses carry X-RateLimit-Remaining / X-RateLimit-Reset so you can pace requests.")}
        </p>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            {t("Rate limits")}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-[var(--border-subtle)]">
                  <td className="py-2 pr-4 text-[var(--text-primary)]">{t("Website Traffic")}</td>
                  <td className="py-2 pr-4 font-mono text-[var(--accent-gold)]">{limits.browse}</td>
                  <td className="py-2 text-[var(--text-muted)]">{t("per IP")}</td>
                </tr>
                {tiers.map((tier) => (
                  <tr key={tier.key} className="border-b border-[var(--border-subtle)] last:border-0">
                    <td className="py-2 pr-4 text-[var(--text-primary)]">{tier.label}</td>
                    <td className="py-2 pr-4 font-mono text-[var(--accent-gold)]">{limits.tiers[tier.key]}</td>
                    <td className="py-2 text-[var(--text-muted)]">{tier.how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            {t("All caps count per endpoint: the table is your allowance on each route, not a global pool. A few heavy endpoints carry their own budgets that apply to every caller regardless of key (see the run export below; the language ZIP is 10/hour). Watch X-RateLimit-Remaining and back off on 429 (Retry-After is set).")}
          </p>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            {t("Bulk run export")}
          </h3>
          <pre className="bg-[var(--bg-primary)] rounded-lg p-4 text-sm text-[var(--text-secondary)] overflow-x-auto mb-3">
            <code>{`GET /api/runs/export?limit=1000&start=2026-06-01T00:00:00Z`}</code>
          </pre>
          <p className="text-sm text-[var(--text-secondary)] mb-2">
            {t("Streams official runs as JSONL, one run per line.")}
          </p>
          <div className="space-y-1.5 text-sm text-[var(--text-secondary)] mb-2">
            <div>
              <code className="text-xs bg-[var(--bg-primary)] px-1.5 py-0.5 rounded">limit</code>{" "}
              {t("Bounds the page; a full page returns a cursor for the next one.")}
            </div>
            <div>
              <code className="text-xs bg-[var(--bg-primary)] px-1.5 py-0.5 rounded">start</code> /{" "}
              <code className="text-xs bg-[var(--bg-primary)] px-1.5 py-0.5 rounded">end</code>{" "}
              {t("Restrict to a half-open submitted-at window. Keep them constant while paging; the cursor does not embed them.")}
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {t("This endpoint has its own budget of 120 credits per hour, shared by keyed and anonymous callers alike: a paginated request costs 1 credit, an unbounded pull (no limit) costs 60. Sustained syncing therefore works best as paginated pulls spaced ~30s apart; on 429, honor Retry-After and resume with the same cursor.")}
          </p>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            {t("Base URL")}
          </h3>
          <code className="text-[var(--accent-gold)]">{API_URL}</code>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            {t("Beta channel (unreleased content from the Steam beta branch): add this to any entity endpoint:")}{" "}
            <code className="text-[var(--text-secondary)]">?channel=beta</code>.{" "}
            {t("Current beta version:")}{" "}
            <code className="text-[var(--text-secondary)]">/api/beta/version</code>.{" "}
            {t("Full diff against main:")}{" "}
            <code className="text-[var(--text-secondary)]">/api/beta/diff</code>.
          </p>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            {t("Endpoints")}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {t("Full interactive docs (auto-generated from the backend, always current):")} <a href={`${API_URL}/docs`} className="text-[var(--accent-gold)] hover:underline">/docs</a>
          </p>
          {[
            {
              category: t("Entities"),
              endpoints: [
                { method: "GET", path: "/api/cards", desc: t("All cards (filter: color, type, rarity, keyword, tag, spawns, search)") },
                { method: "GET", path: "/api/cards/{id}", desc: t("Single card") },
                { method: "GET", path: "/api/characters", desc: t("All characters") },
                { method: "GET", path: "/api/characters/{id}", desc: t("Single character") },
                { method: "GET", path: "/api/relics", desc: t("All relics (filter: rarity, pool, ancient, search)") },
                { method: "GET", path: "/api/relics/{id}", desc: t("Single relic") },
                { method: "GET", path: "/api/potions", desc: t("All potions (filter: rarity, pool, search)") },
                { method: "GET", path: "/api/potions/{id}", desc: t("Single potion") },
                { method: "GET", path: "/api/monsters", desc: t("All monsters (filter: type, search)") },
                { method: "GET", path: "/api/monsters/{id}", desc: t("Single monster") },
                { method: "GET", path: "/api/powers", desc: t("All powers (filter: type, stack_type, search)") },
                { method: "GET", path: "/api/powers/{id}", desc: t("Single power") },
                { method: "GET", path: "/api/events", desc: t("All events (filter: type, act, search)") },
                { method: "GET", path: "/api/events/{id}", desc: t("Single event") },
                { method: "GET", path: "/api/encounters", desc: t("All encounters (filter: room_type, act, search)") },
                { method: "GET", path: "/api/encounters/{id}", desc: t("Single encounter") },
                { method: "GET", path: "/api/enchantments", desc: t("All enchantments") },
                { method: "GET", path: "/api/enchantments/{id}", desc: t("Single enchantment") },
                { method: "GET", path: "/api/keywords", desc: t("Card keywords") },
                { method: "GET", path: "/api/keywords/{id}", desc: t("Single keyword") },
                { method: "GET", path: "/api/intents", desc: t("All intent types") },
                { method: "GET", path: "/api/intents/{id}", desc: t("Single intent") },
                { method: "GET", path: "/api/orbs", desc: t("All orb types") },
                { method: "GET", path: "/api/orbs/{id}", desc: t("Single orb") },
                { method: "GET", path: "/api/afflictions", desc: t("Affliction types") },
                { method: "GET", path: "/api/afflictions/{id}", desc: t("Single affliction") },
                { method: "GET", path: "/api/modifiers", desc: t("Custom mode modifiers") },
                { method: "GET", path: "/api/modifiers/{id}", desc: t("Single modifier") },
                { method: "GET", path: "/api/achievements", desc: t("All achievements") },
                { method: "GET", path: "/api/achievements/{id}", desc: t("Single achievement") },
                { method: "GET", path: "/api/badges", desc: t("All badges") },
                { method: "GET", path: "/api/badges/{id}", desc: t("Single badge") },
                { method: "GET", path: "/api/epochs", desc: t("All epochs") },
                { method: "GET", path: "/api/epochs/{id}", desc: t("Single epoch") },
                { method: "GET", path: "/api/stories", desc: t("All stories") },
                { method: "GET", path: "/api/stories/{id}", desc: t("Single story") },
                { method: "GET", path: "/api/acts", desc: t("All acts") },
                { method: "GET", path: "/api/acts/{id}", desc: t("Single act") },
                { method: "GET", path: "/api/ascensions", desc: t("All ascension levels") },
                { method: "GET", path: "/api/ascensions/{id}", desc: t("Single ascension") },
                { method: "GET", path: "/api/glossary", desc: t("All glossary terms") },
                { method: "GET", path: "/api/glossary/{id}", desc: t("Single term") },
              ],
            },
            {
              category: t("Aggregations & Lookups"),
              endpoints: [
                { method: "GET", path: "/api/stats", desc: t("Entity counts") },
                { method: "GET", path: "/api/ancient-pools", desc: t("All ancient relic pools with conditions") },
                { method: "GET", path: "/api/ancient-pools/{id}", desc: t("Pools for a single ancient") },
                { method: "GET", path: "/api/unlocks", desc: t("Unlockable entities grouped by type with epoch context") },
                { method: "GET", path: "/api/history/{entity_type}/{entity_id}", desc: t("Per-entity version history from changelogs") },
                { method: "GET", path: "/api/update-history/{entity_type}/{entity_id}", desc: t("Per-entity game-patch update history") },
                { method: "GET", path: "/api/names/{entity_type}/{entity_id}", desc: t("Cross-language name lookup for an entity") },
                { method: "GET", path: "/api/search", desc: t("Unified site search across entities, reference entries, mechanics, guides, and news (q, lang)") },
                { method: "GET", path: "/api/changelogs", desc: t("All changelogs") },
                { method: "GET", path: "/api/changelogs/recent-additions", desc: t("Newest entities surfaced for the homepage band") },
                { method: "GET", path: "/api/changelogs/{tag}", desc: t("Single changelog by tag (e.g. v1.0.20)") },
                { method: "GET", path: "/api/news", desc: t("Steam announcements (mirrored locally for permanence)") },
                { method: "GET", path: "/api/news/{gid}", desc: t("Single news article with sanitized body") },
                { method: "GET", path: "/api/versions", desc: t("Available beta data versions for the version picker") },
              ],
            },
            {
              category: t("Community & Submissions"),
              endpoints: [
                { method: "GET", path: "/api/guides", desc: t("All guides (filter: category, difficulty, tag, search)") },
                { method: "GET", path: "/api/guides/{slug}", desc: t("Single guide with rendered markdown") },
                { method: "POST", path: "/api/guides", desc: t("Submit a guide (Discord webhook, rate-limited)") },
                { method: "POST", path: "/api/runs", desc: t("Submit a run for community stats and leaderboards") },
                { method: "POST", path: "/api/runs/claim", desc: t("Attach a username to previously-submitted runs by hash") },
                { method: "GET", path: "/api/runs/list", desc: t("Browse submitted runs with filters and pagination (incl. ascension_min/ascension_max and winrate_min/winrate_max by submitter win rate — the content brackets)") },
                { method: "GET", path: "/api/runs/leaderboard", desc: t("Run leaderboards (fastest, highest_ascension); filter by character, players, game_mode, ascension_min, winrate_min (the content brackets)") },
                { method: "GET", path: "/api/runs/shared/{run_hash}", desc: t("Single submitted run by hash (rate-limited)") },
                { method: "GET", path: "/api/runs/stats", desc: t("Aggregate community stats (filter by character, ascension, username)") },
                { method: "GET", path: "/api/runs/community-stats", desc: t("Fun community datasets: event decision splits, deadliest encounters, win rates by ascension/character, records") },
                { method: "GET", path: "/api/charts/meta", desc: t("Chart registry for the /charts explorer: available charts, filters, splits, and run stats") },
                { method: "GET", path: "/api/charts/{chart}", desc: t("One pre-aggregated chart (filter: players, ascension, game_mode, username, split, bracket=a10|wr30|wr50|wr75 on frame charts, plus per-chart params)") },
                { method: "GET", path: "/api/beta/diff", desc: t("What the current beta adds, changes, and removes per entity type; powers every BETA label") },
                { method: "GET", path: "/api/beta/version", desc: t("The current beta version") },
                { method: "GET", path: "/api/runs/scores/{type}", desc: t("Codex Score + Codex Elo per entity (cards/relics/potions); ?bracket=a10|wr30|wr50|wr75 grades within a content bracket (the in-game mod sends the same via ?stat_filter=a10|a10_wr30|a10_wr50|a10_wr75); relics accept ?act=1|2|3 to rank by acquisition act; ?character= switches to that character's slice (entries gain a scope field)") },
                { method: "GET", path: "/api/runs/leaderboard/seed-rank", desc: t("Seed + global standing for one seed (?seed=&steam_id=); rank fields are null without a winning run") },
                { method: "POST", path: "/api/auth/steam/ticket", desc: t("Exchange a Steamworks web auth ticket for the site JWT (in-game silent sign-in); 503 until the server has a Steam key") },
                { method: "GET", path: "/api/runs/metrics/{type}", desc: t("Dense metrics table: Codex Score, Codex Elo, win rate, pick rate, per-act splits; ?bracket=all|solo|2p|3p|4p|a10|daily|custom|wr30|wr50|wr75 (the content brackets)") },
                { method: "GET", path: "/api/runs/versions", desc: t("Distinct game build IDs that have submitted runs") },
                { method: "POST", path: "/api/feedback", desc: t("Submit feedback (Discord webhook)") },
              ],
            },
            {
              category: t("Bulk Downloads"),
              endpoints: [
                { method: "GET", path: "/api/runs/export", desc: t("JSONL stream of official runs (limit/start/end/cursor pagination; own 120-credits-per-hour budget - see Bulk run export above)") },
                { method: "GET", path: "/api/exports/{lang}", desc: t("ZIP of all entity JSON for one language (10/hour)") },
                { method: "GET", path: "/api/images", desc: t("Image gallery categories") },
                { method: "GET", path: "/api/images/search", desc: t("Search images by filename") },
                { method: "GET", path: "/api/images/game/{version}/{category}/browse", desc: t("Paged folder browsing of a full asset dump (path, offset, limit)") },
                { method: "GET", path: "/api/images/game/{version}/{category}/download", desc: t("ZIP of one dump folder's files (path; capped at 2000 files)") },
              ],
            },
          ].map((group) => (
            <div key={group.category} className="mb-4 last:mb-0">
              <h4 className="text-xs font-semibold text-[var(--accent-gold)] uppercase tracking-wider mb-2">
                {group.category}
              </h4>
              <div className="space-y-1.5 text-sm font-mono">
                {group.endpoints.map((ep) => (
                  <div key={ep.path} className="flex items-start gap-3">
                    <span className={`${ep.method === "POST" ? "text-info" : "text-success"} w-10 flex-shrink-0`}>{ep.method}</span>
                    <span className="text-[var(--text-primary)]">{ep.path}</span>
                    <span className="text-[var(--text-muted)] font-sans text-xs ml-auto text-right">{ep.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            {t("Multi-Language")}
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mb-2">
            {t("Add this query parameter to any endpoint:")} <code className="text-[var(--accent-gold)]">?lang=jpn</code>. {t("15 languages supported:")}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            eng, deu, esp, fra, ita, jpn, kor, pol, ptb, rus, spa, tha, tur, zhs, zht
          </p>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            {t("Quick Start")}
          </h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-1">cURL</p>
              <pre className="bg-[var(--bg-primary)] rounded-lg p-3 text-sm text-[var(--text-secondary)] overflow-x-auto">
                <code>{`curl ${API_URL}/api/cards?color=ironclad&rarity=Rare`}</code>
              </pre>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-1">Python</p>
              <pre className="bg-[var(--bg-primary)] rounded-lg p-3 text-sm text-[var(--text-secondary)] overflow-x-auto">
                <code>{`import requests
cards = requests.get("${API_URL}/api/cards", params={"color": "ironclad"}).json()
for card in cards:
    print(f"{card['name']} - {card['type']} ({card['rarity']})")`}</code>
              </pre>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-1">JavaScript</p>
              <pre className="bg-[var(--bg-primary)] rounded-lg p-3 text-sm text-[var(--text-secondary)] overflow-x-auto">
                <code>{`const res = await fetch("${API_URL}/api/relics?pool=ironclad");
const relics = await res.json();
console.log(relics.map(r => r.name));`}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Tiny Card Sprite */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          {t("Tiny Card Sprite")}
        </h2>
        <p className="text-[var(--text-secondary)] mb-4">
          {t("Reproduce the game's in-run card thumbnail (used on the Run History / Game Over screens) in any web project. Six PNG layers composited with CSS mask-image, no canvas, no WebGL, just tinted sprites.")}{" "}
          {t("Colors come straight from the decompiled game code:")}{" "}
          <code className="text-[var(--accent-gold)]">NTinyCard</code>,{" "}
          <code className="text-[var(--accent-gold)]">CardPoolModel.DeckEntryCardColor</code>.
        </p>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            {t("Preview")}
          </h3>
          <div className="flex flex-wrap items-end gap-6">
            {[
              { color: "ironclad", type: "Attack", rarity: "Common", label: "Ironclad / Attack / Common" },
              { color: "silent", type: "Skill", rarity: "Uncommon", label: "Silent / Skill / Uncommon" },
              { color: "defect", type: "Power", rarity: "Rare", label: "Defect / Power / Rare" },
              { color: "necrobinder", type: "Skill", rarity: "Rare", label: "Necrobinder / Skill / Rare" },
              { color: "regent", type: "Attack", rarity: "Uncommon", label: "Regent / Attack / Uncommon" },
              { color: "curse", type: "Curse", rarity: "Curse", label: "Curse" },
              { color: "event", type: "Skill", rarity: "Event", label: "Event" },
              { color: "quest", type: "Skill", rarity: "Quest", label: "Quest" },
            ].map((c) => (
              <div key={c.label} className="flex flex-col items-center gap-1.5">
                <TinyCard color={c.color} type={c.type} rarity={c.rarity} className="w-16 h-16" />
                <span className="text-[10px] text-[var(--text-muted)] text-center leading-tight">
                  {c.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            {t("Sprite assets")}
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            {t("All 10 PNGs are served with CORS enabled, drop the base URL in front of each filename. Each sprite is 128×128, RGBA, white-on-transparent (meant to be tinted via CSS).")}
          </p>
          <pre className="bg-[var(--bg-primary)] rounded-lg p-4 text-xs text-[var(--text-secondary)] overflow-x-auto">
            <code>{`${API_URL}/static/images/ui/run_history_card/
  card_back.png           ← tinted by pool
  desc_box.png            ← dark description area (render at 25% opacity)
  attack_portrait.png     ← portrait per card type
  attack_portrait_shadow.png
  skill_portrait.png
  skill_portrait_shadow.png
  power_portrait.png
  power_portrait_shadow.png
  banner_shadow.png       ← render at 60% opacity
  banner.png              ← tinted by rarity`}</code>
          </pre>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            {t("Pool (card back) colors")}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {t("Source:")} <code>CardPoolModel.DeckEntryCardColor</code>.{" "}
            {t("Match these against the {field} field returned by {endpoint}.", { field: "color", endpoint: "/api/cards" })}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-sm font-mono">
            {Object.entries(TINY_CARD_POOL_COLOR).map(([pool, hex]) => (
              <div key={pool} className="flex items-center gap-2">
                <span
                  className="inline-block w-4 h-4 rounded border border-[var(--border-subtle)]"
                  style={{ backgroundColor: hex }}
                />
                <span className="text-[var(--text-primary)] w-24">{pool}</span>
                <span className="text-[var(--text-muted)]">{hex}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            {t("Rarity (banner) colors")}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {t("Source:")} <code>NTinyCard.GetBannerColor</code>.{" "}
            {t("Match against the {field} field.", { field: "rarity" })}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-sm font-mono">
            {Object.entries(TINY_CARD_BANNER_COLOR).map(([rarity, hex]) => (
              <div key={rarity} className="flex items-center gap-2">
                <span
                  className="inline-block w-4 h-4 rounded border border-[var(--border-subtle)]"
                  style={{ backgroundColor: hex }}
                />
                <span className="text-[var(--text-primary)] w-24">{rarity}</span>
                <span className="text-[var(--text-muted)]">{hex}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            {t("Minimal HTML + CSS recipe")}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {t("Portrait filename:")} <code>attack</code> = {t("Attack cards")}, <code>power</code> = {t("Power cards")},
            {" "}<code>skill</code> = {t("everything else (Skill, Status, Curse, …)")}
          </p>
          <pre className="bg-[var(--bg-primary)] rounded-lg p-4 text-xs text-[var(--text-secondary)] overflow-x-auto">
            <code>{`<div class="tiny-card" style="
  --back: #D62000;   /* pool color, Ironclad */
  --banner: #FFDA36; /* rarity color, Rare */
  position: relative;
  width: 64px;
  height: 64px;
">
  <!-- 1. card back, tinted by pool -->
  <div class="layer" style="
    background-color: var(--back);
    mask: url(${API_URL}/static/images/ui/run_history_card/card_back.png) center/contain no-repeat;
    -webkit-mask: url(${API_URL}/static/images/ui/run_history_card/card_back.png) center/contain no-repeat;
  "></div>

  <!-- 2. description box -->
  <img class="layer" src="${API_URL}/static/images/ui/run_history_card/desc_box.png" style="opacity:.25">

  <!-- 3. portrait shadow + portrait (attack/skill/power) -->
  <img class="layer" src="${API_URL}/static/images/ui/run_history_card/attack_portrait_shadow.png">
  <img class="layer" src="${API_URL}/static/images/ui/run_history_card/attack_portrait.png"
       style="filter: brightness(.95) sepia(.15)">

  <!-- 4. banner shadow + banner tinted by rarity -->
  <img class="layer" src="${API_URL}/static/images/ui/run_history_card/banner_shadow.png" style="opacity:.6">
  <div class="layer" style="
    background-color: var(--banner);
    mask: url(${API_URL}/static/images/ui/run_history_card/banner.png) center/contain no-repeat;
    -webkit-mask: url(${API_URL}/static/images/ui/run_history_card/banner.png) center/contain no-repeat;
  "></div>
</div>

<style>
  .tiny-card .layer {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    object-fit: contain;
  }
</style>`}</code>
          </pre>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            {t("React component")}
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            {t("Drop-in React version. Source:")}{" "}
            <a
              href="https://github.com/ptrlrd/spire-codex/blob/main/frontend/app/components/TinyCard.tsx"
              className="text-[var(--accent-gold)] hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              TinyCard.tsx
            </a>
          </p>
          <pre className="bg-[var(--bg-primary)] rounded-lg p-4 text-xs text-[var(--text-secondary)] overflow-x-auto">
            <code>{`import TinyCard from "./TinyCard";

// Feed in the three fields from /api/cards:
<TinyCard color="ironclad" type="Attack" rarity="Rare" className="w-16 h-16" />`}</code>
          </pre>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mt-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            {t("Full card images")}
          </h3>
          <p className="text-[var(--text-secondary)] mb-3">
            {t("Every card from {endpoint} includes two ready-to-use URLs for the full game-rendered card (frame, art, banner, and text, exactly as it looks in-game). Ancient cards are animated webps.", { endpoint: "/api/cards" })}
          </p>
          <ul className="text-sm text-[var(--text-secondary)] space-y-1.5 mb-3">
            <li>
              <code className="text-[var(--accent-gold)]">image_url_card</code> —{" "}
              {t("The base card. null for the one card with no render (mad_science); fall back to image_url (the portrait art) there.")}
            </li>
            <li>
              <code className="text-[var(--accent-gold)]">image_url_card_upg</code> —{" "}
              {t("The upgraded card. null when the card has no upgrade.")}
            </li>
          </ul>
          <pre className="bg-[var(--bg-primary)] rounded-lg p-4 text-xs text-[var(--text-secondary)] overflow-x-auto">
            <code>{`// e.g. /api/cards/bash
{
  "id": "BASH",
  "image_url":          "/static/images/cards/bash.webp",  // portrait art
  "image_url_card":     "https://cdn.spire-codex.com/cards-full/stable/bash.webp",
  "image_url_card_upg": "https://cdn.spire-codex.com/cards-full/stable/bash_upg.webp"
}`}</code>
          </pre>
          <p className="text-sm text-[var(--text-muted)] mt-3">
            {t("Localized renders live under a language subfolder, for example:")}{" "}
            <code>cards-full/stable/jpn/bash.webp</code>. {t("All 15 languages are available.")}
          </p>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mt-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            {t("Enchanted card renders")}
          </h3>
          <p className="text-[var(--text-secondary)] mb-3">
            {t("Every card is also rendered with each enchantment it can legally take, exactly as the in-game enchant preview draws it (badge, amount, and added card text). The URLs follow one pattern:")}
          </p>
          <pre className="bg-[var(--bg-primary)] rounded-lg p-4 text-xs text-[var(--text-secondary)] overflow-x-auto">
            <code>{`https://cdn.spire-codex.com/cards-full/stable/ench/{enchantment}/{card}.webp        // English, base
https://cdn.spire-codex.com/cards-full/stable/ench/{enchantment}/{card}_upg.webp    // English, upgraded
https://cdn.spire-codex.com/cards-full/stable/{lang}/ench/{enchantment}/{card}.webp // localized

// e.g. Anger with Corrupted, in Japanese:
https://cdn.spire-codex.com/cards-full/stable/jpn/ench/corrupted/anger.webp`}</code>
          </pre>
          <ul className="text-sm text-[var(--text-secondary)] space-y-1.5 mt-3">
            <li>
              <code className="text-[var(--accent-gold)]">{`{enchantment}`}</code> /{" "}
              <code className="text-[var(--accent-gold)]">{`{card}`}</code>:{" "}
              {t("lowercase ids from /api/enchantments and /api/cards (e.g. sharp, corrupted, sown).")}
            </li>
            <li>
              {t("Only valid card and enchantment combinations exist (the export uses the game's own applicability rules), so an invalid combo is a 404. The card_type / applicable_to fields on /api/enchantments describe which cards qualify.")}
            </li>
            <li>
              {t("Base and upgraded variants exist for every combo, in all 14 languages, with the enchantment text fully localized.")}
            </li>
          </ul>
        </div>
      </section>

      {/* Data Exports */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          {t("Data Exports")}
        </h2>
        <p className="text-[var(--text-secondary)] mb-4">
          {t("Download all game data as a single ZIP archive. Each archive contains JSON files for every entity type (cards, relics, monsters, powers, and more).")}
        </p>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <a
            href={`${API_URL}/api/exports/eng`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent-gold)]/10 border border-[var(--accent-gold)]/30 rounded-lg text-[var(--accent-gold)] hover:bg-[var(--accent-gold)]/20 transition-colors font-medium"
          >
            {t("Download English Data (ZIP)")}
          </a>
          <p className="text-sm text-[var(--text-muted)] mt-4">
            {t("15 languages available. Example downloads:")}{" "}
            {[
              { code: "jpn", label: t("Japanese") },
              { code: "kor", label: t("Korean") },
              { code: "zhs", label: t("Chinese") },
              { code: "fra", label: t("French") },
              { code: "deu", label: t("German") },
            ].map((lang, i) => (
              <span key={lang.code}>
                {i > 0 && ", "}
                <a
                  href={`${API_URL}/api/exports/${lang.code}`}
                  className="text-[var(--accent-gold)] hover:underline"
                >
                  {lang.label}
                </a>
              </span>
            ))}
          </p>
        </div>
      </section>

      {/* Interactive Docs */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          {t("Interactive API Docs")}
        </h2>
        <p className="text-[var(--text-secondary)] mb-4">
          {t("Full Swagger/OpenAPI documentation with try-it-out functionality.")}
        </p>
        <a
          href={`${API_URL}/docs`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg text-[var(--accent-gold)] hover:border-[var(--border-accent)] transition-colors"
        >
          {t("Open API Docs →")}
        </a>
      </section>

      {/* Source */}
      <section>
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          {t("Open Source")}
        </h2>
        <p className="text-[var(--text-secondary)] mb-4">
          {t("Spire Codex is open source. The data extraction pipeline, API, and frontend are all available on GitHub.")}
        </p>
        <a
          href="https://github.com/ptrlrd/spire-codex"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors"
        >
          {t("View on GitHub →")}
        </a>
      </section>
    </div>
  );
}
