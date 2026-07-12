import type { Metadata } from "next";
import type { Stats } from "@/lib/api";
import HomeClient from "./HomeClient";
import HomeNewsSection from "./components/HomeNewsSection";
import HomeGuidesSection from "./components/HomeGuidesSection";
import HomeShowcaseSection from "./components/HomeShowcaseSection";
import HomeLeaderboardSection from "./components/HomeLeaderboardSection";
import HomeStatsSection from "./components/HomeStatsSection";
import HomeMetricsSection from "./components/HomeMetricsSection";
import HomeFAQ from "./components/HomeFAQ";
import JsonLd from "./components/JsonLd";
import SearchTrigger from "./components/SearchTrigger";
import { buildWebSiteJsonLd, buildVideoGameJsonLd } from "@/lib/jsonld";
import { SITE_NAME, IS_BETA, buildLanguageAlternates, HOME_OG_IMAGE } from "@/lib/seo";
import "./home-revamp.css";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const title = `${IS_BETA ? "Beta " : ""}Database, Wiki & Guide - Slay the Spire 2 (sts2) | ${SITE_NAME}`;
const description = IS_BETA
  ? "Beta preview of upcoming Slay the Spire 2 (sts2) content. Browse new cards, relics, characters, monsters, potions, events, powers, and more."
  : "The complete Slay the Spire 2 (sts2) database. Browse cards, relics, characters, monsters, potions, events, and powers. Filter by character, rarity, and keyword.";

// ISR with 60s revalidation. The HTML caches at CF edge for 60s so
// most visits return without hitting Next.js at all. After 60s the
// next visitor triggers a background regen and gets the still-fresh
// stale-while-revalidate copy. Backend reads are now sub-25ms via
// the materialized stats_summary, so a re-render is cheap.
//
// The earlier `force-dynamic` was a workaround for build-time
// fetches caching `null` when the backend was unreachable. The
// fetchJSON helper below now returns a safe placeholder on error
// rather than null, so an unreachable-backend regen doesn't poison
// the next cache slot.
export const revalidate = 60;

// Home uses the bare-logo OG asset (transparent background, just the
// silent + cultist mark) so the landing card reads as a logo, while
// every other page inherits the branded composition from layout.tsx.
const homeOgImage = { url: HOME_OG_IMAGE, width: 2006, height: 2251 };

export const metadata: Metadata = {
  title,
  description,
  openGraph: { type: "website", siteName: SITE_NAME, title, description, images: [homeOgImage] },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [HOME_OG_IMAGE],
  },
  alternates: {
    canonical: "/",
    languages: buildLanguageAlternates("/"),
  },
};

interface Translations {
  sections?: Record<string, string>;
  section_descs?: Record<string, string>;
  character_names?: Record<string, string>;
}

async function fetchJSON<T>(url: string): Promise<T | null> {
  // Inner fetch revalidates faster than the page (30s) so each ISR
  // regen always pulls fresh data. The outer page TTL (60s) caps how
  // stale the rendered HTML can be in CF's edge cache.
  try {
    const res = await fetch(url, { next: { revalidate: 30 } });
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
      <div className="rvmp">
        <main className="home">
          <section className="hero">
            <h1 className="wordmark">
              SPIRE <span>CODEX</span>
              {IS_BETA && (
                <sup className="ml-2 align-super text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                  BETA
                </sup>
              )}
            </h1>
            <p className="htag">
              {IS_BETA
                ? "Preview of upcoming Slay the Spire 2 content, every card, relic, monster, and run."
                : "The complete database for Slay the Spire 2, every card, relic, monster, and run, searchable and cross-referenced."}
            </p>
            <div style={{ maxWidth: 540, margin: "18px auto 0" }}>
              <SearchTrigger variant="hero" />
            </div>
          </section>

          <HomeClient initialStats={stats} initialTranslations={translations ?? {}} />
        </main>
      </div>

      {/* Latest 3 community announcements rendered as image-card blocks
          mirroring the grid above. Server-rendered so search snippets
          and OG previews can pick up the headlines. */}
      <HomeNewsSection />
      <HomeLeaderboardSection characterNames={translations?.character_names} />
      <HomeStatsSection characterNames={translations?.character_names} />
      <HomeMetricsSection />
      <HomeGuidesSection />
      <HomeShowcaseSection />
      <HomeFAQ stats={stats} />
    </div>
  );
}
