import type { Metadata } from "next";
import GuideSubmitClient from "@/app/guides/submit/page";
import { isValidLang, LANG_GAME_NAME, LANG_NAMES, type LangCode } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};
  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];
  return {
    title: `${t("Submit a Guide", lang)} - ${gameName} | Spire Codex (${nativeName})`,
    alternates: { canonical: `/${lang}/guides/submit` },
  };
}

export default async function LangGuideSubmitPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  return <GuideSubmitClient />;
}
