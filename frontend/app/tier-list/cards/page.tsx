import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import TierList, { type TierEntity } from "@/app/components/TierList";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const dynamic = "force-dynamic"; // scores update every 30 minutes

interface ApiCard {
  id: string;
  name: string;
  image_url: string | null;
  color: string;
}

interface ScoresMap {
  [id: string]: { score: number | null; picks: number; wins: number; win_rate: number };
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

interface PageProps {
  searchParams: Promise<{ color?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  const color = sp.color?.toLowerCase();
  const charLabel = COLOR_FILTERS.find((c) => c.value === color)?.label;
  const scope = charLabel && color ? `${charLabel} Cards` : "Cards";
  // Title leads with STS2 abbreviation + full game name to capture both
  // query phrasings ("sts2 tier list" vs "slay the spire 2 tier list").
  const title = `STS2 ${scope} Tier List - Slay the Spire 2 Cards Ranked | ${SITE_NAME}`;
  const description = color
    ? `${charLabel} card tier list for Slay the Spire 2 (STS2). Every ${charLabel?.toLowerCase()} card ranked S through F based on community win-rate data.`
    : "Every Slay the Spire 2 (STS2) card ranked S through F. Tier list driven by Codex Score — community-submitted run win rates with Bayesian shrinkage.";
  const path = `/tier-list/cards${color ? `?color=${color}` : ""}`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}${path}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${path}`,
      siteName: SITE_NAME,
      type: "website",
    },
  };
}

async function fetchData(color?: string): Promise<{ cards: ApiCard[]; scores: ScoresMap }> {
  // Two parallel fetches: the entity list (filtered by color server-side
  // to keep payloads small) + the bulk-scores map. Failures degrade
  // gracefully to empty so the page still renders the "no data" state
  // instead of a 500 (e.g. during cold-start cache miss).
  const cardsUrl = `${API_INTERNAL}/api/cards${color ? `?color=${color}` : ""}`;
  const scoresUrl = `${API_INTERNAL}/api/runs/scores/cards`;
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
  const { cards, scores } = await fetchData(color);

  const entities: TierEntity[] = cards.map((c) => ({
    id: c.id,
    name: c.name,
    image_url: c.image_url,
    score: scores[c.id.toUpperCase()]?.score ?? null,
  }));

  const charLabel = COLOR_FILTERS.find((c) => c.value === color)?.label;
  const heading = charLabel && color ? `${charLabel} Card Tier List` : "Card Tier List";
  const path = `/tier-list/cards${color ? `?color=${color}` : ""}`;

  // Top-30 by score for the ItemList JSON-LD — gives Google a structured
  // ranked list it can render as carousel-style rich results. Capped at
  // 30 because longer ItemLists inflate the JSON without much SEO gain.
  const rankedItems = [...entities]
    .filter((e) => e.score != null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
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
      description: `Slay the Spire 2 (STS2) ${heading.toLowerCase()} ranked by Codex Score from community-submitted run win rates.`,
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
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Ranked by <Link href="/leaderboards/scoring" className="text-[var(--accent-gold)] hover:underline">Codex Score</Link> —
        community-submitted run win rates, Bayesian-shrunk so low-pick cards stay near neutral.
        Click any card for full stats.
      </p>

      {/* Character filter — anchor links so each filtered view is its
          own indexable URL (good for "ironclad tier list" SEO). */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {COLOR_FILTERS.map((opt) => {
          const isActive = (color ?? "") === opt.value;
          const href = opt.value
            ? `/tier-list/cards?color=${opt.value}`
            : "/tier-list/cards";
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

      <TierList route="cards" entities={entities} />
    </div>
  );
}
