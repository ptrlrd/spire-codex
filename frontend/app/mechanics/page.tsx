import type { Metadata } from "next";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import Link from "next/link";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

export interface MechanicSectionMeta {
  slug: string;
  title: string;
  description: string;
  category: "mechanics" | "secrets";
  order: number;
}

export const metadata: Metadata = {
  title: `Slay the Spire 2 (STS2) Game Mechanics - Drop Rates, Combat & Map Data | ${SITE_NAME}`,
  description:
    "Complete game mechanics for Slay the Spire 2. Card rarity odds, relic distribution, potion chances, gold rewards, map generation, combat formulas, secrets, and more — all extracted from the game's source code.",
  alternates: { canonical: `${SITE_URL}/mechanics` },
  openGraph: {
    title: `Slay the Spire 2 (STS2) Game Mechanics | ${SITE_NAME}`,
    description: "Every drop rate, reward chance, and game formula extracted from the source code.",
    url: `${SITE_URL}/mechanics`,
    siteName: SITE_NAME,
    type: "website",
  },
};

async function fetchSections(): Promise<MechanicSectionMeta[]> {
  // Tolerates ECONNREFUSED — the Docker frontend build runs `npm run build`
  // before the backend container exists, and Next.js will still try to
  // statically render this page. Returning [] lets the build succeed; the
  // page renders empty in the build output and is hydrated on first
  // post-deploy request.
  try {
    const res = await fetch(`${API_INTERNAL}/api/mechanics/sections`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    return (await res.json()) as MechanicSectionMeta[];
  } catch {
    return [];
  }
}

export default async function MechanicsPage() {
  const sections = await fetchSections();
  const mechanics = sections.filter((s) => s.category === "mechanics");
  const secrets = sections.filter((s) => s.category === "secrets");

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Mechanics", href: "/mechanics" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Game Mechanics",
      description: "Complete game mechanics data extracted from the source code.",
      path: "/mechanics",
      items: sections.map((s) => ({ name: s.title, path: `/mechanics/${s.slug}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Game Mechanics</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        Every drop rate, reward chance, and game formula extracted from Slay the Spire 2&apos;s decompiled source code. All values are exact.
      </p>

      <h2 id="mechanics" className="text-xl font-semibold text-[var(--accent-gold)] mb-4">Mechanics</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {mechanics.map((s) => (
          <Link
            key={s.slug}
            href={`/mechanics/${s.slug}`}
            className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-5 hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-accent)] transition-all cursor-pointer block"
          >
            <h3 className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-gold)] mb-2">{s.title}</h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2">{s.description}</p>
          </Link>
        ))}
      </div>

      <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">Secrets &amp; Trivia</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {secrets.map((s) => (
          <Link
            key={s.slug}
            href={`/mechanics/${s.slug}`}
            className="bg-[var(--bg-card)] rounded-lg border border-emerald-800/30 p-5 hover:bg-[var(--bg-card-hover)] hover:border-emerald-600/50 transition-all cursor-pointer block"
          >
            <h3 className="font-semibold text-emerald-400 mb-2">{s.title}</h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2">{s.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
