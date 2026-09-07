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
import { LANG_DATABASE, LANG_GAME_NAME, LANG_NAMES } from "@/lib/languages";
import { localeOf, localePath, ogLocaleOf } from "@/lib/locale";
import { SITE_NAME, buildLanguageAlternates, HOME_OG_IMAGE } from "@/lib/seo";
import "@/app/home-revamp.css";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const ENGLISH_TITLE = `Database, Wiki & Guide - Slay the Spire 2 (sts2) | ${SITE_NAME}`;
const ENGLISH_DESCRIPTION =
  "The complete Slay the Spire 2 (sts2) database. Browse cards, relics, characters, monsters, potions, events, and powers. Filter by character, rarity, and keyword.";

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

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  let title = ENGLISH_TITLE;
  let description = ENGLISH_DESCRIPTION;
  if (locale !== "eng") {
    const t = await getT(locale);
    const gameName = LANG_GAME_NAME[locale];
    const dbWord = LANG_DATABASE[locale];
    const nativeName = LANG_NAMES[locale];
    title = `Spire Codex - ${gameName} ${dbWord} (${nativeName})`;
    // The tail sentence is translated: an English description on a localized
    // page reads as a language mismatch to crawlers.
    description = `${gameName} ${dbWord} (${nativeName}), Spire Codex. ${t("Browse cards, relics, characters, monsters, potions, events, and powers.")}`;
  }
  return {
    title,
    description,
    openGraph: { type: "website", siteName: SITE_NAME, title, description, locale: ogLocaleOf(locale), images: [homeOgImage] },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [HOME_OG_IMAGE],
    },
    alternates: {
      canonical: localePath(locale, "/"),
      languages: buildLanguageAlternates("/"),
    },
  };
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
            <p className="htag">
              {locale === "eng"
                ? "The complete database for Slay the Spire 2, every card, relic, monster, and run, searchable and cross-referenced."
                : t("The complete database for Slay the Spire 2")}
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
