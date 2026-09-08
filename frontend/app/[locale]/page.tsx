import type { Metadata } from "next";
import type { Stats } from "@/lib/api";
import HomeClient from "@/app/HomeClient";
import HomeNewsSection from "@/app/components/HomeNewsSection";
import HomeGuidesSection from "@/app/components/HomeGuidesSection";
import HomeShowcaseSection from "@/app/components/HomeShowcaseSection";
import HomeLeaderboardSection from "@/app/components/HomeLeaderboardSection";
import HomeStatsSection from "@/app/components/HomeStatsSection";
import HomeMetricsSection from "@/app/components/HomeMetricsSection";
import HomeFAQ from "@/app/components/HomeFAQ";
import JsonLd from "@/app/components/JsonLd";
import SearchTrigger from "@/app/components/SearchTrigger";
import { buildWebSiteJsonLd, buildVideoGameJsonLd } from "@/lib/jsonld";
import { fetchSteamMeta } from "@/lib/steam-meta";
import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/locale";
import { HOME_OG_IMAGE, buildPageMetadata } from "@/lib/seo";
import "@/app/home-revamp.css";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";


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

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/", title: t("Database, Wiki & Guide"), description: t("home_meta_description"), image: HOME_OG_IMAGE });
}

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

export default async function Home({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const [stats, translations] = await Promise.all([
    fetchJSON<Stats>(`${API}/api/stats?lang=${locale}`),
    fetchJSON<Translations>(`${API}/api/translations?lang=${locale}`),
  ]);

  return (
    <div className="min-h-screen">
      <JsonLd data={[buildWebSiteJsonLd(), buildVideoGameJsonLd(await fetchSteamMeta())]} />
      <div className="rvmp">
        <main className="home">
          <section className="hero">
            <h1 className="wordmark">
              SPIRE <span>CODEX</span>
            </h1>
            <p className="htag">{t("home_tagline")}</p>
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
      <HomeNewsSection lang={locale} />
      <HomeLeaderboardSection lang={locale} characterNames={translations?.character_names} />
      <HomeStatsSection lang={locale} characterNames={translations?.character_names} />
      <HomeMetricsSection lang={locale} />
      <HomeGuidesSection lang={locale} />
      <HomeShowcaseSection lang={locale} />
      <HomeFAQ stats={stats} lang={locale} />
    </div>
  );
}
