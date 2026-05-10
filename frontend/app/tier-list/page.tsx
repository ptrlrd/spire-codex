import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import ScoreBadge from "@/app/components/ScoreBadge";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Title leads with both abbreviated ("STS2") and full game name to
  // match either query phrasing — the actual SERPs we're targeting use
  // both. Order chosen so the abbreviation lands inside the truncation
  // window on mobile (Google trims at ~60 chars on phones).
  title: `STS2 Tier List - Slay the Spire 2 Cards, Relics & Potions Ranked | ${SITE_NAME}`,
  description:
    "STS2 / Slay the Spire 2 tier list ranking every card, relic, and potion S through F. Codex Score from community win rates. Updated daily after every patch.",
  alternates: { canonical: `${SITE_URL}/tier-list` },
  openGraph: {
    title: `STS2 Tier List | ${SITE_NAME}`,
    description: "Every Slay the Spire 2 card, relic, and potion ranked S → F based on community win-rate data.",
    url: `${SITE_URL}/tier-list`,
    siteName: SITE_NAME,
    type: "website",
  },
};

const SECTIONS = [
  {
    href: "/tier-list/cards",
    label: "Card Tier List",
    description: "All 576 cards ranked S → F. Filter by character (Ironclad, Silent, Defect, Necrobinder, Regent).",
    accent: "from-amber-500/20 to-amber-700/10 border-amber-700/40",
  },
  {
    href: "/tier-list/relics",
    label: "Relic Tier List",
    description: "289 relics ranked across every pool. Filter by Shared, Boss, Shop, Event, or character.",
    accent: "from-emerald-500/20 to-emerald-700/10 border-emerald-700/40",
  },
  {
    href: "/tier-list/potions",
    label: "Potion Tier List",
    description: "All 63 potions ranked. Smaller pool, easier to memorize the top picks.",
    accent: "from-sky-500/20 to-sky-700/10 border-sky-700/40",
  },
];

interface TopEntity {
  id: string;
  name: string;
  image_url: string | null;
  score: number;
}

interface ScoresResponse {
  [id: string]: { score: number | null; picks: number; wins: number; win_rate: number };
}

interface ApiEntity {
  id: string;
  name: string;
  image_url: string | null;
}

// Pull the top-N scoring entities for one type by joining the bulk
// scores endpoint against the entity list. Falls back to [] on any
// fetch error so the page still renders gracefully.
async function fetchTopEntities(
  type: "cards" | "relics" | "potions",
  count: number,
): Promise<TopEntity[]> {
  try {
    const [entitiesRes, scoresRes] = await Promise.all([
      fetch(`${API_INTERNAL}/api/${type}`, { next: { revalidate: 1800 } }),
      fetch(`${API_INTERNAL}/api/runs/scores/${type}`, { next: { revalidate: 300 } }),
    ]);
    if (!entitiesRes.ok || !scoresRes.ok) return [];
    const entities = (await entitiesRes.json()) as ApiEntity[];
    const scores = (await scoresRes.json()) as ScoresResponse;
    const enriched: TopEntity[] = [];
    for (const e of entities) {
      const s = scores[e.id.toUpperCase()]?.score;
      if (s == null) continue;
      enriched.push({ id: e.id, name: e.name, image_url: e.image_url, score: s });
    }
    enriched.sort((a, b) => b.score - a.score);
    return enriched.slice(0, count);
  } catch {
    return [];
  }
}

// Real Q&A targeting People-Also-Ask boxes for STS2 tier-list searches.
// Answers are factual and short (Google strips long answers from rich
// results). Updated values are computed at request time from the live
// score data so they don't go stale.
function buildFaqEntries(top: { cards: TopEntity[]; relics: TopEntity[]; potions: TopEntity[] }) {
  const faqs: { question: string; answer: string }[] = [];

  if (top.cards.length) {
    faqs.push({
      question: "What is the best card in Slay the Spire 2?",
      answer: `Based on community win-rate data, ${top.cards[0].name} (Codex Score ${top.cards[0].score}) is currently the highest-rated card across all characters. Tier rankings update every 30 minutes as new runs are submitted.`,
    });
  }
  if (top.relics.length) {
    faqs.push({
      question: "What is the best relic in Slay the Spire 2?",
      answer: `${top.relics[0].name} sits at the top of the relic tier list with a Codex Score of ${top.relics[0].score}, derived from community-submitted run win rates with Bayesian shrinkage so low-pick outliers don't dominate the rankings.`,
    });
  }
  if (top.potions.length) {
    faqs.push({
      question: "What is the best potion in Slay the Spire 2?",
      answer: `${top.potions[0].name} (Codex Score ${top.potions[0].score}) is the top-rated potion based on the win rate of runs that included it.`,
    });
  }
  faqs.push(
    {
      question: "How is the Slay the Spire 2 tier list calculated?",
      answer: "Every card, relic, and potion gets a 0–100 Codex Score based on the win rate of submitted runs that included it, shrunk toward the global baseline using Bayesian methods so a 5-pick perfect record doesn't outrank a 500-pick reliable one. Scores then map to letter grades S through F.",
    },
    {
      question: "How often is the tier list updated?",
      answer: "Scores rebuild every 30 minutes as new community runs are submitted. The tier list reflects the current meta after the most recent game patch.",
    },
    {
      question: "Is there a tier list per character?",
      answer: "Yes — the cards tier list filters to Ironclad, Silent, Defect, Necrobinder, Regent, or Colorless. The relics tier list filters by pool. Each filtered view is its own page targeting that character or pool specifically.",
    },
  );
  return faqs;
}

export default async function TierListIndex() {
  // Server-render the top-5 of each type so the page has rich content
  // above the fold (helps SEO crawlers understand the page is a
  // ranked tier list, not just a navigation hub).
  const [topCards, topRelics, topPotions] = await Promise.all([
    fetchTopEntities("cards", 5),
    fetchTopEntities("relics", 5),
    fetchTopEntities("potions", 5),
  ]);

  // ISO 8601 date for the visible "updated" line. force-dynamic means
  // this is fresh on every request — Google rewards visible-recent
  // dates on tier-list-style pages.
  const updatedDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const faqs = buildFaqEntries({ cards: topCards, relics: topRelics, potions: topPotions });

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Tier List", href: "/tier-list" },
    ]),
    buildFAQPageJsonLd(faqs),
  ];

  const previewBlocks: { title: string; href: string; entities: TopEntity[]; route: string }[] = [
    { title: "Top-tier Cards right now", href: "/tier-list/cards", route: "cards", entities: topCards },
    { title: "Top-tier Relics right now", href: "/tier-list/relics", route: "relics", entities: topRelics },
    { title: "Top-tier Potions right now", href: "/tier-list/potions", route: "potions", entities: topPotions },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />

      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Slay the Spire 2 Tier List</span>
        <span className="text-[var(--text-muted)] text-xl ml-2">(STS2)</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-2">
        Updated <time dateTime={new Date().toISOString()}>{updatedDate}</time> · Scores rebuild every 30 minutes.
      </p>
      <p className="text-base text-[var(--text-secondary)] mb-8 max-w-3xl leading-relaxed">
        Every card, relic, and potion in <em>Slay the Spire 2</em> ranked S through F using
        community win-rate data. Tiers are derived from the{" "}
        <Link href="/leaderboards/scoring" className="text-[var(--accent-gold)] hover:underline">
          Codex Score
        </Link>
        {" "}— a Bayesian-shrunk metric that compares each entity&apos;s win rate to the global
        baseline, so a 5-pick perfect-record card doesn&apos;t outrank a 500-pick reliable one.
        Click any tier list below to see the full ranking with character or pool filters.
      </p>

      {/* Section navigation tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={`block p-5 rounded-lg border bg-gradient-to-br ${s.accent} hover:scale-[1.02] transition-transform`}
          >
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">{s.label}</h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{s.description}</p>
          </Link>
        ))}
      </div>

      {/* Top-tier preview rows — concrete content above the fold so SEO
          crawlers immediately see this page is a ranked list, not a
          nav hub. Each row links straight to the full tier list. */}
      {previewBlocks.some((b) => b.entities.length > 0) && (
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">
            What&apos;s top tier right now
          </h2>
          <div className="space-y-4">
            {previewBlocks.map((block) =>
              block.entities.length === 0 ? null : (
                <div
                  key={block.href}
                  className="p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)]"
                >
                  <div className="flex items-baseline justify-between mb-3">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      {block.title}
                    </h3>
                    <Link
                      href={block.href}
                      className="text-xs text-[var(--accent-gold)] hover:underline"
                    >
                      View full list →
                    </Link>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {block.entities.map((ent) => (
                      <Link
                        key={ent.id}
                        href={`/${block.route}/${ent.id.toLowerCase()}`}
                        className="flex flex-col items-center gap-1 w-20 p-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--accent-gold)]/50 transition-colors"
                      >
                        {ent.image_url && (
                          <img
                            src={`${API_PUBLIC}${ent.image_url}`}
                            alt={ent.name}
                            className="w-12 h-12 object-contain"
                            loading="lazy"
                            crossOrigin="anonymous"
                          />
                        )}
                        <span className="text-[10px] text-[var(--text-secondary)] text-center leading-tight line-clamp-2 min-h-[1.5rem]">
                          {ent.name}
                        </span>
                        <ScoreBadge score={ent.score} size="sm" showNumber />
                      </Link>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </section>
      )}

      {/* Methodology block (kept from original) */}
      <section className="p-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] mb-10">
        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-2">
          How the rankings work
        </h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
          Each entity is given a 0–100 Codex Score based on the win rate of runs that included it,
          shrunk toward the global baseline so a 5-pick perfect-record card doesn&apos;t outrank a
          500-pick reliable one. Scores map to letter grades:
        </p>
        <div className="text-xs text-[var(--text-muted)] space-y-1">
          <div><strong className="text-amber-300">S (90+)</strong> · genuinely elite</div>
          <div><strong className="text-emerald-300">A (78–89)</strong> · reliable engine pieces</div>
          <div><strong className="text-sky-300">B (65–77)</strong> · above-average</div>
          <div><strong className="text-zinc-300">C (50–64)</strong> · average</div>
          <div><strong className="text-orange-300">D (35–49)</strong> · niche or filler</div>
          <div><strong className="text-rose-300">F (0–34)</strong> · actively pulls toward losses</div>
        </div>
        <Link
          href="/leaderboards/scoring"
          className="inline-block mt-4 text-sm font-medium text-[var(--accent-gold)] hover:underline"
        >
          → Full methodology
        </Link>
      </section>

      {/* FAQ — also wired up as FAQPage JSON-LD above so each Q can
          land in Google's People-Also-Ask box. */}
      <section className="mb-4">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">Frequently asked</h2>
        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <details
              key={i}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] group"
            >
              <summary className="cursor-pointer p-4 text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent-gold)] transition-colors flex items-start justify-between gap-3 list-none">
                <span>{faq.question}</span>
                <svg
                  aria-hidden
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4 mt-0.5 flex-shrink-0 transition-transform -rotate-90 group-open:rotate-0 text-[var(--text-muted)]"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </summary>
              <div className="px-4 pb-4 text-sm text-[var(--text-secondary)] leading-relaxed">
                {faq.answer}
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
