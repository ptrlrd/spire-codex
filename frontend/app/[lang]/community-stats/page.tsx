import type { Metadata } from "next";
import { CommunityStatsBody } from "@/app/community-stats/CommunityStatsBody";
import { normalizeBracket } from "@/lib/content-brackets";
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

// Render per request like the English route (avoids a build-time empty bake
// when the backend is unreachable); the shared body's fetch stays cached.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];
  const title = `${gameName} ${t("Community Stats", lang)} | Spire Codex (${nativeName})`;
  const description = `Fun ${gameName} community stats: how players vote at every event, what kills runs most, win rates by ascension and character, and run records, all from community-submitted runs. ${nativeName}.`;

  const languages: Record<string, string> = {
    en: `${SITE_URL}/community-stats`,
    "x-default": `${SITE_URL}/community-stats`,
  };
  for (const code of SUPPORTED_LANGS) {
    languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/community-stats`;
  }

  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: `${SITE_URL}/${lang}/community-stats`,
      title,
      description,
      locale: LANG_HREFLANG[langCode],
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description },
    alternates: { canonical: `/${lang}/community-stats`, languages },
  };
}

export default async function LangCommunityStatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ bracket?: string }>;
}) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  const sp = await searchParams;
  const bracket = normalizeBracket(sp.bracket);
  return <CommunityStatsBody lang={lang} bracket={bracket} />;
}
