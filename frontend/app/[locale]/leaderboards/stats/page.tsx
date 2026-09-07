import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, inLanguageOf, listMetadata, localeOf, localePath, type Locale } from "@/lib/locale";
import { LANG_NAMES } from "@/lib/languages";
import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import StatsClient from "./StatsClient";
import { fetchInitialStats } from "./fetch-initial-stats";

export const dynamic = "force-dynamic";

const title = "Stats - Slay the Spire 2 | Spire Codex";
const description =
  "Slay the Spire 2 stats, win rates by character, card pick rates, most common relics, deadliest encounters. Community-driven data from submitted runs.";

type Props = { params: Promise<{ locale: string }> };

function pageCopy(locale: Locale, t: TFn) {
  if (locale === "eng") return { heading: title, title, description, tagline: "" };
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  const heading = `${gameName} ${t("Stats")}`;
  const desc = t("stats_tagline");
  return { heading, title: `${heading} | Spire Codex (${nativeName})`, description: desc, tagline: t("stats_tagline") };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const copy = pageCopy(locale, await getT(locale));
  return listMetadata(locale, { path: "/leaderboards/stats", title: copy.title, description: copy.description });
}

export default async function StatsPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const copy = pageCopy(locale, t);
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Leaderboards"), href: localePath(locale, "/leaderboards") },
      { name: t("Stats"), href: localePath(locale, "/leaderboards/stats") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Community Stats",
      description:
        "Win rates by character, card pick rates, most common relics, deadliest encounters, aggregated from community-submitted runs.",
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
