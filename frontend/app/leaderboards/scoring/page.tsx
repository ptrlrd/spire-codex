import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, SITE_NAME, buildLanguageAlternates} from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";
import ScoreBadge from "@/app/components/ScoreBadge";

export const metadata: Metadata = {
  title: `Codex Score - How Tier Ratings Work - Slay the Spire 2 (sts2) | ${SITE_NAME}`,
  description:
    "How the Codex Score rates every Slay the Spire 2 card, relic, and potion. Bayesian-shrunk win-rate formula, tier bands (S through F), and methodology behind the community-meta ratings.",
  alternates: { canonical: `${SITE_URL}/leaderboards/scoring`, languages: buildLanguageAlternates(`/leaderboards/scoring`) },
  openGraph: {
    title: `Codex Score Methodology - Slay the Spire 2 (sts2) | ${SITE_NAME}`,
    description:
      "How we compute the 0-100 community-meta score on every card / relic / potion. Bayesian shrinkage, tier bands, formula breakdown.",
    url: `${SITE_URL}/leaderboards/scoring`,
    siteName: SITE_NAME,
    type: "article",
  },
};

interface ExampleRow {
  label: string;
  picks: number;
  wins: number;
  score: number;
}

// Worked examples — should match _compute_score in
// backend/app/services/run_entity_stats.py exactly. Mirrored here so
// the page is fully static (no API roundtrip on render).
const EXAMPLES: ExampleRow[] = [
  { label: "Massive sample, elite", picks: 1000, wins: 700, score: 100 },
  { label: "High-N strong", picks: 100, wins: 70, score: 94 },
  { label: "Mid-N solid", picks: 500, wins: 280, score: 68 },
  { label: "Small-N perfect", picks: 5, wins: 5, score: 65 },
  { label: "Average performer", picks: 50, wins: 25, score: 50 },
  { label: "Small-N total loss", picks: 5, wins: 0, score: 35 },
  { label: "High-N weak", picks: 200, wins: 60, score: 0 },
];

const TIERS = [
  { range: "90 – 100", letter: "S", label: "Top tier", note: "Genuinely elite. Out-of-distribution win rate sustained over hundreds of picks." },
  { range: "78 – 89",  letter: "A", label: "Strong",   note: "Reliable engine pieces. Picking these is rarely a mistake." },
  { range: "65 – 77",  letter: "B", label: "Solid",    note: "Above-average. Pick when nothing better is offered." },
  { range: "50 – 64",  letter: "C", label: "Average",  note: "The middle of the curve. Most cards live here." },
  { range: "35 – 49",  letter: "D", label: "Weak",     note: "Niche or filler. Skippable in most builds." },
  { range: "0 – 34",   letter: "F", label: "Avoid",    note: "Actively pulls runs toward losses. Take only if forced." },
];

export default function ScoringPage() {
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Stats", href: "/leaderboards/stats" },
      { name: "Codex Score", href: "/leaderboards/scoring" },
    ]),
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />

      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Codex Score</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        How every card, relic, and potion gets a 0–100 community-meta rating.
      </p>

      {/* Hero example */}
      <section className="mb-10 p-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <div className="flex items-center gap-4 mb-3">
          <ScoreBadge score={94} size="lg" showNumber />
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              What is the Codex Score?
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Bayesian-shrunk win-rate, mapped to 0–100 with letter-grade tiers.
            </p>
          </div>
        </div>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          Every card, relic, and potion in <em>Slay the Spire 2</em> gets a single number that
          summarizes <strong>how strongly it pulls toward winning runs</strong> — based purely
          on community-submitted run data, not opinion. <strong>50</strong> is neutral
          (the average run wins roughly half the time at A0), <strong>100</strong> is best-in-class,
          <strong>0</strong> is worst. The same number drives the &ldquo;Top tier&rdquo; sort on
          every list page and the badge on every detail page.
        </p>
      </section>

      {/* Tier bands */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">Tier bands</h2>
        <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-card)]">
                <th className="text-left py-2.5 px-4 font-semibold">Range</th>
                <th className="text-left py-2.5 px-3 font-semibold">Tier</th>
                <th className="text-left py-2.5 px-3 font-semibold">Label</th>
                <th className="text-left py-2.5 px-4 font-semibold">What it means</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((t) => {
                const sample = parseInt(t.range.split("–")[1].trim(), 10);
                return (
                  <tr key={t.letter} className="border-b border-[var(--border-subtle)] last:border-b-0">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[var(--text-secondary)]">{t.range}</td>
                    <td className="py-2.5 px-3"><ScoreBadge score={sample} size="md" /></td>
                    <td className="py-2.5 px-3 text-[var(--text-secondary)]">{t.label}</td>
                    <td className="py-2.5 px-4 text-[var(--text-secondary)]">{t.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Formula */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">The formula</h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          The score has two stages: <strong>Bayesian shrinkage</strong> (so a 5-pick perfect
          card doesn&apos;t outrank a 500-pick reliable one), then a <strong>linear map</strong>
          {" "}from win-rate-vs-baseline to the 0–100 scale.
        </p>

        <pre className="text-xs sm:text-sm bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg p-4 overflow-x-auto leading-relaxed text-[var(--text-secondary)]">
{`baseline   = total_wins / total_runs       # global win rate
shrunk     = (wins + baseline · 50) / (picks + 50)
delta      = shrunk − baseline
raw        = (delta / 0.15 + 1) · 50
score      = clamp(raw, 0, 100)            # rounded to integer`}
        </pre>

        <ul className="text-sm text-[var(--text-secondary)] mt-4 space-y-2 list-disc pl-5">
          <li>
            <strong>Prior weight = 50.</strong> Every entity starts with the equivalent of 50
            virtual picks at the baseline win rate. Real picks accumulate against this prior, so
            scores stabilize as data grows. A 5-pick card with a perfect record only nudges the
            prior; a 500-pick card with a strong record overpowers it.
          </li>
          <li>
            <strong>Scale range = ±15pp.</strong> A win-rate gap of 15 percentage points above
            baseline maps to 100. Scores saturate beyond that — entities outside that band are
            genuinely off the distribution.
          </li>
          <li>
            <strong>Clamp.</strong> Scores can&apos;t go negative or above 100, even if the math
            does. The cap is honest: an entity at the cap is &ldquo;at least this good,&rdquo;
            not necessarily &ldquo;exactly 100.&rdquo;
          </li>
        </ul>
      </section>

      {/* Examples */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">Worked examples</h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          Same baseline (50% win rate) for all rows below. Note how sample size matters: the
          5-pick perfect record gets B-tier, while the 500-pick 56% record gets A-tier.
        </p>
        <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-card)]">
                <th className="text-left py-2.5 px-4 font-semibold">Scenario</th>
                <th className="text-right py-2.5 px-3 font-semibold">Picks</th>
                <th className="text-right py-2.5 px-3 font-semibold">Wins</th>
                <th className="text-right py-2.5 px-3 font-semibold">Win %</th>
                <th className="text-left py-2.5 px-4 font-semibold">Score</th>
              </tr>
            </thead>
            <tbody>
              {EXAMPLES.map((ex) => (
                <tr key={ex.label} className="border-b border-[var(--border-subtle)] last:border-b-0">
                  <td className="py-2.5 px-4 text-[var(--text-secondary)]">{ex.label}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">{ex.picks}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">{ex.wins}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">{Math.round((ex.wins / ex.picks) * 100)}%</td>
                  <td className="py-2.5 px-4"><ScoreBadge score={ex.score} size="md" showNumber /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Limitations / disclaimers */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">What the score is not</h2>
        <ul className="text-sm text-[var(--text-secondary)] space-y-3 list-disc pl-5">
          <li>
            <strong>Not a personal recommendation.</strong> Score answers &ldquo;what wins for the
            average submitter?&rdquo; It can&apos;t see your deck, your character, your ascension,
            or what relics you already have. A C-tier card can be the right pick if it solves
            <em> your</em> problem.
          </li>
          <li>
            <strong>Not normalized by ascension.</strong> A relic that&apos;s great at A0 and
            mediocre at A10 gets one blended score. We&apos;ll add per-ascension scoring once the
            sample size at high ascension is statistically meaningful.
          </li>
          <li>
            <strong>Not normalized by character.</strong> A relic with a 70% win rate on Defect and
            45% on Ironclad blends to one number. Per-character scoring is on the roadmap (the
            data is already in the per-character breakdown table on each detail page).
          </li>
          <li>
            <strong>Biased toward submitter pool.</strong> The score reflects runs that real
            humans bothered to submit — disproportionately wins, disproportionately ranked-mode
            players. The baseline win rate is computed from the same pool, so the bias largely
            cancels out for relative ranking. But absolute win rates skew higher than the average
            player&apos;s.
          </li>
          <li>
            <strong>Refreshes every 30 minutes.</strong> Scores are cached server-side. A run you
            submit right now will affect the next score rebuild, not the one in your browser.
          </li>
        </ul>
      </section>

      {/* Further reading / cross-links */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">See it in action</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/cards?sort=score"
            className="block p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-accent)] transition-colors"
          >
            <div className="text-sm font-semibold text-[var(--text-primary)] mb-1">Cards by score</div>
            <div className="text-xs text-[var(--text-muted)]">Top-tier cards, sortable by Codex Score.</div>
          </Link>
          <Link
            href="/relics?sort=score"
            className="block p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-accent)] transition-colors"
          >
            <div className="text-sm font-semibold text-[var(--text-primary)] mb-1">Relics by score</div>
            <div className="text-xs text-[var(--text-muted)]">Best-rated relics across all pools.</div>
          </Link>
          <Link
            href="/potions?sort=score"
            className="block p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-accent)] transition-colors"
          >
            <div className="text-sm font-semibold text-[var(--text-primary)] mb-1">Potions by score</div>
            <div className="text-xs text-[var(--text-muted)]">Tier list of every potion in the game.</div>
          </Link>
        </div>
      </section>

      {/* Submit prompt */}
      <section className="p-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">
          Improve the scores
        </h3>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
          Every score gets sharper when more runs are submitted — especially losses, which are
          chronically underrepresented in community datasets. The submitter pool is the data.
        </p>
        <Link
          href="/leaderboards/submit"
          className="inline-block text-sm font-medium text-[var(--accent-gold)] hover:underline"
        >
          → Submit a run
        </Link>
      </section>
    </div>
  );
}
