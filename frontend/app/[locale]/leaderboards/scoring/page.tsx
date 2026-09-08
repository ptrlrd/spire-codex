import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, inLanguageOf, localeOf, localePath } from "@/lib/locale";
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import ScoreBadge from "@/app/components/ScoreBadge";

interface ExampleRow {
  label: string;
  picks: number;
  wins: number;
  score: number;
}

// Worked examples, should match _compute_score in
// backend/app/services/run_entity_stats.py exactly. Mirrored here so
// the page is fully static (no API roundtrip on render).
function exampleRows(t: TFn): ExampleRow[] {
  return [
    { label: t("Massive sample, elite"), picks: 1000, wins: 700, score: 100 },
    { label: t("High-N strong"), picks: 100, wins: 70, score: 94 },
    { label: t("Mid-N solid"), picks: 500, wins: 280, score: 68 },
    { label: t("Small-N perfect"), picks: 5, wins: 5, score: 65 },
    { label: t("Average performer"), picks: 50, wins: 25, score: 50 },
    { label: t("Small sample, no wins yet"), picks: 5, wins: 0, score: 35 },
    { label: t("High sample, underperforming"), picks: 200, wins: 60, score: 0 },
  ];
}

function tierRows(t: TFn) {
  return [
    { range: "90 – 100", letter: "S", label: t("Top tier"), note: t("Top of the win-rate signal. An out-of-distribution win rate sustained over hundreds of picks.") },
    { range: "78 – 89", letter: "A", label: t("Strong"), note: t("Wins above the baseline reliably across a large sample.") },
    { range: "65 – 77", letter: "B", label: t("Solid"), note: t("Above-average win rate. A safe pick when nothing better is offered.") },
    { range: "50 – 64", letter: "C", label: t("Average"), note: t("The middle of the curve. Most entities live here.") },
    { range: "35 – 49", letter: "D", label: t("Below average"), note: t("Below the baseline. Often niche or situational, sometimes just high-exposure (see the biases below).") },
    { range: "0 – 34", letter: "F", label: t("Underperforming"), note: t("Bottom of the win-rate signal. Frequently a staple dragged down by being in nearly every run, not necessarily a bad card.") },
  ];
}

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/leaderboards/scoring", title: t("Codex Score - How Tier Ratings Work"), description: t("leaderboards_scoring_meta_description") });
}

export default async function ScoringPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const heading = pageHeading(locale, t("Codex Score"));
  const gameName = gameNameFor(locale, "Slay the Spire 2");
  const examples = exampleRows(t);
  const tiers = tierRows(t);
  const articleAndBreadcrumb = buildDetailPageJsonLd({
    name: "Codex Score, Slay the Spire 2 Tier Rating Methodology",
    description:
      "How Codex Score ranks every Slay the Spire 2 card, relic, and potion. Bayesian-shrunk win rate, S-through-F tier bands, and full formula methodology.",
    path: localePath(locale, "/leaderboards/scoring"),
    inLanguage: inLanguageOf(locale),
    category: "Game Mechanics",
    breadcrumbs: [
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Leaderboards"), href: localePath(locale, "/leaderboards") },
      { name: t("Codex Score"), href: localePath(locale, "/leaderboards/scoring") },
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
        <span className="text-[var(--accent-gold)]">{heading}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        {t("How every card, relic, and potion gets a 0–100 community-meta rating.")}
      </p>

      {/* Hero example */}
      <section className="mb-10 p-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <div className="flex items-center gap-4 mb-3">
          <ScoreBadge score={94} size="lg" showNumber />
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {t("What is the Codex Score?")}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {t("Bayesian-shrunk win-rate, mapped to 0–100 with letter-grade tiers.")}
            </p>
          </div>
        </div>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          {t("Every card, relic, and potion in {game} gets a single number that summarizes how its presence correlates with winning runs, based purely on community-submitted run data, not opinion. 50 is neutral (the average run wins roughly half the time at A0), 100 is the top of the signal, 0 the bottom. It is a naive correlation with known biases (spelled out below), not a verdict on whether a card is good. The same number drives the default sort on every list page and the badge on every detail page.", { game: gameName })}
        </p>
      </section>

      {/* Tier bands */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">{t("Tier bands")}</h2>
        <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-card)]">
                <th className="text-left py-2.5 px-4 font-semibold">{t("Range")}</th>
                <th className="text-left py-2.5 px-3 font-semibold">{t("Tier")}</th>
                <th className="text-left py-2.5 px-3 font-semibold">{t("Label")}</th>
                <th className="text-left py-2.5 px-4 font-semibold">{t("What it means")}</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => {
                const sample = parseInt(tier.range.split("–")[1].trim(), 10);
                return (
                  <tr key={tier.letter} className="border-b border-[var(--border-subtle)] last:border-b-0">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[var(--text-secondary)]">{tier.range}</td>
                    <td className="py-2.5 px-3"><ScoreBadge score={sample} size="md" /></td>
                    <td className="py-2.5 px-3 text-[var(--text-secondary)]">{tier.label}</td>
                    <td className="py-2.5 px-4 text-[var(--text-secondary)]">{tier.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Formula */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">{t("The formula")}</h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          {t("The score has two stages: Bayesian shrinkage (so a 5-pick perfect card doesn't outrank a 500-pick reliable one), then a linear map from win-rate-vs-baseline to the 0–100 scale.")}
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
            <strong>{t("Prior weight = 50.")}</strong>{" "}
            {t("Every entity starts with the equivalent of 50 virtual picks at the baseline win rate. Real picks accumulate against this prior, so scores stabilize as data grows. A 5-pick card with a perfect record only nudges the prior; a 500-pick card with a strong record overpowers it.")}
          </li>
          <li>
            <strong>{t("Scale range = ±15pp.")}</strong>{" "}
            {t("A win-rate gap of 15 percentage points above baseline maps to 100. Scores saturate beyond that, entities outside that band are genuinely off the distribution.")}
          </li>
          <li>
            <strong>{t("Clamp.")}</strong>{" "}
            {t("Scores can't go negative or above 100, even if the math does. The cap is honest: an entity at the cap is “at least this good,” not necessarily “exactly 100.”")}
          </li>
        </ul>
      </section>

      {/* Examples */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">{t("Worked examples")}</h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          {t("Same baseline (50% win rate) for all rows below. Note how sample size matters: the 5-pick perfect record gets B-tier, while the 500-pick 56% record gets A-tier.")}
        </p>
        <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-card)]">
                <th className="text-left py-2.5 px-4 font-semibold">{t("Scenario")}</th>
                <th className="text-right py-2.5 px-3 font-semibold">{t("Picks")}</th>
                <th className="text-right py-2.5 px-3 font-semibold">{t("Wins")}</th>
                <th className="text-right py-2.5 px-3 font-semibold">{t("Win %")}</th>
                <th className="text-left py-2.5 px-4 font-semibold">{t("Score")}</th>
              </tr>
            </thead>
            <tbody>
              {examples.map((ex) => (
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
          {t("Codex Elo, the other half")}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          {t("Codex Score grades win rate, which is honest but confounded: a card's win rate reflects who picks it and what deck it lands in, not just the card. Codex Elo attacks that from the other side. It ignores wins entirely and instead reads revealed preference. Every card-reward screen is treated as a head-to-head where the card you take beats the cards you skip. Fit a Bradley-Terry model over millions of those decisions and you get a rating for “when offered, which card do players actually want?”")}
        </p>
        <ul className="text-sm text-[var(--text-secondary)] space-y-2 list-disc pl-5 mb-4">
          <li>
            <strong>{t("Skill-agnostic.")}</strong>{" "}
            {t("Win rate rises and falls with who's playing the card. A pick decision doesn't. A strong card is preferred whether a great or a mediocre player is choosing, so Elo sidesteps the win-rate confound.")}
          </li>
          <li>
            <strong>{t("Anchored ~1500, 400 per decade.")}</strong>{" "}
            {t("A card picked ten times as often as the field average over its rivals sits ~400 Elo above it, same scale logic as chess.")}
          </li>
          <li>
            <strong>{t("Cards only.")}</strong>{" "}
            {t("Reward screens offer cards, not relics or potions, so base-card Elo exists only for cards.")}
          </li>
          <li>
            <strong>{t("Upgraded cards get their own Elo.")}</strong>{" "}
            {t("Reward screens can offer a card already upgraded, but the run export only records which card was taken, not whether the offer was the “+” version, so every reward pick counts toward the base card and can't speak for the upgraded one. Instead the “+” variant is rated from a different revealed preference: the rest-site Smith decision. When you upgrade a card, it “beats” the other cards in your deck you could have upgraded but didn't. Fit the same Bradley-Terry model over those choices and the “+” row gets a genuine Upgrade Elo, not a copy of the base number. Starters can earn one this way too (you can Smith a Strike).")}
          </li>
        </ul>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          {t("Use them together: Score says “this wins games,” Elo says “players want this when they see it.” Cards high on both are unambiguous; a gap between them is usually a build-around or a situational pick.")}{" "}
          <Link href="/leaderboards/metrics" className="text-[var(--accent-gold)] hover:underline">
            {t("Both live side by side on the Card Metrics table.")}
          </Link>
        </p>
      </section>

      {/* Limitations / disclaimers */}
      <section id="limitations" className="mb-10 scroll-mt-20">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">{t("What the score is not")}</h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
          {t("Codex Score is a naive win-rate correlation, and a correlation carries baggage. The two biggest confounds below are why some obviously good cards can land low and some niche ones can land high. Read a grade as a signal with caveats, not a ruling. Where a card has been offered in reward screens, Codex Elo is the less-confounded counterweight, it is skill-agnostic and not exposure-weighted.")}{" "}
          <Link href="#codex-elo" className="text-[var(--accent-gold)] hover:underline">{t("Jump to Codex Elo")}</Link>
        </p>
        <ul className="text-sm text-[var(--text-secondary)] space-y-3 list-disc pl-5">
          <li>
            <strong>{t("Exposure-time / pick-frequency bias.")}</strong>{" "}
            {t("A card that sits in the deck longer, or gets picked in nearly every run (starters, commons, high-pick staples), absorbs more of every loss it was present for. So heavily-used cards score low even when they're fine, which is why some staples land in the bottom tiers. An F often means “high exposure,” not “bad card.”")}
          </li>
          <li>
            <strong>{t("Survivorship bias.")}</strong>{" "}
            {t("Late-game rares and uncommons only get offered in runs that already got deep, runs that were, on average, already going well. Their win rate is inflated by the run being healthy before the pick, so they can look stronger than they are.")}
          </li>
          <li>
            <strong>{t("Not a personal recommendation.")}</strong>{" "}
            {t("Score answers “what wins for the average submitter?” It can't see your deck, your character, your ascension, or what relics you already have. A C-tier card can be the right pick if it solves your problem.")}
          </li>
          <li>
            <strong>{t("Not normalized by ascension.")}</strong>{" "}
            {t("A relic that's great at A0 and mediocre at A10 gets one blended score. We'll add per-ascension scoring once the sample size at high ascension is statistically meaningful.")}
          </li>
          <li>
            <strong>{t("Not normalized by character.")}</strong>{" "}
            {t("A relic with a 70% win rate on Defect and 45% on Ironclad blends to one number. Per-character scoring is on the roadmap (the data is already in the per-character breakdown table on each detail page).")}
          </li>
          <li>
            <strong>{t("Biased toward submitter pool.")}</strong>{" "}
            {t("The score reflects runs that real humans bothered to submit, disproportionately wins, disproportionately ranked-mode players. The baseline win rate is computed from the same pool, so the bias largely cancels out for relative ranking. But absolute win rates skew higher than the average player's.")}
          </li>
          <li>
            <strong>{t("Refreshes every 30 minutes.")}</strong>{" "}
            {t("Scores are cached server-side. A run you submit right now will affect the next score rebuild, not the one in your browser.")}
          </li>
        </ul>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mt-4">
          {t("To cut the obvious confounds yourself, the Card Metrics table puts Codex Elo next to Score and slices both by per-character and per-run brackets.")}{" "}
          <Link href="/leaderboards/metrics" className="text-[var(--accent-gold)] hover:underline">
            {t("Card Metrics")} →
          </Link>
        </p>
      </section>

      {/* Further reading / cross-links */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">{t("See it in action")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/cards?sort=score"
            className="block p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-accent)] transition-colors"
          >
            <div className="text-sm font-semibold text-[var(--text-primary)] mb-1">{t("Cards by score")}</div>
            <div className="text-xs text-[var(--text-muted)]">{t("Top-tier cards, sortable by Codex Score.")}</div>
          </Link>
          <Link
            href="/relics?sort=score"
            className="block p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-accent)] transition-colors"
          >
            <div className="text-sm font-semibold text-[var(--text-primary)] mb-1">{t("Relics by score")}</div>
            <div className="text-xs text-[var(--text-muted)]">{t("Best-rated relics across all pools.")}</div>
          </Link>
          <Link
            href="/potions?sort=score"
            className="block p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-accent)] transition-colors"
          >
            <div className="text-sm font-semibold text-[var(--text-primary)] mb-1">{t("Potions by score")}</div>
            <div className="text-xs text-[var(--text-muted)]">{t("Tier list of every potion in the game.")}</div>
          </Link>
        </div>
      </section>

      {/* Submit prompt */}
      <section className="p-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">
          {t("Improve the scores")}
        </h3>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-3">
          {t("Every score gets sharper when more runs are submitted, especially losses, which are chronically underrepresented in community datasets. The submitter pool is the data.")}
        </p>
        <Link
          href="/leaderboards/submit"
          className="inline-block text-sm font-medium text-[var(--accent-gold)] hover:underline"
        >
          {t("→ Submit a run")}
        </Link>
      </section>
    </div>
  );
}
