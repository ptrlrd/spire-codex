import { Suspense } from "react";
import type { Relic } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import RelicsClient from "./RelicsClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default async function RelicsPage() {
  let relics: Relic[] = [];
  try {
    const res = await fetch(`${API}/api/relics?lang=eng`, { next: { revalidate: 300 } });
    if (res.ok) relics = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Relics", href: "/relics" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Relics",
      description: "Browse every relic across all rarities and character pools.",
      path: "/relics",
      items: relics.map((r) => ({ name: r.name, path: `/relics/${r.id.toLowerCase()}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Slay the Spire 2 Relics</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Browse every relic across Ironclad, Silent, Defect, Necrobinder, and Regent. Filter by rarity and character pool.
      </p>

      <RecentlyAdded entityType="relics" label="Relic" pathPrefix="/relics" />

      <Suspense>
        <RelicsClient initialRelics={relics} />
      </Suspense>
    </div>
  );
}
