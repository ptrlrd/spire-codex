import { Suspense } from "react";
import type { Encounter } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import EncountersClient from "./EncountersClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default async function EncountersPage() {
  let encounters: Encounter[] = [];
  try {
    const res = await fetch(`${API}/api/encounters?lang=eng`, { next: { revalidate: 300 } });
    if (res.ok) encounters = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Encounters", href: "/encounters" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Encounters",
      description: "Browse every combat encounter in Slay the Spire 2.",
      path: "/encounters",
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Slay the Spire 2 Encounters</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Browse every combat encounter in Slay the Spire 2. Filter by room type (Monster, Elite, Boss) and act to find specific fights and monster compositions.
      </p>

      <RecentlyAdded entityType="encounters" label="Encounter" pathPrefix="/encounters" />

      <Suspense>
        <EncountersClient initialEncounters={encounters} />
      </Suspense>
    </div>
  );
}
