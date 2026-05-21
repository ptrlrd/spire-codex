import type { Metadata } from "next";
import GuideSubmitClient from "@/app/guides/submit/page";
import { isValidLang, LANG_GAME_NAME, LANG_NAMES, LANG_HREFLANG, type LangCode } from "@/lib/languages";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import { t } from "@/lib/ui-translations";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};
  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];
  const title = `${t("Submit a Guide", lang)} - ${gameName} | Spire Codex (${nativeName})`;
  const description = `${t("Submit a Guide", lang)} — share character guides, boss strategies, and deck-building tips with the ${gameName} (${nativeName}) community on Spire Codex.`;
  return {
    title,
    description,
    alternates: { canonical: `/${lang}/guides/submit` },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: `${SITE_URL}/${lang}/guides/submit`,
      title,
      description,
      locale: LANG_HREFLANG[langCode],
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function LangGuideSubmitPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  return <GuideSubmitClient />;
}
