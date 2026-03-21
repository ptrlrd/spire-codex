import Link from "next/link";
import JsonLd from "@/app/components/JsonLd";
import RichDescription from "@/app/components/RichDescription";
import { buildCollectionPageJsonLd } from "@/lib/jsonld";

export const dynamic = "force-dynamic";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Keyword {
  id: string;
  name: string;
  description: string;
}

export default async function KeywordsPage() {
  let keywords: Keyword[] = [];
  try {
    const res = await fetch(`${API}/api/keywords`, { next: { revalidate: 3600 } });
    if (res.ok) keywords = await res.json();
  } catch {}

  const jsonLd = buildCollectionPageJsonLd({
    name: "Slay the Spire 2 Card Keywords",
    description: "All card keywords in Slay the Spire 2.",
    path: "/keywords",
    items: keywords.map((k) => ({ name: k.name, path: `/keywords/${k.id.toLowerCase()}` })),
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
        Card Keywords
      </h1>
      <p className="text-[var(--text-secondary)] mb-8">
        Keywords define special behaviors for cards in Slay the Spire 2. Click a keyword to see all cards with that keyword.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {keywords
          .filter((k) => k.id !== "PERIOD")
          .map((kw) => (
            <Link
              key={kw.id}
              href={`/keywords/${kw.id.toLowerCase()}`}
              className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-accent)] transition-all"
            >
              <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-2">
                {kw.name}
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                <RichDescription text={kw.description} />
              </p>
            </Link>
          ))}
      </div>
    </div>
  );
}
