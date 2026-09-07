import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, inLanguageOf, listMetadata, localeOf, localePath, type Locale } from "@/lib/locale";
import { LANG_NAMES } from "@/lib/languages";
import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import EncounterStatsClient from "./EncounterStatsClient";

export const dynamic = "force-dynamic";

const title = "Encounter Stats - Slay the Spire 2 (sts2) | Spire Codex";
const description =
  "Per-encounter Slay the Spire 2 stats, fatal counts, average damage, average turns, and a per-character breakdown for every monster, elite, and boss. Live aggregation from submitted community runs.";

type Props = { params: Promise<{ locale: string }> };

function pageCopy(locale: Locale, t: TFn) {
  if (locale === "eng") return { heading: title, title, description, tagline: "" };
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  const heading = `${gameName} ${t("Encounter Stats")}`;
  const desc = t("encounter_stats_tagline");
  return { heading, title: `${heading} | Spire Codex (${nativeName})`, description: desc, tagline: t("encounter_stats_tagline") };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const copy = pageCopy(locale, await getT(locale));
  return listMetadata(locale, { path: "/leaderboards/encounters", title: copy.title, description: copy.description });
}

export default async function EncountersStatsPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const copy = pageCopy(locale, t);
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
