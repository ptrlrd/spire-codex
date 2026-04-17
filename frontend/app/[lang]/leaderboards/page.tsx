import type { Metadata } from "next";
import LeaderboardBrowseClient from "@/app/leaderboards/LeaderboardBrowseClient";
import {
  isValidLang,
  LANG_GAME_NAME,
  LANG_NAMES,
  LANG_HREFLANG,
  SUPPORTED_LANGS,
  type LangCode,
} from "@/lib/languages";
import { SITE_URL } from "@/lib/seo";
import { t } from "@/lib/ui-translations";

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
  const title = `${gameName} ${t("Leaderboards", lang)} | Spire Codex (${nativeName})`;
  const description = t("leaderboards_tagline", lang);

  const languages: Record<string, string> = {
    en: `${SITE_URL}/leaderboards`,
    "x-default": `${SITE_URL}/leaderboards`,
  };
  for (const code of SUPPORTED_LANGS) {
    languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/leaderboards`;
  }

  return {
    title,
    description,
    openGraph: { title, description, locale: LANG_HREFLANG[langCode] },
    alternates: { canonical: `/${lang}/leaderboards`, languages },
  };
}

export default async function LangLeaderboardsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  return <LeaderboardBrowseClient />;
}
