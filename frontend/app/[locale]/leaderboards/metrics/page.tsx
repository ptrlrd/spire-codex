import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { getT } from "@/lib/i18n-server";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { LANG_NAMES } from "@/lib/languages";
import { gameNameFor, inLanguageOf, localeOf, localePath, ogLocaleOf, type Locale } from "@/lib/locale";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, buildLanguageAlternates } from "@/lib/seo";
import MetricsClient from "./MetricsClient";
import { loadMetrics } from "./metrics-data";

// Render per request (so a build-time bake with the backend unreachable
// never freezes an empty table) but cache the underlying data fetch inside
// loadMetrics. The backend already serves a pre-built snapshot, so the heavy
// work happens at most once per window across all requests; the per-request
// SSR of the table itself is cheap.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ bracket?: string; character?: string }>;
};

const ENGLISH_TITLE = `Card Metrics - Codex Elo, Win Rate & Pick Rate - Slay the Spire 2 (sts2) | ${SITE_NAME}`;
const ENGLISH_DESCRIPTION =
  "Every Slay the Spire 2 (sts2) card ranked by Codex Elo, Codex Score, win rate and pick rate. Revealed-preference ratings from community card-reward picks, plus per-act splits and raw counts.";

async function pageCopy(locale: Locale) {
  if (locale === "eng") return { title: ENGLISH_TITLE, description: ENGLISH_DESCRIPTION };
  const t = await getT(locale);
  return {
    title: `${gameNameFor(locale)} ${t("Card Metrics")} | Spire Codex (${LANG_NAMES[locale]})`,
    description: t("metrics_tagline"),
  };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const sp = await searchParams;
  const { title, description } = await pageCopy(locale);
  const path = localePath(locale, "/leaderboards/metrics");
  // Filter variants (?bracket=, ?character=) canonical to the clean URL, and
  // a page whose canonical points elsewhere must not carry hreflang
  // alternates — crawlers flag that as an hreflang conflict.
  const isVariant = Boolean(sp.bracket || sp.character);
  return {
    title,
    description,
    alternates: {
      canonical: path,
      ...(isVariant ? {} : { languages: buildLanguageAlternates("/leaderboards/metrics") }),
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: `${SITE_URL}${path}`,
      title,
      description,
      locale: ogLocaleOf(locale),
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function MetricsPage({ params, searchParams }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const sp = await searchParams;
  const { rows, baselineWinRate, totalRuns, bracket, character } = await loadMetrics(
    locale,
    sp.bracket || "all",
    sp.character || ""
  );
  const { description } = await pageCopy(locale);

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Leaderboards"), href: localePath(locale, "/leaderboards") },
      { name: t("Card Metrics"), href: localePath(locale, "/leaderboards/metrics") },
    ]),
    buildCollectionPageJsonLd({
      name: locale === "eng" ? "Slay the Spire 2 Card Metrics" : `${gameNameFor(locale)} ${t("Card Metrics")}`,
      description,
      path: localePath(locale, "/leaderboards/metrics"),
      inLanguage: inLanguageOf(locale),
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
        character={character}
      />
    </>
  );
}
