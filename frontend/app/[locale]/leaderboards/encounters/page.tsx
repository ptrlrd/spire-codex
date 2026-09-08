import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import EncounterStatsClient from "./EncounterStatsClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/leaderboards/encounters", title: t("Encounter Stats"), description: t("leaderboards_encounters_meta_description") });
}

export default async function EncountersStatsPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Leaderboards"), href: localePath(locale, "/leaderboards") },
      { name: t("Encounters"), href: localePath(locale, "/leaderboards/encounters") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Encounter Stats",
      description:
        "Per-encounter aggregation: fatal counts, average damage taken, average turn count, and per-character breakdown for every monster, elite, and boss.",
      path: localePath(locale, "/leaderboards/encounters"),
      inLanguage: inLanguageOf(locale),
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <EncounterStatsClient />
    </>
  );
}
