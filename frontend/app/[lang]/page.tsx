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
import { t } from "@/lib/ui-translations";
import { SITE_URL, SITE_NAME, IS_BETA, HOME_OG_IMAGE } from "@/lib/seo";
import "@/app/home-revamp.css";
import {
  isValidLang,
  LANG_GAME_NAME,
  LANG_DATABASE,
  LANG_NAMES,
  LANG_HREFLANG,
  SUPPORTED_LANGS,
  type LangCode,
} from "@/lib/languages";

export const dynamic = "force-dynamic";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const dbWord = LANG_DATABASE[langCode];
  const nativeName = LANG_NAMES[langCode];

  const title = `Spire Codex - ${gameName} ${dbWord} (${nativeName})`;
  const description = `${gameName} ${dbWord} (${nativeName}), Spire Codex. Browse cards, relics, characters, monsters, potions, events, and powers.`;

  const languages: Record<string, string> = {
    "en": `${SITE_URL}/`,
    "x-default": `${SITE_URL}/`,
  };
  for (const code of SUPPORTED_LANGS) {
    languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}`;
  }

  // Mirror `/page.tsx`: localized landing pages also use the bare-logo
  // OG asset rather than the branded composition that detail/list
  // pages inherit from layout.tsx.
  const homeOgImage = { url: HOME_OG_IMAGE, width: 2006, height: 2251 };

  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      locale: LANG_HREFLANG[langCode],
      images: [homeOgImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [HOME_OG_IMAGE],
    },
    alternates: { canonical: `/${lang}`, languages },
  };
}

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;

  const [stats, translations] = await Promise.all([
    fetchJSON<Stats>(`${API}/api/stats?lang=${lang}`),
    fetchJSON<Translations>(`${API}/api/translations?lang=${lang}`),
  ]);

  return (
    <div className="min-h-screen">
      <JsonLd data={[buildWebSiteJsonLd(), buildVideoGameJsonLd()]} />
      {/* Mirror `/page.tsx` exactly so switching languages keeps the revamp
          home layout instead of falling back to an unstyled hero. */}
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
                ? t("Preview of upcoming Slay the Spire 2 content", lang)
                : t("The complete database for Slay the Spire 2", lang)}
            </p>
            <div style={{ maxWidth: 540, margin: "18px auto 0" }}>
              <SearchTrigger variant="hero" />
            </div>
          </section>

          <HomeClient initialStats={stats} initialTranslations={translations ?? {}} />
        </main>
      </div>

      <HomeNewsSection langPrefix={`/${lang}`} lang={lang} />
      <HomeLeaderboardSection langPrefix={`/${lang}`} lang={lang} characterNames={translations?.character_names} />
      <HomeStatsSection langPrefix={`/${lang}`} lang={lang} characterNames={translations?.character_names} />
      <HomeMetricsSection langPrefix={`/${lang}`} lang={lang} />
      <HomeGuidesSection langPrefix={`/${lang}`} lang={lang} />
      <HomeShowcaseSection langPrefix={`/${lang}`} lang={lang} />
      <HomeFAQ stats={stats} lang={lang} />
    </div>
  );
}
