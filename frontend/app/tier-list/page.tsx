import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: `Slay the Spire 2 Tier List - Cards, Relics, Potions Ranked | ${SITE_NAME}`,
  description:
    "Slay the Spire 2 tier list ranking every card, relic, and potion S through F. Codex Score derived from community-submitted run win rates with Bayesian shrinkage. Updated every 30 minutes.",
  alternates: { canonical: `${SITE_URL}/tier-list` },
  openGraph: {
    title: `Slay the Spire 2 Tier List | ${SITE_NAME}`,
    description: "Every card, relic, and potion ranked S through F based on community win-rate data.",
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

export default function TierListIndex() {
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Tier List", href: "/tier-list" },
    ]),
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />

      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Tier List</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8 max-w-2xl">
        Every card, relic, and potion in <em>Slay the Spire 2</em> ranked S through F.
        Tiers are derived from the <Link href="/leaderboards/scoring" className="text-[var(--accent-gold)] hover:underline">Codex Score</Link>
        {" "}— a Bayesian-shrunk win-rate metric computed from community-submitted runs. Updated every 30 minutes.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
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

      <section className="p-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)]">
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
    </div>
  );
}
