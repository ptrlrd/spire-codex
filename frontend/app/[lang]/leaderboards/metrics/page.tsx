import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import MetricsClient from "@/app/leaderboards/metrics/MetricsClient";
import { loadMetrics } from "@/app/leaderboards/metrics/metrics-data";
import {
  isValidLang,
  LANG_GAME_NAME,
  LANG_NAMES,
  LANG_HREFLANG,
  SUPPORTED_LANGS,
  type LangCode,
} from "@/lib/languages";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import { t } from "@/lib/ui-translations";

// Render per request like the English route (avoids a build-time empty
// bake); the shared loadMetrics fetch is cached so the data layer stays hot.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ bracket?: string; character?: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const sp = await searchParams;
  if (!isValidLang(lang)) return {};
  // Filter variants canonical to the clean URL; a non-canonical page must
  // not carry hreflang alternates (crawlers flag the conflict).
  const isVariant = Boolean(sp.bracket || sp.character);
  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];
  const title = `${gameName} ${t("Card Metrics", lang)} | Spire Codex (${nativeName})`;
  const description = t("metrics_tagline", lang);

  const languages: Record<string, string> = {
    en: `${SITE_URL}/leaderboards/metrics`,
    "x-default": `${SITE_URL}/leaderboards/metrics`,
  };
  for (const code of SUPPORTED_LANGS) {
    languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/leaderboards/metrics`;
  }

  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: `${SITE_URL}/${lang}/leaderboards/metrics`,
      title,
      description,
      locale: LANG_HREFLANG[langCode],
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description },
    alternates: {
      canonical: `/${lang}/leaderboards/metrics`,
      ...(isVariant ? {} : { languages }),
    },
  };
}

export default async function LangMetricsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ bracket?: string }>;
}) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const sp = await searchParams;
  const { rows, baselineWinRate, totalRuns, bracket } = await loadMetrics(
    lang,
    sp.bracket || "all"
  );
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: `/${lang}` },
      { name: t("Leaderboards", lang), href: `/${lang}/leaderboards` },
      { name: t("Card Metrics", lang), href: `/${lang}/leaderboards/metrics` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} ${t("Card Metrics", lang)}`,
      description: t("metrics_tagline", lang),
      path: `/${lang}/leaderboards/metrics`,
      inLanguage: LANG_HREFLANG[langCode],
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <MetricsClient
        rows={rows}
        baselineWinRate={baselineWinRate}
        totalRuns={totalRuns}
        bracket={bracket}
      />
    </>
  );
}
