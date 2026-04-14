import type { Power } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import PowersClient from "./PowersClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default async function PowersPage() {
  let powers: Power[] = [];
  try {
    const res = await fetch(`${API}/api/powers?lang=eng`, { next: { revalidate: 300 } });
    if (res.ok) powers = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Powers", href: "/powers" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Powers",
      description: "Browse every power in Slay the Spire 2.",
      path: "/powers",
      items: powers.map((p) => ({ name: p.name, path: `/powers/${p.id.toLowerCase()}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Slay the Spire 2 Powers</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Browse every power in Slay the Spire 2 — buffs, debuffs, and neutral effects. Filter by type and stack behavior.
      </p>

      <RecentlyAdded entityType="powers" label="Power" pathPrefix="/powers" />

      <PowersClient initialPowers={powers} />
    </div>
  );
}
