import type { Metadata } from "next";
import type { Stats } from "@/lib/api";
import HomeClient from "./HomeClient";
import JsonLd from "./components/JsonLd";
import SearchTrigger from "./components/SearchTrigger";
import { buildWebSiteJsonLd, buildVideoGameJsonLd } from "@/lib/jsonld";
import { SITE_NAME, IS_BETA } from "@/lib/seo";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const title = `${SITE_NAME} - Slay the Spire 2 ${IS_BETA ? "Beta " : ""}Database, Wiki & Guide`;
const description = IS_BETA
  ? "Beta preview of upcoming Slay the Spire 2 content. Browse new cards, relics, characters, monsters, potions, events, powers, and more."
  : "The complete Slay the Spire 2 database. Browse all cards, relics, characters, monsters, potions, events, powers, and more. Filter by character, rarity, and type.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description },
  twitter: { card: "summary_large_image", title, description },
  alternates: {
    canonical: "/",
  },
};

interface Translations {
  sections?: Record<string, string>;
  section_descs?: Record<string, string>;
  character_names?: Record<string, string>;
}

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function Home() {
  const [stats, translations] = await Promise.all([
    fetchJSON<Stats>(`${API}/api/stats?lang=eng`),
    fetchJSON<Translations>(`${API}/api/translations?lang=eng`),
  ]);



  return (
    <div className="min-h-screen">
      <JsonLd data={[buildWebSiteJsonLd(), buildVideoGameJsonLd()]} />
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--accent-red)]/8 via-transparent to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8 relative">
          <div className="text-center">
            <h1 className="text-5xl sm:text-6xl font-bold mb-4">
              <span className="text-[var(--accent-gold)]">SPIRE</span>{" "}
              <span className="text-[var(--text-primary)] font-light">
                CODEX
              </span>
              {IS_BETA && (
                <span className="ml-3 text-sm font-medium px-2 py-1 rounded bg-[var(--accent-gold)]/20 text-[var(--accent-gold)] align-middle">
                  BETA
                </span>
              )}
            </h1>
            <p className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto mb-6">
              {IS_BETA
                ? "Preview of upcoming Slay the Spire 2 content"
                : "The complete database for Slay the Spire 2"}
            </p>
            <div className="max-w-xl mx-auto">
              <SearchTrigger variant="hero" />
            </div>
          </div>
        </div>
      </section>

      <HomeClient initialStats={stats} initialTranslations={translations ?? {}} />
    </div>
  );
}
