import { Suspense } from "react";
import type { GuideSummary } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import GuidesClient from "./GuidesClient";
import Link from "next/link";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default async function GuidesPage() {
  let guides: GuideSummary[] = [];
  try {
    const res = await fetch(`${API}/api/guides`, { next: { revalidate: 300 } });
    if (res.ok) guides = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Guides", href: "/guides" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Guides",
      description: "Community strategy guides for Slay the Spire 2.",
      path: "/guides",
      items: guides.map((g) => ({ name: g.title, path: `/guides/${g.slug}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <div className="flex items-start justify-between mb-2">
        <h1 className="text-3xl font-bold">
          <span className="text-[var(--accent-gold)]">Slay the Spire 2 (sts2) Guides</span>
        </h1>
        <Link
          href="/guides/submit"
          className="flex-shrink-0 px-4 py-2 rounded-lg bg-[var(--accent-gold)] text-black font-semibold text-sm hover:brightness-110 transition-all"
        >
          Submit a Guide
        </Link>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Community strategy guides, character breakdowns, and tips for climbing the Spire.
      </p>

      <Suspense>
        <GuidesClient initialGuides={guides} />
      </Suspense>
    </div>
  );
}
