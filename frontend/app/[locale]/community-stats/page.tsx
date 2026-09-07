import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, listMetadata, localeOf, type Locale } from "@/lib/locale";
import { LANG_NAMES } from "@/lib/languages";
import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/seo";
import { normalizeBracket } from "@/lib/content-brackets";
import { CommunityStatsBody } from "./CommunityStatsBody";

// Community stats rebuild on the backend on the snapshot cadence; a 5min
// HTML cache keeps this page cheap without going stale.
export const revalidate = 300;

// Base English route. Localized copies live at /[lang]/community-stats and
// render the same CommunityStatsBody with the URL language.
type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ bracket?: string }> };

function pageCopy(locale: Locale, t: TFn) {
  if (locale === "eng") return { heading: `Community Stats - Slay the Spire 2 (sts2) | ${SITE_NAME}`, title: `Community Stats - Slay the Spire 2 (sts2) | ${SITE_NAME}`, description: "Fun community stats for Slay the Spire 2 (sts2): how players vote at every event, what kills runs most, win rates by ascension and character, and run records, all from community-submitted runs.", tagline: "" };
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  const heading = `${gameName} ${t("Community Stats")}`;
  const desc = `Fun ${gameName} community stats: how players vote at every event, what kills runs most, win rates by ascension and character, and run records, all from community-submitted runs. ${nativeName}.`;
  return { heading, title: `${heading} | Spire Codex (${nativeName})`, description: desc, tagline: desc };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const copy = pageCopy(locale, await getT(locale));
  return listMetadata(locale, { path: "/community-stats", title: copy.title, description: copy.description });
}

export default async function CommunityStatsPage({ params, searchParams }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const copy = pageCopy(locale, t);
  const sp = await searchParams;
  const bracket = normalizeBracket(sp.bracket);
  return <CommunityStatsBody lang={locale} bracket={bracket} />;
}
