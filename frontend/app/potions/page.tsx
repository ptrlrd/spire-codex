import { Suspense } from "react";
import type { Potion } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import PotionsClient from "./PotionsClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default async function PotionsPage() {
  let potions: Potion[] = [];
  try {
    const res = await fetch(`${API}/api/potions?lang=eng`, { next: { revalidate: 300 } });
    if (res.ok) potions = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Potions", href: "/potions" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Potions",
      description: "Browse every potion across all character pools.",
      path: "/potions",
      items: potions.map((p) => ({ name: p.name, path: `/potions/${p.id.toLowerCase()}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Slay the Spire 2 Potions</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Browse every potion across Ironclad, Silent, Defect, Necrobinder, and Regent. Filter by rarity and character pool.
      </p>

      <RecentlyAdded entityType="potions" label="Potion" pathPrefix="/potions" />

      <Suspense>
        <PotionsClient initialPotions={potions} />
      </Suspense>
    </div>
  );
}
