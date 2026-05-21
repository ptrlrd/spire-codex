import Link from "next/link";
import JsonLd from "@/app/components/JsonLd";
import RichDescription from "@/app/components/RichDescription";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";

// force-dynamic so the page SSRs at runtime instead of getting baked
// into the Docker image at build time. The build container has no
// network path to the backend, so the build-time fetch returns empty
// (try/catch swallows the failure) and the resulting static HTML
// permanently shows zero Game Terms until revalidate expires. CF
// caches the runtime-rendered HTML for the s-maxage TTL set in the
// backend's CORSStaticMiddleware, so edge perf is unaffected.
//
// See feedback_frontend_build_offline_backend.md — same trap caught
// us once already on entity detail pages.
export const dynamic = "force-dynamic";
export const revalidate = 3600;

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Keyword {
  id: string;
  name: string;
  description: string;
}

interface GlossaryTerm {
  id: string;
  name: string;
  description: string;
  category: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  combat: "Combat",
  mechanics: "Mechanics",
  zones: "Card Zones",
  progression: "Progression",
  rooms: "Map Rooms",
};

const CATEGORY_ORDER = ["combat", "mechanics", "zones", "rooms", "progression"];

export default async function KeywordsPage() {
  let keywords: Keyword[] = [];
  let glossary: GlossaryTerm[] = [];
  try {
    const [kwRes, glRes] = await Promise.all([
      fetch(`${API}/api/keywords`, { next: { revalidate: 3600 } }),
      fetch(`${API}/api/glossary`, { next: { revalidate: 3600 } }),
    ]);
    if (kwRes.ok) keywords = await kwRes.json();
    if (glRes.ok) glossary = await glRes.json();
  } catch {}

  const jsonLd = buildCollectionPageJsonLd({
    name: "Slay the Spire 2 Keywords & Game Terms",
    description: "All card keywords and game term definitions in Slay the Spire 2.",
    path: "/keywords",
    items: keywords.map((k) => ({ name: k.name, path: `/keywords/${k.id.toLowerCase()}` })),
  });

  // Group glossary by category
  const grouped = new Map<string, GlossaryTerm[]>();
  for (const term of glossary) {
    const list = grouped.get(term.category) || [];
    list.push(term);
    grouped.set(term.category, list);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
        Keywords & Game Terms
      </h1>
      <p className="text-[var(--text-secondary)] mb-8">
        Keywords define special card behaviors. Game terms explain core mechanics referenced throughout Slay the Spire 2.
      </p>

      {/* Keywords */}
      <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4">Card Keywords</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
        {keywords
          .filter((k) => k.id !== "PERIOD")
          .map((kw) => (
            <Link
              key={kw.id}
              href={`/keywords/${kw.id.toLowerCase()}`}
              className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-accent)] transition-all"
            >
              <h3 className="text-lg font-semibold text-[var(--accent-gold)] mb-2">
                {kw.name}
              </h3>
              <p className="text-sm text-[var(--text-secondary)]">
                <RichDescription text={kw.description} />
              </p>
            </Link>
          ))}
      </div>

      {/* Game Terms */}
      <h2 id="game-terms" className="text-xl font-bold text-[var(--text-primary)] mb-4">Game Terms</h2>
      {CATEGORY_ORDER.map((cat) => {
        const terms = grouped.get(cat);
        if (!terms?.length) return null;
        return (
          <div key={cat} className="mb-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
              {CATEGORY_LABELS[cat] || cat}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {terms.map((term) => (
                <Link
                  key={term.id}
                  href={`/keywords/${term.id.toLowerCase()}`}
                  className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4 hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-accent)] transition-all"
                >
                  <h4 className="font-semibold text-[var(--accent-gold)] mb-1">
                    {term.name}
                  </h4>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    <RichDescription text={term.description.replace(/\n/g, " ")} />
                  </p>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
