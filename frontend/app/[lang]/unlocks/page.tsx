import type { Metadata } from "next";
import UnlocksClient from "@/app/unlocks/UnlocksClient";
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

const CATEGORY = "unlocks";
const CATEGORY_LABEL = "Unlocks";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];

  const title = `${gameName} ${t(CATEGORY_LABEL, lang)} | Spire Codex (${nativeName})`;
  const description = `Unlockable cards, relics, potions, and characters in ${gameName}. ${nativeName}.`;

  const languages: Record<string, string> = {
    en: `${SITE_URL}/${CATEGORY}`,
    "x-default": `${SITE_URL}/${CATEGORY}`,
  };
  for (const code of SUPPORTED_LANGS) {
    languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/${CATEGORY}`;
  }

  return {
    title,
    description,
    openGraph: { title, description, locale: LANG_HREFLANG[langCode] },
    alternates: { canonical: `/${lang}/${CATEGORY}`, languages },
  };
}

export default async function LangUnlocksPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  return <UnlocksClient />;
}
