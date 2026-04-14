import { Suspense } from "react";
import type { Monster } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import MonstersClient from "./MonstersClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default async function MonstersPage() {
  let monsters: Monster[] = [];
  try {
    const res = await fetch(`${API}/api/monsters?lang=eng`, { next: { revalidate: 300 } });
    if (res.ok) monsters = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Monsters", href: "/monsters" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Monsters",
      description: "Browse every monster in Slay the Spire 2.",
      path: "/monsters",
      items: monsters.map((m) => ({ name: m.name, path: `/monsters/${m.id.toLowerCase()}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Slay the Spire 2 Monsters</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Browse every monster in Slay the Spire 2 — normals, elites, and bosses. View HP values, moves, damage stats, and ascension scaling.
      </p>

      <RecentlyAdded entityType="monsters" label="Monster" pathPrefix="/monsters" />

      <Suspense>
        <MonstersClient initialMonsters={monsters} />
      </Suspense>
    </div>
  );
}
