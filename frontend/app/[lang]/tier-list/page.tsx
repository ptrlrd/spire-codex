import type { Metadata } from "next";
import { TierListBody } from "@/app/tier-list/TierListBody";
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
// when the backend is unreachable); the shared body's fetches stay cached.
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
  const title = `${gameName} ${t("Tier List", lang)} | Spire Codex (${nativeName})`;
  const description = `${gameName} tier list ranking every card, relic, and potion S through F. Codex Score from community win rates. ${nativeName}.`;

  const languages: Record<string, string> = {
    en: `${SITE_URL}/tier-list`,
    "x-default": `${SITE_URL}/tier-list`,
  };
  for (const code of SUPPORTED_LANGS) {
    languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/tier-list`;
  }

  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: `${SITE_URL}/${lang}/tier-list`,
      title,
      description,
      locale: LANG_HREFLANG[langCode],
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description },
    alternates: { canonical: `/${lang}/tier-list`, languages },
  };
}

export default async function LangTierListPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  return <TierListBody lang={lang} />;
}
