import type { Metadata } from "next";
import {
  isValidLang,
  LANG_GAME_NAME,
  LANG_NAMES,
  type LangCode,
} from "@/lib/languages";
import { SITE_URL, SITE_NAME, buildLanguageAlternates } from "@/lib/seo";
import TierListHome from "@/app/tier-list-maker/TierListHome";

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

  return {
    title: `${gameName} Tier List Maker | ${SITE_NAME} (${nativeName})`,
    description:
      "Build and share Slay the Spire 2 tier lists. Drag and drop cards, relics, potions, and monsters into custom tiers.",
    alternates: {
      canonical: `${SITE_URL}/${lang}/tier-list-maker`,
      languages: buildLanguageAlternates("/tier-list-maker"),
    },
  };
}

export default async function LangTierListMakerPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  return <TierListHome />;
}
