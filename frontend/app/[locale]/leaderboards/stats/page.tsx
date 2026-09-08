import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import StatsClient from "./StatsClient";
import { fetchInitialStats } from "./fetch-initial-stats";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/leaderboards/stats", title: t("Stats"), description: t("leaderboards_stats_meta_description") });
}

export default async function StatsPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Leaderboards"), href: localePath(locale, "/leaderboards") },
      { name: t("Stats"), href: localePath(locale, "/leaderboards/stats") },
    ]),
    buildCollectionPageJsonLd({
      name: pageHeading(locale, t("Stats")),
      description: t("stats_tagline"),
      path: localePath(locale, "/leaderboards/stats"),
      inLanguage: inLanguageOf(locale),
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <StatsClient initialStats={await fetchInitialStats()} />
    </>
  );
}
