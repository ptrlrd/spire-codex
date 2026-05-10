import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";
import TierList, { type TierEntity } from "@/app/components/TierList";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const dynamic = "force-dynamic";

interface ApiRelic {
  id: string;
  name: string;
  image_url: string | null;
  pool: string;
}

interface ScoresMap {
  [id: string]: { score: number | null };
}

const POOL_FILTERS = [
  { value: "",            label: "All relics" },
  { value: "shared",      label: "Shared" },
  { value: "ironclad",    label: "Ironclad" },
  { value: "silent",      label: "Silent" },
  { value: "defect",      label: "Defect" },
  { value: "necrobinder", label: "Necrobinder" },
  { value: "regent",      label: "Regent" },
];

interface PageProps {
  searchParams: Promise<{ pool?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  const pool = sp.pool?.toLowerCase();
  const poolLabel = POOL_FILTERS.find((p) => p.value === pool)?.label;
  const scope = poolLabel && pool ? `${poolLabel} Relic` : "Relic";
  const title = `Slay the Spire 2 ${scope} Tier List - Ranked S to F | ${SITE_NAME}`;
  const description = pool
    ? `${poolLabel} relic tier list for Slay the Spire 2. Every relic in the ${pool} pool ranked S through F by community win rate.`
    : "Every Slay the Spire 2 relic ranked S through F. Codex Score from community-submitted run win rates with Bayesian shrinkage.";
  const path = `/tier-list/relics${pool ? `?pool=${pool}` : ""}`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}${path}` },
    openGraph: { title, description, url: `${SITE_URL}${path}`, siteName: SITE_NAME, type: "website" },
  };
}

async function fetchData(pool?: string): Promise<{ relics: ApiRelic[]; scores: ScoresMap }> {
  const relicsUrl = `${API_INTERNAL}/api/relics${pool ? `?pool=${pool}` : ""}`;
  const scoresUrl = `${API_INTERNAL}/api/runs/scores/relics`;
  try {
    const [relicsRes, scoresRes] = await Promise.all([
      fetch(relicsUrl, { next: { revalidate: 1800 } }),
      fetch(scoresUrl, { next: { revalidate: 300 } }),
    ]);
    const relics = relicsRes.ok ? ((await relicsRes.json()) as ApiRelic[]) : [];
    const scores = scoresRes.ok ? ((await scoresRes.json()) as ScoresMap) : {};
    return { relics, scores };
  } catch {
    return { relics: [], scores: {} };
  }
}

export default async function RelicsTierListPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const pool = sp.pool?.toLowerCase();
  const { relics, scores } = await fetchData(pool);

  const entities: TierEntity[] = relics.map((r) => ({
    id: r.id,
    name: r.name,
    image_url: r.image_url,
    score: scores[r.id.toUpperCase()]?.score ?? null,
  }));

  const poolLabel = POOL_FILTERS.find((p) => p.value === pool)?.label;
  const heading = poolLabel && pool ? `${poolLabel} Relic Tier List` : "Relic Tier List";

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Tier List", href: "/tier-list" },
      { name: heading, href: `/tier-list/relics${pool ? `?pool=${pool}` : ""}` },
    ]),
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />

      <div className="flex items-baseline gap-3 mb-2 flex-wrap">
        <h1 className="text-3xl font-bold">
          <span className="text-[var(--accent-gold)]">{heading}</span>
        </h1>
        <span className="text-sm text-[var(--text-muted)]">{entities.length.toLocaleString()} relics</span>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Ranked by <Link href="/leaderboards/scoring" className="text-[var(--accent-gold)] hover:underline">Codex Score</Link> —
        community win-rate data with Bayesian shrinkage so a 5-pick relic doesn&apos;t outrank a
        500-pick one. Click any relic for full stats.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-6">
        {POOL_FILTERS.map((opt) => {
          const isActive = (pool ?? "") === opt.value;
          const href = opt.value ? `/tier-list/relics?pool=${opt.value}` : "/tier-list/relics";
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

      <TierList route="relics" entities={entities} />
    </div>
  );
}
