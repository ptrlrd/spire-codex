import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, buildLanguageAlternates } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import TierList, { type TierEntity } from "@/app/components/TierList";
import BracketFilter from "@/app/components/BracketFilter";
import { bracketParam, normalizeBracket } from "@/lib/content-brackets";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Scores refresh on the backend every 60s; 5min HTML cache keeps
// edge responses sub-25ms without showing painfully stale data.
export const revalidate = 300;

interface ApiCard {
  id: string;
  name: string;
  image_url: string | null;
}

interface ScoresMap {
  [id: string]: { score: number | null; elo: number | null; picks: number; wins: number; win_rate: number };
}

const COLOR_FILTERS = [
  { value: "",            label: "All cards" },
  { value: "ironclad",    label: "Ironclad" },
  { value: "silent",      label: "Silent" },
  { value: "defect",      label: "Defect" },
  { value: "necrobinder", label: "Necrobinder" },
  { value: "regent",      label: "Regent" },
  { value: "colorless",   label: "Colorless" },
];

type SortMode = "score" | "elo";

// Codex Elo is tightly bunched (most cards cluster near the 1500 anchor), so
// fixed Elo thresholds would dump almost everything into one band. Instead the
// Elo view bands by percentile rank within the rated pool: the top slice is S,
// and so on. Cumulative upper bounds, walked in order.
const ELO_TIER_BANDS: { letter: "S" | "A" | "B" | "C" | "D" | "F"; maxPct: number }[] = [
  { letter: "S", maxPct: 0.10 },
  { letter: "A", maxPct: 0.25 },
  { letter: "B", maxPct: 0.50 },
  { letter: "C", maxPct: 0.75 },
  { letter: "D", maxPct: 0.90 },
  { letter: "F", maxPct: 1.0 },
];

interface BaseCard {
  id: string;
  name: string;
  image_url: string | null;
  score: number | null;
  elo: number | null;
}

// Band cards by Codex Elo percentile. Only cards with an Elo are shown: Elo
// exists solely for reward-offered base cards, so upgraded variants and
// never-offered cards have none and are dropped from this view entirely (Elo
// can't be fabricated for them). Rated cards are ranked desc and sliced into
// S-F by position.
function eloTiered(cards: BaseCard[]): TierEntity[] {
  const rated = cards
    .filter((c) => c.elo != null)
    .sort((a, b) => (b.elo as number) - (a.elo as number));
  const n = rated.length;
  const tierAt = (idx: number): "S" | "A" | "B" | "C" | "D" | "F" => {
    const pct = n ? idx / n : 1;
    for (const b of ELO_TIER_BANDS) if (pct < b.maxPct) return b.letter;
    return "F";
  };
  return rated.map((c, idx) => ({
    id: c.id,
    name: c.name,
    image_url: c.image_url,
    score: null,
    tier: tierAt(idx),
    value: c.elo,
  }));
}

interface PageProps {
  searchParams: Promise<{ color?: string; sort?: string; bracket?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  const color = sp.color?.toLowerCase();
  const charLabel = COLOR_FILTERS.find((c) => c.value === color)?.label;
  const scope = charLabel && color ? `${charLabel} Cards` : "Cards";
  // Title leads with STS2 abbreviation + full game name to capture both
  // query phrasings ("sts2 tier list" vs "slay the spire 2 tier list").
  const title = `${scope} Tier List - Slay the Spire 2 (sts2) | ${SITE_NAME}`;
  const description = color
    ? `${charLabel} card tier list for Slay the Spire 2 (sts2). Every ${charLabel?.toLowerCase()} card ranked S through F based on community win-rate data.`
    : "Every Slay the Spire 2 (sts2) card ranked S through F. Tier list driven by Codex Score, community-submitted run win rates with Bayesian shrinkage.";
  const path = `/tier-list/cards${color ? `?color=${color}` : ""}`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}${path}`, languages: buildLanguageAlternates(`${path}`) },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${path}`,
      siteName: SITE_NAME,
      type: "website",
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

async function fetchData(
  color?: string,
  param?: string | null,
): Promise<{ cards: ApiCard[]; scores: ScoresMap }> {
  // Two parallel fetches: the entity list (filtered by color server-side
  // to keep payloads small) + the bulk-scores map. Failures degrade
  // gracefully to empty so the page still renders the "no data" state
  // instead of a 500 (e.g. during cold-start cache miss).
  const cardsUrl = `${API_INTERNAL}/api/cards${color ? `?color=${color}` : ""}`;
  const scoresUrl = `${API_INTERNAL}/api/runs/scores/cards${param ? `?bracket=${param}` : ""}`;
  try {
    const [cardsRes, scoresRes] = await Promise.all([
      fetch(cardsUrl, { next: { revalidate: 1800 } }),
      fetch(scoresUrl, { next: { revalidate: 300 } }),
    ]);
    const cards = cardsRes.ok ? ((await cardsRes.json()) as ApiCard[]) : [];
    const scores = scoresRes.ok ? ((await scoresRes.json()) as ScoresMap) : {};
    return { cards, scores };
  } catch {
    return { cards: [], scores: {} };
  }
}

export default async function CardsTierListPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const color = sp.color?.toLowerCase();
  const sort: SortMode = sp.sort === "elo" ? "elo" : "score";
  const bracket = normalizeBracket(sp.bracket);
  const param = bracketParam(bracket);
  const { cards, scores } = await fetchData(color, param);

  const base: BaseCard[] = cards
    // mad_science is a multi-type event card with no full render; hide it.
    .filter((c) => c.id.toLowerCase() !== "mad_science")
    // The scores endpoint is the source of truth for which cards are
    // rankable: it already drops non-reward colors (curse/status/event/quest/
    // token) and starters (Basic rarity). Cards absent from it (excluded, or
    // never seen in a submitted run) don't belong on the tier list.
    .filter((c) => scores[c.id.toUpperCase()] !== undefined)
    .map((c) => {
      const sc = scores[c.id.toUpperCase()];
      return {
        id: c.id,
        name: c.name,
        image_url: c.image_url,
        score: sc?.score ?? null,
        elo: sc?.elo ?? null,
      };
    });

  // Codex Score view bands the 0-100 score (TierList's default); Codex Elo
  // view bands by Elo percentile (precomputed tier + Elo as the tile value).
  const entities: TierEntity[] =
    sort === "elo"
      ? eloTiered(base)
      : base.map(({ id, name, image_url, score }) => ({ id, name, image_url, score }));

  const charLabel = COLOR_FILTERS.find((c) => c.value === color)?.label;
  const heading = charLabel && color ? `${charLabel} Card Tier List` : "Card Tier List";
  // Canonical path is the Codex Score view; the ?sort=elo variant shares it
  // (set in generateMetadata) so the two don't read as duplicate content.
  const path = `/tier-list/cards${color ? `?color=${color}` : ""}`;
  // Preserve color when switching sort, and vice versa.
  const sortHref = (s: SortMode) => {
    const params = new URLSearchParams();
    if (color) params.set("color", color);
    if (s === "elo") params.set("sort", "elo");
    if (bracket !== "all") params.set("bracket", bracket);
    const qs = params.toString();
    return `/tier-list/cards${qs ? `?${qs}` : ""}`;
  };
  const metric = sort === "elo" ? "Codex Elo" : "Codex Score";

  // Top-30 for the ItemList JSON-LD, gives Google a structured ranked list
  // it can render as carousel-style rich results. Capped at 30 because
  // longer ItemLists inflate the JSON without much SEO gain.
  const rankedItems = [...base]
    .filter((e) => (sort === "elo" ? e.elo != null : e.score != null))
    .sort((a, b) =>
      sort === "elo" ? (b.elo ?? 0) - (a.elo ?? 0) : (b.score ?? 0) - (a.score ?? 0),
    )
    .slice(0, 30)
    .map((e) => ({
      name: e.name,
      path: `/cards/${e.id.toLowerCase()}`,
    }));

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Tier List", href: "/tier-list" },
      { name: heading, href: path },
    ]),
    buildCollectionPageJsonLd({
      name: heading,
      description: `Slay the Spire 2 (sts2) ${heading.toLowerCase()} ranked by ${metric} from community-submitted run data.`,
      path,
      items: rankedItems,
    }),
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />

      <div className="flex items-baseline gap-3 mb-2 flex-wrap">
        <h1 className="text-3xl font-bold">
          <span className="text-[var(--accent-gold)]">{heading}</span>
        </h1>
        <span className="text-sm text-[var(--text-muted)]">{entities.length.toLocaleString()} cards</span>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        {sort === "elo" ? (
          <>
            Ranked by <Link href="/leaderboards/scoring" className="text-[var(--accent-gold)] hover:underline">Codex Elo</Link>,
            a revealed-preference rating from which cards players take over the ones they skip.
            Banded by percentile, so S is the most-drafted slice. Skill-agnostic and not
            exposure-weighted, so it dodges the biases the win-rate Score carries.
          </>
        ) : (
          <>
            Ranked by <Link href="/leaderboards/scoring" className="text-[var(--accent-gold)] hover:underline">Codex Score</Link>,
            community-submitted run win rates, Bayesian-shrunk so low-pick cards stay near neutral.
            It&apos;s a naive win-rate signal with{" "}
            <Link href="/leaderboards/scoring#limitations" className="text-[var(--accent-gold)] hover:underline">known biases</Link>{" "}
            (high-exposure staples sink, late rares float), not a verdict, switch to Codex Elo for
            the less-confounded view. Click any card for full stats.
          </>
        )}
      </p>

      {/* Score vs Elo view toggle. Two distinct lenses, not a blend: Score is
          a win-rate outcome signal, Elo is a draft-preference signal, and the
          two are near-uncorrelated, so we never collapse them to one number. */}
      <div className="flex flex-wrap items-center gap-1.5 mb-5">
        <span className="text-xs text-[var(--text-muted)] mr-1">Rank by</span>
        {([
          { value: "score", label: "Codex Score" },
          { value: "elo", label: "Codex Elo" },
        ] as const).map((opt) => {
          const isActive = sort === opt.value;
          return (
            <Link
              key={opt.value}
              href={sortHref(opt.value)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                isActive
                  ? "bg-[var(--accent-gold)]/10 border-[var(--accent-gold)]/40 text-[var(--accent-gold)]"
                  : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>

      {/* Character filter, anchor links so each filtered view is its
          own indexable URL (good for "ironclad tier list" SEO). */}
      <div className="flex flex-wrap items-center gap-1.5 mb-6">
        <span className="text-xs text-[var(--text-muted)] mr-1">Characters</span>
        {COLOR_FILTERS.map((opt) => {
          const isActive = (color ?? "") === opt.value;
          const params = new URLSearchParams();
          if (opt.value) params.set("color", opt.value);
          if (sort === "elo") params.set("sort", "elo");
          if (bracket !== "all") params.set("bracket", bracket);
          const qs = params.toString();
          const href = `/tier-list/cards${qs ? `?${qs}` : ""}`;
          return (
            <Link
              key={opt.value || "all"}
              href={href}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                isActive
                  ? "bg-[var(--accent-gold)]/10 border-[var(--accent-gold)]/40 text-[var(--accent-gold)]"
                  : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>

      {/* Content bracket: grade against all runs, A10, or win-rate skill tiers. */}
      <BracketFilter
        basePath="/tier-list/cards"
        current={bracket}
        extraParams={{ color, sort: sort === "elo" ? "elo" : undefined }}
        composite
      />

      <TierList route="cards" entities={entities} valueLabel={sort === "elo" ? "Elo" : "Score"} />
    </div>
  );
}
