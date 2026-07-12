import Link from "next/link";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import ScoreBadge from "@/app/components/ScoreBadge";
import { imageUrl, fullCardUrl } from "@/lib/image-url";
import { LANG_HREFLANG, type LangCode } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Section tiles + their labels. The labels route through t(lang) so the
// localized /[lang]/tier-list variant resolves them; the base route passes
// "eng" and gets the English source strings back.
function sections(lang: string) {
  return [
    {
      href: "/tier-list/cards",
      label: t("Card Tier List", lang),
      description: "All 576 cards ranked S → F. Filter by character (Ironclad, Silent, Defect, Necrobinder, Regent).",
      accent: "from-amber-500/20 to-amber-700/10 border-amber-700/40",
    },
    {
      href: "/tier-list/relics",
      label: t("Relic Tier List", lang),
      description: "289 relics ranked across every pool. Filter by Shared, Boss, Shop, Event, or character.",
      accent: "from-emerald-500/20 to-emerald-700/10 border-emerald-700/40",
    },
    {
      href: "/tier-list/potions",
      label: t("Potion Tier List", lang),
      description: "All 63 potions ranked. Smaller pool, easier to memorize the top picks.",
      accent: "from-sky-500/20 to-sky-700/10 border-sky-700/40",
    },
  ];
}

interface TopEntity {
  id: string;
  name: string;
  image_url: string | null;
  score: number;
  picks?: number;
  winRate?: number;
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
  order: "top" | "bottom" = "top",
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
      const sc = scores[e.id.toUpperCase()];
      const s = sc?.score;
      if (s == null) continue;
      // For the underperforming list, ignore tiny-sample noise.
      if (order === "bottom" && (sc?.picks ?? 0) < 3) continue;
      enriched.push({
        id: e.id, name: e.name, image_url: e.image_url, score: s,
        picks: sc?.picks, winRate: sc?.win_rate,
      });
    }
    enriched.sort((a, b) => (order === "bottom" ? a.score - b.score : b.score - a.score));
    return enriched.slice(0, count);
  } catch {
    return [];
  }
}

// Real Q&A targeting People-Also-Ask boxes for STS2 tier-list searches.
// Answers are factual and short (Google strips long answers from rich
// results). Updated values are computed at request time from the live
// score data so they don't go stale.
function buildFaqEntries(top: { cards: TopEntity[]; relics: TopEntity[]; potions: TopEntity[] }, lang: string) {
  const faqs: { question: string; answer: string }[] = [];

  if (top.cards.length) {
    faqs.push({
      question: t("What is the best card in Slay the Spire 2?", lang),
      answer: `Based on community win-rate data, ${top.cards[0].name} (Codex Score ${top.cards[0].score}) is currently the highest-rated card across all characters. Tier rankings update every 30 minutes as new runs are submitted.`,
    });
  }
  if (top.relics.length) {
    faqs.push({
      question: t("What is the best relic in Slay the Spire 2?", lang),
      answer: `${top.relics[0].name} sits at the top of the relic tier list with a Codex Score of ${top.relics[0].score}, derived from community-submitted run win rates with Bayesian shrinkage so low-pick outliers don't dominate the rankings.`,
    });
  }
  if (top.potions.length) {
    faqs.push({
      question: t("What is the best potion in Slay the Spire 2?", lang),
      answer: `${top.potions[0].name} (Codex Score ${top.potions[0].score}) is the top-rated potion based on the win rate of runs that included it.`,
    });
  }
  faqs.push(
    {
      question: t("How is the Slay the Spire 2 tier list calculated?", lang),
      answer: "Every card, relic, and potion gets a 0–100 Codex Score based on the win rate of submitted runs that included it, shrunk toward the global baseline using Bayesian methods so a 5-pick perfect record doesn't outrank a 500-pick reliable one. Scores then map to letter grades S through F.",
    },
    {
      question: t("How often is the tier list updated?", lang),
      answer: "Scores rebuild every 30 minutes as new community runs are submitted. The tier list reflects the current meta after the most recent game patch.",
    },
    {
      question: t("Is there a tier list per character?", lang),
      answer: "Yes, the cards tier list filters to Ironclad, Silent, Defect, Necrobinder, Regent, or Colorless. The relics tier list filters by pool. Each filtered view is its own page targeting that character or pool specifically.",
    },
  );
  return faqs;
}

// Shared page body. Both the base /tier-list route (lang="eng") and the
// localized /[lang]/tier-list route render this, so the JSX lives in one
// place and only the language threaded through t() differs.
export async function TierListBody({ lang }: { lang: string }) {
  const secs = sections(lang);
  // English keeps bare paths; localized routes get a /[lang] prefix so the
  // JSON-LD canonical + breadcrumb point at the localized URL.
  const prefix = lang === "eng" ? "" : `/${lang}`;
  const inLanguage = lang === "eng" ? undefined : LANG_HREFLANG[lang as LangCode];
  // Server-render the top-5 of each type so the page has rich content
  // above the fold (helps SEO crawlers understand the page is a
  // ranked tier list, not just a navigation hub).
  const [topCards, topRelics, topPotions, bottomCards] = await Promise.all([
    fetchTopEntities("cards", 5),
    fetchTopEntities("relics", 5),
    fetchTopEntities("potions", 5),
    fetchTopEntities("cards", 5, "bottom"),
  ]);

  // ISO 8601 date for the visible "updated" line. force-dynamic means
  // this is fresh on every request, Google rewards visible-recent
  // dates on tier-list-style pages.
  const updatedDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const faqs = buildFaqEntries({ cards: topCards, relics: topRelics, potions: topPotions }, lang);

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: prefix || "/" },
      { name: "Tier List", href: `${prefix}/tier-list` },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Tier List",
      description:
        "Every card, relic, and potion in Slay the Spire 2 ranked S through F using community win-rate data.",
      path: `${prefix}/tier-list`,
      items: secs.map((s) => ({ name: s.label, path: s.href })),
      inLanguage,
    }),
    buildFAQPageJsonLd(faqs),
  ];

  const previewBlocks: { title: string; href: string; entities: TopEntity[]; route: string }[] = [
    { title: t("Top-tier Cards right now", lang), href: "/tier-list/cards", route: "cards", entities: topCards },
    { title: t("Top-tier Relics right now", lang), href: "/tier-list/relics", route: "relics", entities: topRelics },
    { title: t("Top-tier Potions right now", lang), href: "/tier-list/potions", route: "potions", entities: topPotions },
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-6">
      <JsonLd data={jsonLd} />

      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Slay the Spire 2 (sts2) Tier List</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-2">
        {t("Updated", lang)} <time dateTime={new Date().toISOString()}>{updatedDate}</time> · {t("Scores rebuild every 30 minutes.", lang)}
      </p>
      <p className="text-base text-[var(--text-secondary)] mb-8 max-w-3xl leading-relaxed">
        Every card, relic, and potion in <em>Slay the Spire 2</em> ranked S through F using
        community win-rate data. Tiers are derived from the{" "}
        <Link href="/leaderboards/scoring" className="text-[var(--accent-gold)] hover:underline">
          Codex Score
        </Link>
        {" "}a Bayesian-shrunk metric that compares each entity&apos;s win rate to the global
        baseline, so a 5-pick perfect-record card doesn&apos;t outrank a 500-pick reliable one.
        Click any tier list below to see the full ranking with character or pool filters.
      </p>

      {/* Section navigation tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
        {secs.map((s) => (
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

      {/* Top-tier preview rows, concrete content above the fold so SEO
          crawlers immediately see this page is a ranked list, not a
          nav hub. Each row links straight to the full tier list. */}
      {previewBlocks.some((b) => b.entities.length > 0) && (
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">
            {t("What's top tier right now", lang)}
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
                      {t("View full list", lang)} →
                    </Link>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {block.entities.map((ent) =>
                      block.route === "cards" ? (
                        <Link
                          key={ent.id}
                          href={`/cards/${ent.id.toLowerCase()}`}
                          className="flex flex-col items-center gap-1 w-[124px] sm:w-[144px] hover:scale-[1.04] transition-transform"
                          title={ent.name}
                        >
                          <img
                            src={fullCardUrl(ent.id.toLowerCase())}
                            alt={ent.name}
                            className="w-full h-auto drop-shadow-[0_3px_10px_rgba(0,0,0,0.5)]"
                            loading="lazy"
                            crossOrigin="anonymous"
                          />
                          <ScoreBadge score={ent.score} size="sm" showNumber />
                        </Link>
                      ) : (
                        <Link
                          key={ent.id}
                          href={`/${block.route}/${ent.id.toLowerCase()}`}
                          className="flex flex-col items-center gap-1 w-20 p-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--accent-gold)]/50 transition-colors"
                        >
                          {ent.image_url && (
                            <img
                              src={imageUrl(ent.image_url)}
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
                      )
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </section>
      )}

      {/* Methodology block (kept from original) */}
      {/* Underperforming cards — the bottom of the meta right now. */}
      {bottomCards.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">
            {t("What's underperforming right now", lang)}
          </h2>
          <div className="p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)]">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {t("Lowest-scoring Cards right now", lang)}
              </h3>
              <Link
                href="/tier-list/cards"
                className="text-xs text-[var(--accent-gold)] hover:underline"
              >
                {t("View full list", lang)} →
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {bottomCards.map((ent) => (
                <Link
                  key={ent.id}
                  href={`/cards/${ent.id.toLowerCase()}`}
                  className="flex flex-col items-center gap-1 w-[124px] sm:w-[144px] hover:scale-[1.04] transition-transform"
                  title={ent.name}
                >
                  <img
                    src={fullCardUrl(ent.id.toLowerCase())}
                    alt={ent.name}
                    className="w-full h-auto drop-shadow-[0_3px_10px_rgba(0,0,0,0.5)]"
                    loading="lazy"
                    crossOrigin="anonymous"
                  />
                  <ScoreBadge score={ent.score} size="sm" showNumber />
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="p-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] mb-10">
        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-2">
          {t("How the rankings work", lang)}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
          Each entity is given a 0–100 Codex Score based on the win rate of runs that included it,
          shrunk toward the global baseline so a 5-pick perfect-record card doesn&apos;t outrank a
          500-pick reliable one. Scores map to letter grades:
        </p>
        <div className="text-xs text-[var(--text-muted)] space-y-1">
          <div><strong className="text-amber-300">S (90+)</strong> · top of the win-rate signal</div>
          <div><strong className="text-emerald-300">A (78–89)</strong> · wins above baseline reliably</div>
          <div><strong className="text-sky-300">B (65–77)</strong> · above-average</div>
          <div><strong className="text-zinc-300">C (50–64)</strong> · average</div>
          <div><strong className="text-orange-300">D (35–49)</strong> · below average, often niche</div>
          <div><strong className="text-rose-300">F (0–34)</strong> · bottom of the signal, often a high-exposure staple</div>
        </div>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed mt-3">
          This is a naive win-rate signal, not a ruling. It carries known biases, heavily-used
          staples sink even when they&apos;re fine, and late-game rares float because they only
          show up in runs already going well. Read a low grade as &ldquo;high exposure&rdquo; as
          often as &ldquo;weak.&rdquo;
        </p>
        <Link
          href="/leaderboards/scoring#limitations"
          className="inline-block mt-4 text-sm font-medium text-[var(--accent-gold)] hover:underline"
        >
          → {t("How the score works and where it's biased", lang)}
        </Link>
      </section>

      {/* FAQ, also wired up as FAQPage JSON-LD above so each Q can
          land in Google's People-Also-Ask box. */}
      <section className="mb-4">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">{t("Frequently asked", lang)}</h2>
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
