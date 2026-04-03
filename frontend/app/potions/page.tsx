import { Suspense } from "react";
import type { Potion } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
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

      {/* Drop Rates */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">
          Potion Drop Rates
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
          {/* Combat Drops */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
            <h3 className="font-semibold text-[var(--text-primary)] mb-3">Combat Rewards</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="text-left pb-2 text-[var(--text-muted)] font-semibold">Encounter</th>
                  <th className="text-right pb-2 text-[var(--text-muted)] font-semibold">Base Chance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[var(--border-subtle)]/50">
                  <td className="py-2 text-[var(--text-secondary)]">Normal</td>
                  <td className="py-2 text-right text-[var(--text-primary)]">40%</td>
                </tr>
                <tr>
                  <td className="py-2 text-[var(--text-secondary)]">Elite</td>
                  <td className="py-2 text-right text-[var(--text-primary)]">~52.5%</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-[var(--text-muted)] mt-3">
              Uses a pity system: +10% on miss, &minus;10% on drop. Effective rate trends toward 50% over time.
            </p>
          </div>

          {/* Rarity Distribution */}
          <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
            <h3 className="font-semibold text-[var(--text-primary)] mb-3">Rarity Distribution</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="text-left pb-2 text-[var(--text-muted)] font-semibold">Rarity</th>
                  <th className="text-right pb-2 text-[var(--text-muted)] font-semibold">Chance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[var(--border-subtle)]/50">
                  <td className="py-2 text-gray-300">Common</td>
                  <td className="py-2 text-right text-[var(--text-primary)]">65%</td>
                </tr>
                <tr className="border-b border-[var(--border-subtle)]/50">
                  <td className="py-2 text-blue-400">Uncommon</td>
                  <td className="py-2 text-right text-[var(--text-primary)]">25%</td>
                </tr>
                <tr>
                  <td className="py-2 text-[var(--accent-gold)]">Rare</td>
                  <td className="py-2 text-right text-[var(--text-primary)]">10%</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-[var(--text-muted)] mt-3">
              Applies to all potion generation including combat rewards and Alchemize.
            </p>
          </div>
        </div>
      </section>

      <Suspense>
        <PotionsClient initialPotions={potions} />
      </Suspense>
    </div>
  );
}
