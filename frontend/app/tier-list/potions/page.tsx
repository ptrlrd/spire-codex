import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";
import TierList, { type TierEntity } from "@/app/components/TierList";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const dynamic = "force-dynamic";

interface ApiPotion {
  id: string;
  name: string;
  image_url: string | null;
  pool?: string | null;
}

interface ScoresMap {
  [id: string]: { score: number | null };
}

export const metadata: Metadata = {
  title: `Slay the Spire 2 Potion Tier List - All 63 Potions Ranked | ${SITE_NAME}`,
  description:
    "Every Slay the Spire 2 potion ranked S through F by community win rate. Codex Score with Bayesian shrinkage. Updated every 30 minutes.",
  alternates: { canonical: `${SITE_URL}/tier-list/potions` },
  openGraph: {
    title: `Slay the Spire 2 Potion Tier List | ${SITE_NAME}`,
    description: "Every potion ranked S through F by community win-rate data.",
    url: `${SITE_URL}/tier-list/potions`,
    siteName: SITE_NAME,
    type: "website",
  },
};

async function fetchData(): Promise<{ potions: ApiPotion[]; scores: ScoresMap }> {
  try {
    const [potionsRes, scoresRes] = await Promise.all([
      fetch(`${API_INTERNAL}/api/potions`, { next: { revalidate: 1800 } }),
      fetch(`${API_INTERNAL}/api/runs/scores/potions`, { next: { revalidate: 300 } }),
    ]);
    const potions = potionsRes.ok ? ((await potionsRes.json()) as ApiPotion[]) : [];
    const scores = scoresRes.ok ? ((await scoresRes.json()) as ScoresMap) : {};
    return { potions, scores };
  } catch {
    return { potions: [], scores: {} };
  }
}

export default async function PotionsTierListPage() {
  const { potions, scores } = await fetchData();

  const entities: TierEntity[] = potions.map((p) => ({
    id: p.id,
    name: p.name,
    image_url: p.image_url,
    score: scores[p.id.toUpperCase()]?.score ?? null,
  }));

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Tier List", href: "/tier-list" },
      { name: "Potion Tier List", href: "/tier-list/potions" },
    ]),
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />

      <div className="flex items-baseline gap-3 mb-2 flex-wrap">
        <h1 className="text-3xl font-bold">
          <span className="text-[var(--accent-gold)]">Potion Tier List</span>
        </h1>
        <span className="text-sm text-[var(--text-muted)]">{entities.length.toLocaleString()} potions</span>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Ranked by <Link href="/leaderboards/scoring" className="text-[var(--accent-gold)] hover:underline">Codex Score</Link> —
        community win-rate data with Bayesian shrinkage. Click any potion for full stats.
      </p>

      <TierList route="potions" entities={entities} />
    </div>
  );
}
