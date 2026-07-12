import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, buildLanguageAlternates } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import ScoreBadge from "@/app/components/ScoreBadge";

export const metadata: Metadata = {
  title: `Codex Score - How Tier Ratings Work - Slay the Spire 2 (sts2) | ${SITE_NAME}`,
  description:
    "How Codex Score ranks every Slay the Spire 2 (sts2) card, relic, and potion. Bayesian-shrunk win rate, S-through-F tier bands, and full formula methodology.",
  alternates: { canonical: `${SITE_URL}/leaderboards/scoring`, languages: buildLanguageAlternates(`/leaderboards/scoring`) },
  openGraph: {
    title: `Codex Score Methodology - Slay the Spire 2 (sts2) | ${SITE_NAME}`,
    description:
      "How we compute the 0-100 community-meta score on every card / relic / potion. Bayesian shrinkage, tier bands, formula breakdown.",
    url: `${SITE_URL}/leaderboards/scoring`,
    siteName: SITE_NAME,
    type: "article",
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: {
    card: "summary_large_image",
    title: `Codex Score Methodology - Slay the Spire 2 (sts2) | ${SITE_NAME}`,
    description: "How we compute the 0-100 community-meta score on every card / relic / potion. Bayesian shrinkage, tier bands, formula breakdown.",
  },
};

interface ExampleRow {
  label: string;
  picks: number;
  wins: number;
  score: number;
}

// Worked examples, should match _compute_score in
// backend/app/services/run_entity_stats.py exactly. Mirrored here so
// the page is fully static (no API roundtrip on render).
const EXAMPLES: ExampleRow[] = [
  { label: "Massive sample, elite", picks: 1000, wins: 700, score: 100 },
  { label: "High-N strong", picks: 100, wins: 70, score: 94 },
  { label: "Mid-N solid", picks: 500, wins: 280, score: 68 },
  { label: "Small-N perfect", picks: 5, wins: 5, score: 65 },
  { label: "Average performer", picks: 50, wins: 25, score: 50 },
  { label: "Small sample, no wins yet", picks: 5, wins: 0, score: 35 },
  { label: "High sample, underperforming", picks: 200, wins: 60, score: 0 },
];

const TIERS = [
  { range: "90 – 100", letter: "S", label: "Top tier",      note: "Top of the win-rate signal. An out-of-distribution win rate sustained over hundreds of picks." },
  { range: "78 – 89",  letter: "A", label: "Strong",        note: "Wins above the baseline reliably across a large sample." },
  { range: "65 – 77",  letter: "B", label: "Solid",         note: "Above-average win rate. A safe pick when nothing better is offered." },
  { range: "50 – 64",  letter: "C", label: "Average",       note: "The middle of the curve. Most entities live here." },
  { range: "35 – 49",  letter: "D", label: "Below average", note: "Below the baseline. Often niche or situational, sometimes just high-exposure (see the biases below)." },
  { range: "0 – 34",   letter: "F", label: "Underperforming", note: "Bottom of the win-rate signal. Frequently a staple dragged down by being in nearly every run, not necessarily a bad card." },
];

export default function ScoringPage() {
  const articleAndBreadcrumb = buildDetailPageJsonLd({
    name: "Codex Score, Slay the Spire 2 Tier Rating Methodology",
    description:
      "How Codex Score ranks every Slay the Spire 2 card, relic, and potion. Bayesian-shrunk win rate, S-through-F tier bands, and full formula methodology.",
    path: "/leaderboards/scoring",
    category: "Game Mechanics",
    breadcrumbs: [
      { name: "Home", href: "/" },
      { name: "Leaderboards", href: "/leaderboards" },
      { name: "Codex Score", href: "/leaderboards/scoring" },
    ],
  });
  const faqJsonLd = buildFAQPageJsonLd([
    {
      question: "What is the Codex Score in Slay the Spire 2?",
      answer:
        "The Codex Score is a 0–100 community meta score for every card, relic, and potion in Slay the Spire 2. It is computed from the win rate of community-submitted runs that included the entity, shrunk toward the global baseline using Bayesian methods to prevent low-sample noise.",
    },
    {
      question: "How is the Slay the Spire 2 tier list score calculated?",
      answer:
        "The score has two stages: Bayesian shrinkage (shrunk = (wins + baseline·50) / (picks + 50)) to prevent a 5-pick perfect card from outranking a 500-pick reliable one, then a linear map from win-rate-vs-baseline to the 0–100 scale. Scores above 90 earn an S tier; below 35 earns F.",
    },
    {
      question: "What do the S, A, B, C, D, F tier grades mean?",
      answer:
        "S (90–100) is the top of the win-rate signal. A (78–89) wins above baseline reliably. B (65–77) is above average. C (50–64) is average, most entities live here. D (35–49) is below average, often niche or high-exposure. F (0–34) is the bottom of the signal, which can mean a genuinely weak entity or just a staple seen in nearly every run. The grade is a data signal, not a verdict.",
    },
    {
      question: "How often does the Codex Score update?",
      answer:
        "Scores rebuild every 30 minutes on the server as new community runs are submitted. The tier list reflects the current meta after the most recent game patch.",
    },
  ]);
  const jsonLd = [...articleAndBreadcrumb, faqJsonLd];

  return (
    <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-6">
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
          summarizes <strong>how its presence correlates with winning runs</strong>, based purely
          on community-submitted run data, not opinion. <strong>50</strong> is neutral
          (the average run wins roughly half the time at A0), <strong>100</strong> is the top of
          the signal, <strong>0</strong> the bottom. It is a naive correlation with known biases
          (spelled out below), not a verdict on whether a card is good. The same number drives the
          default sort on every list page and the badge on every detail page.
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
            baseline maps to 100. Scores saturate beyond that, entities outside that band are
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

      {/* Codex Elo */}
      <section id="codex-elo" className="mb-10 scroll-mt-20">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">
          Codex Elo, the other half
        </h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          Codex Score grades <strong>win rate</strong>, which is honest but confounded: a
          card&apos;s win rate reflects who picks it and what deck it lands in, not just the
          card. <strong>Codex Elo</strong> attacks that from the other side. It ignores wins
          entirely and instead reads <em>revealed preference</em>. Every card-reward screen is
          treated as a head-to-head where the card you take beats the cards you skip. Fit a
          Bradley-Terry model over millions of those decisions and you get a rating for
          &ldquo;when offered, which card do players actually want?&rdquo;
        </p>
        <ul className="text-sm text-[var(--text-secondary)] space-y-2 list-disc pl-5 mb-4">
          <li>
            <strong>Skill-agnostic.</strong> Win rate rises and falls with who&apos;s playing the
            card. A pick decision doesn&apos;t. A strong card is preferred whether a great or a
            mediocre player is choosing, so Elo sidesteps the win-rate confound.
          </li>
          <li>
            <strong>Anchored ~1500, 400 per decade.</strong> A card picked ten times as often as
            the field average over its rivals sits ~400 Elo above it, same scale logic as chess.
          </li>
          <li>
            <strong>Cards only.</strong> Reward screens offer cards, not relics or potions, so
            base-card Elo exists only for cards.
          </li>
          <li>
            <strong>Upgraded cards get their own Elo.</strong> Reward screens can offer a card
            already upgraded, but the run export only records which card was taken, not whether the
            offer was the &ldquo;+&rdquo; version, so every reward pick counts toward the base card
            and can&apos;t speak for the upgraded one. Instead the &ldquo;+&rdquo; variant is rated
            from a different revealed preference: the rest-site Smith decision. When you upgrade a
            card, it &ldquo;beats&rdquo; the other cards in your deck you could have upgraded but
            didn&apos;t. Fit the same Bradley-Terry model over those choices and the
            &ldquo;+&rdquo; row gets a genuine Upgrade Elo, not a copy of the base number. Starters
            can earn one this way too (you can Smith a Strike).
          </li>
        </ul>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          Use them together: Score says &ldquo;this wins games,&rdquo; Elo says &ldquo;players
          want this when they see it.&rdquo; Cards high on both are unambiguous; a gap between
          them is usually a build-around or a situational pick. Both, side by side, live on the{" "}
          <Link href="/leaderboards/metrics" className="text-[var(--accent-gold)] hover:underline">
            Card Metrics
          </Link>{" "}
          table.
        </p>
      </section>

      {/* Limitations / disclaimers */}
      <section id="limitations" className="mb-10 scroll-mt-20">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">What the score is not</h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          Codex Score is a naive win-rate correlation, and a correlation carries baggage. The two
          biggest confounds below are why some obviously good cards can land low and some niche
          ones can land high. Read a grade as a signal with caveats, not a ruling. Where a card
          has been offered in reward screens, <Link href="#codex-elo" className="text-[var(--accent-gold)] hover:underline">Codex Elo</Link>{" "}
          is the less-confounded counterweight, it is skill-agnostic and not exposure-weighted.
        </p>
        <ul className="text-sm text-[var(--text-secondary)] space-y-3 list-disc pl-5">
          <li>
            <strong>Exposure-time / pick-frequency bias.</strong> A card that sits in the deck
            longer, or gets picked in nearly every run (starters, commons, high-pick staples),
            absorbs more of every loss it was present for. So heavily-used cards score low even
            when they&apos;re fine, which is why some staples land in the bottom tiers. An F often
            means &ldquo;high exposure,&rdquo; not &ldquo;bad card.&rdquo;
          </li>
          <li>
            <strong>Survivorship bias.</strong> Late-game rares and uncommons only get offered in
            runs that already got deep, runs that were, on average, already going well. Their win
            rate is inflated by the run being healthy <em>before</em> the pick, so they can look
            stronger than they are.
          </li>
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
            humans bothered to submit, disproportionately wins, disproportionately ranked-mode
            players. The baseline win rate is computed from the same pool, so the bias largely
            cancels out for relative ranking. But absolute win rates skew higher than the average
            player&apos;s.
          </li>
          <li>
            <strong>Refreshes every 30 minutes.</strong> Scores are cached server-side. A run you
            submit right now will affect the next score rebuild, not the one in your browser.
          </li>
        </ul>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mt-4">
          To cut the obvious confounds yourself, the{" "}
          <Link href="/leaderboards/metrics" className="text-[var(--accent-gold)] hover:underline">
            Card Metrics
          </Link>{" "}
          table puts Codex Elo next to Score and slices both by per-character and per-run brackets.
        </p>
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
          Every score gets sharper when more runs are submitted, especially losses, which are
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
