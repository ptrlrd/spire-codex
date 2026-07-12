import type { Metadata } from "next";
import { isValidLang, LANG_HREFLANG, LANG_NAMES, type LangCode } from "@/lib/languages";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, buildLanguageAlternates } from "@/lib/seo";
import { t } from "@/lib/ui-translations";
import PrivacyBody from "../../privacy/PrivacyBody";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const nativeName = LANG_NAMES[langCode];

  const title = `${t("Privacy Policy", lang)} | Spire Codex (${nativeName})`;
  const description = `${t("How Spire Codex collects, uses, and retains data submitted through the website, API, and Overwolf overlay.", lang)} ${nativeName}.`;

  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: `${SITE_URL}/${lang}/privacy`,
      title,
      description,
      locale: LANG_HREFLANG[langCode],
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description },
    alternates: {
      canonical: `/${lang}/privacy`,
      languages: buildLanguageAlternates("/privacy"),
    },
  };
}

export default async function LangPrivacyPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  return <PrivacyBody lang={lang} />;
}
