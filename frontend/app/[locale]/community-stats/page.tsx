import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/locale";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { normalizeBracket } from "@/lib/content-brackets";
import { CommunityStatsBody } from "./CommunityStatsBody";

// Community stats rebuild on the backend on the snapshot cadence; a 5min
// HTML cache keeps this page cheap without going stale.
export const revalidate = 300;

// Base English route. Localized copies live at /[lang]/community-stats and
// render the same CommunityStatsBody with the URL language.
type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ bracket?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/community-stats", title: t("Community Stats"), description: t("community-stats_meta_description") });
}

export default async function CommunityStatsPage({ params, searchParams }: Props) {
  const locale = localeOf((await params).locale);
  const sp = await searchParams;
  const bracket = normalizeBracket(sp.bracket);
  return <CommunityStatsBody lang={locale} bracket={bracket} />;
}
