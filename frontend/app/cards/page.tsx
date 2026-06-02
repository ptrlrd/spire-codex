import { Suspense } from "react";
import Link from "next/link";
import type { Card } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import {
  buildCollectionPageJsonLd,
  buildBreadcrumbJsonLd,
  buildFAQPageJsonLd,
} from "@/lib/jsonld";
import ScoreBadge from "@/app/components/ScoreBadge";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import CardsClient from "./CardsClient";
import { imageUrl } from "@/lib/image-url";

const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

// ISR with 60s revalidation, mirroring the home page. Without a
// page-level revalidate the build-time render (backend unreachable
// inside the Docker builder) bakes empty data that never refreshes,
// which is what zeroed out the card counts below. The inner fetches
// revalidate faster (30s) so each regen pulls fresh data.
export const revalidate = 60;

// Fetch JSON with its own try/catch so a failure on one endpoint can't
// take down the other. Previously both fetches shared one Promise.all +
// try/catch, so a hiccup on /api/runs/scores/cards left `cards` empty
// and rendered every count as 0.
async function fetchJSON<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

// Character anchors for the "Browse cards by character" hub section.
// Tagline is short and factual to give Google additional substring
// matches for character-specific long-tail queries (e.g. "silent cards
// sts2 poison") without bloating the page.
const CHARACTERS: { id: string; name: string; tagline: string }[] = [
  { id: "ironclad", name: "Ironclad", tagline: "Strength and heavy block, grindy attack chains." },
  { id: "silent", name: "Silent", tagline: "Poison, shivs, discard-fuel combos." },
  { id: "defect", name: "Defect", tagline: "Orb stacking, Lightning, Frost, Plasma, Dark." },
  { id: "necrobinder", name: "Necrobinder", tagline: "Bone tokens, summons, sacrifice loops." },
  { id: "regent", name: "Regent", tagline: "Court attendants, decree powers, prestige scaling." },
];

// Matches the shape returned by /api/runs/scores/{entity_type}
// (run_entity_stats.get_all_entity_scores): the response is a dict
// keyed by entity_id, and each value carries score + raw counts +
// already-percentaged win_rate (e.g. 50.8 means 50.8%). entity_id
// is the key, not a field on the value, so the SSR has to thread it
// in when flattening to an array.
interface ScoreEntry {
  score: number | null;
  win_rate: number;
  picks: number;
  wins: number;
}
type ScoreRow = ScoreEntry & { entity_id: string };

export default async function CardsPage() {
  // Fetch the catalog + Codex Scores in parallel so the server-rendered
  // HTML carries every fact this page surfaces. No client-side hydration
  // step is required for Google to see the intro prose, the top-N
  // section, or the character breakdown -- they're all in the initial
  // response.
  const [cards, scoresRaw] = await Promise.all([
    fetchJSON<Card[]>(`${API}/api/cards?lang=eng`, []),
    fetchJSON<Record<string, ScoreEntry>>(
      `${API}/api/runs/scores/cards`,
      {},
    ),
  ]);
  // The endpoint keys the score by entity_id; carry that through onto
  // each row so the .map below can look the card up. Previously the
  // page did Object.values(scoresRaw) and then read s.entity_id, which
  // threw "Cannot read properties of undefined (reading 'toLowerCase')"
  // and crashed the SSR render, which is why every count fell back to
  // the build-time empty prerender.
  const scores: ScoreRow[] = Object.entries(scoresRaw).map(
    ([entity_id, s]) => ({ ...s, entity_id }),
  );

  const totalCards = cards.length;
  const cardsByCharacter = CHARACTERS.map((char) => ({
    ...char,
    count: cards.filter(
      (c) => (c.color || "").toLowerCase() === char.id.toLowerCase(),
    ).length,
  }));

  // Top-6 by Codex Score, only cards that have stats (so the section
  // never renders empty placeholders during a fresh deploy when the
  // entity_stats_snapshot is still warming).
  const cardById = new Map(cards.map((c) => [c.id.toLowerCase(), c]));
  const topByScore = scores
    .filter((s) => s.score != null && s.picks > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 24)
    .map((s) => {
      if (typeof s.entity_id !== "string") return null;
      const card = cardById.get(s.entity_id.toLowerCase());
      return card ? { card, score: s } : null;
    })
    .filter((x): x is { card: Card; score: ScoreRow } => x !== null)
    .slice(0, 6);

  const faq = [
    {
      question: "How many cards are in Slay the Spire 2?",
      answer: `Slay the Spire 2 has ${totalCards.toLocaleString()} cards across the five characters, Ironclad, Silent, Defect, Necrobinder, and Regent, plus colorless, event, and token cards. Spire Codex updates the catalog automatically with each patch by re-parsing the decompiled game source.`,
    },
    {
      question: "Which sts2 cards have the best win rates?",
      answer:
        "Spire Codex computes a Codex Score for every card using a Bayesian-shrunk win rate from community-tracked runs, so cards with a few high-win-rate samples don't outrank cards with thousands of runs. The S-tier picks shown above update continuously as new runs are submitted; see the tier list for the full S→F ranking.",
    },
    {
      question: "What are the card rarities in sts2?",
      answer:
        "Cards come in four rarities, Common, Uncommon, Rare, and Boss, plus Starter cards in each character's opening deck. Rarity affects merchant pricing, card-reward drop odds, and tier-list balance: Boss cards can swing a run, while Common pickability matters more in long campaigns.",
    },
    {
      question: "Where does the card data come from?",
      answer:
        "Card definitions are parsed directly from the decompiled Slay the Spire 2 game source on every patch (so cost, damage, block, keywords, and resolved DynamicVars stay canonical). Pick rates, win rates, and tier scores are aggregated live from community-submitted .run files uploaded via the Overwolf overlay and the website.",
    },
  ];

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Cards", href: "/cards" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Cards",
      description:
        "Browse every card across Ironclad, Silent, Defect, Necrobinder, and Regent.",
      path: "/cards",
      items: cards.map((c) => ({ name: c.name, path: `/cards/${c.id.toLowerCase()}` })),
    }),
    buildFAQPageJsonLd(faq),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />

      <h1 className="text-3xl font-bold mb-3">
        <span className="text-[var(--accent-gold)]">Slay the Spire 2 (sts2) Cards</span>
      </h1>

      {/* Server-rendered intro prose: this is what Google sees when it
          renders the page. Targets the "sts2 cards" / "slay the spire 2
          cards" category query intent with real factual content rather
          than a one-line directory header. */}
      <section className="mb-8 space-y-3 text-[var(--text-default)] max-w-3xl">
        <p>
          Every <strong>Slay the Spire 2</strong> card in one place, all{" "}
          {totalCards.toLocaleString()} cards from the five characters (
          {CHARACTERS.map((c) => c.name).join(", ")}), with live pick rates,
          win rates, and tier scores aggregated from community-tracked runs.
          The card catalog is parsed directly from the game on every patch,
          so values stay canonical, and stats update continuously as players
          upload runs from the Overwolf overlay.
        </p>
        <p className="text-sm text-[var(--text-muted)]">
          Sort the grid below by Codex Score to see the current meta picks at
          a glance, or filter by character, rarity, type, or keyword to dig
          into a specific archetype. Each card links to a detail page with
          per-character win rates, upgrade values, recent runs that picked
          it, and the full description (including resolved DynamicVars for
          upgraded variants).
        </p>
      </section>

      {/* Top by Codex Score: server-rendered ranked content that the wiki
          literally cannot generate. Each card links to its detail page,
          building internal-link surface area to high-intent landing pages
          that compete for long-tail entity queries. */}
      {topByScore.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3">
            Highest-rated sts2 cards right now
          </h2>
          <p className="text-sm text-[var(--text-muted)] mb-4 max-w-3xl">
            Top picks by Codex Score, a Bayesian-shrunk win rate that
            adjusts for sample size, so a card with a 60% win rate over 5
            runs doesn&apos;t outrank one with a 55% win rate over 5,000.
            Updates continuously from submitted runs.
          </p>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {topByScore.map(({ card, score }) => (
              <li key={card.id}>
                <Link
                  href={`/cards/${card.id.toLowerCase()}`}
                  className="block group p-3 rounded-lg border border-[var(--border-subtle)] hover:border-[var(--accent-gold)] transition-colors"
                >
                  {card.image_url && (
                    <img
                      src={imageUrl(card.image_url)}
                      alt={`${card.name} - Slay the Spire 2 card`}
                      className="w-full h-28 object-contain mb-2"
                      loading="lazy"
                    />
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium group-hover:text-[var(--accent-gold)] transition-colors truncate">
                      {card.name}
                    </span>
                    {score.score != null && (
                      <ScoreBadge score={score.score} size="sm" />
                    )}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">
                    {score.win_rate.toFixed(1)}% win ·{" "}
                    {score.picks.toLocaleString()} picks
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Per-character breakdown: server-rendered internal links targeting
          character-specific long-tail queries ("ironclad cards sts2",
          "silent cards", etc.). Each link uses the color query param so
          the destination is the filtered grid view rather than a 404. */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">Browse cards by character</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {cardsByCharacter.map((char) => (
            <li key={char.id}>
              <Link
                href={`/cards?color=${char.id}`}
                className="block p-3 rounded-lg border border-[var(--border-subtle)] hover:border-[var(--accent-gold)] transition-colors"
              >
                <div className="font-medium text-[var(--accent-gold)]">
                  {char.name}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  {char.count} cards
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">
                  {char.tagline}
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-sm text-[var(--text-muted)] mt-4">
          Looking for tier rankings? See the full{" "}
          <Link
            href="/tier-list/cards"
            className="text-[var(--accent-gold)] hover:underline"
          >
            sts2 card tier list
          </Link>{" "}
          for S-through-F tiers, or check the{" "}
          <Link
            href="/leaderboards/stats"
            className="text-[var(--accent-gold)] hover:underline"
          >
            community stats page
          </Link>{" "}
          for win-rate breakdowns by ascension level.
        </p>
      </section>

      <RecentlyAdded entityType="cards" label="Card" pathPrefix="/cards" />

      <Suspense>
        <CardsClient initialCards={cards} />
      </Suspense>

      {/* FAQ block: visible content plus FAQPage JSON-LD above gives
          Google a chance at the People-Also-Ask rich result. Below the
          grid so it doesn't push the catalog below the fold. */}
      <section className="mt-12 max-w-3xl">
        <h2 className="text-xl font-semibold mb-4">
          Frequently asked about sts2 cards
        </h2>
        <dl className="space-y-4">
          {faq.map((q) => (
            <div key={q.question}>
              <dt className="font-medium text-[var(--accent-gold)]">
                {q.question}
              </dt>
              <dd className="text-sm text-[var(--text-default)] mt-1">
                {q.answer}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
