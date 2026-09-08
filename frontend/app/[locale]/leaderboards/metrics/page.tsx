import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { getT } from "@/lib/i18n-server";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
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

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const sp = await searchParams;
  const meta = buildPageMetadata({
    locale,
    path: "/leaderboards/metrics",
    title: t("Card Metrics"),
    description: t("leaderboards_metrics_meta_description"),
  });
  // Filter variants (?bracket=, ?character=) canonical to the clean URL, and
  // a page whose canonical points elsewhere must not carry hreflang
  // alternates — crawlers flag that as an hreflang conflict.
  const isVariant = Boolean(sp.bracket || sp.character);
  return isVariant ? { ...meta, alternates: { canonical: meta.alternates?.canonical } } : meta;
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
  const description = t("leaderboards_metrics_meta_description");

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Leaderboards"), href: localePath(locale, "/leaderboards") },
      { name: t("Card Metrics"), href: localePath(locale, "/leaderboards/metrics") },
    ]),
    buildCollectionPageJsonLd({
      name: pageHeading(locale, t("Card Metrics")),
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
