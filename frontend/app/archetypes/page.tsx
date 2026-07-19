import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, buildLanguageAlternates } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";
import { characterHex } from "@/lib/character-colors";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const revalidate = 600;

const TITLE = `Slay the Spire 2 Deck Archetypes - Community Builds Ranked (sts2) | ${SITE_NAME}`;
const DESCRIPTION =
  "Every Slay the Spire 2 (sts2) deck archetype discovered from community runs: defining cards and relics, popularity, and real win rates per build.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/archetypes`, languages: buildLanguageAlternates("/archetypes") },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/archetypes`,
    siteName: SITE_NAME,
    type: "website",
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

interface NamedEntity {
  id: string;
  name: string;
}

interface Archetype {
  name: string;
  size: number;
  share: number;
  win_rate: number;
  defining_cards: NamedEntity[];
  defining_relics: NamedEntity[];
  example_runs: string[];
  trend?: { version: string; delta: number } | null;
}

interface ArchetypesResponse {
  available: boolean;
  built_at?: string;
  characters: Record<string, Archetype[]>;
}

const CHARACTER_ORDER = ["IRONCLAD", "SILENT", "DEFECT", "NECROBINDER", "REGENT"];

function characterLabel(c: string): string {
  return c.charAt(0) + c.slice(1).toLowerCase();
}

function winRateColor(pct: number): string {
  if (pct >= 30) return "#22c55e";
  if (pct >= 15) return "#84cc16";
  if (pct >= 5) return "#eab308";
  return "#ef4444";
}

async function loadArchetypes(): Promise<ArchetypesResponse | null> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/runs/archetypes`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as ArchetypesResponse;
  } catch {
    return null;
  }
}

export default async function ArchetypesPage() {
  const data = await loadArchetypes();
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Archetypes", href: "/archetypes" },
    ]),
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Deck Archetypes</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8 max-w-3xl">
        Builds discovered automatically from community-submitted runs: decks are
        clustered by their cards and relics, so every archetype below is something
        players actually pilot, with its real popularity and win rate. Rebuilt daily.
      </p>

      {!data?.available ? (
        <p className="text-sm text-[var(--text-muted)]">
          Archetype data is still building. Check back shortly.
        </p>
      ) : (
        CHARACTER_ORDER.filter((ch) => (data.characters[ch] ?? []).length > 0).map((ch) => {
          const color = characterHex(ch) || "var(--accent-gold)";
          return (
            <section key={ch} className="mb-10">
              <h2 className="text-xl font-bold mb-4" style={{ color }}>
                {characterLabel(ch)}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.characters[ch].map((a, i) => (
                  <div
                    key={`${ch}-${i}`}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4"
                  >
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <h3 className="font-semibold text-[var(--text-primary)] leading-tight">
                        {a.name}
                      </h3>
                      <span
                        className="text-sm font-bold tabular-nums flex-shrink-0"
                        style={{ color: winRateColor(a.win_rate) }}
                      >
                        {a.win_rate}%
                      </span>
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mb-3">
                      {a.share}% of {characterLabel(ch)} runs · {a.size.toLocaleString()} decks
                      {a.trend && Math.abs(a.trend.delta) >= 0.5 && (
                        <span
                          className="ml-2 font-semibold"
                          style={{ color: a.trend.delta > 0 ? "#22c55e" : "#ef4444" }}
                          title={`Share change in ${a.trend.version} vs the previous version`}
                        >
                          {a.trend.delta > 0 ? "▲" : "▼"} {Math.abs(a.trend.delta)}%
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {a.defining_cards.map((e) => (
                        <Link
                          key={e.id}
                          href={`/cards/${e.id.toLowerCase()}`}
                          className="text-xs px-2 py-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]/50 hover:text-[var(--accent-gold)] transition-colors"
                        >
                          {e.name}
                        </Link>
                      ))}
                      {a.defining_relics.map((e) => (
                        <Link
                          key={e.id}
                          href={`/relics/${e.id.toLowerCase()}`}
                          className="text-xs px-2 py-0.5 rounded-md border border-sky-900/50 bg-[var(--bg-primary)] text-sky-300 hover:border-sky-500/60 transition-colors"
                        >
                          {e.name}
                        </Link>
                      ))}
                    </div>
                    {a.example_runs.length > 0 && (
                      <div className="mt-3 text-xs text-[var(--text-muted)]">
                        Examples:{" "}
                        {a.example_runs.map((h, j) => (
                          <span key={h}>
                            {j > 0 && ", "}
                            <Link
                              href={`/runs/${h}`}
                              className="text-[var(--accent-gold)] hover:underline font-mono"
                            >
                              {h.slice(0, 8)}
                            </Link>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
