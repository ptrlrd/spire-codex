import type { Metadata } from "next";
import { isValidLang, LANG_HREFLANG, LANG_NAMES, type LangCode } from "@/lib/languages";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, buildLanguageAlternates } from "@/lib/seo";
import { t } from "@/lib/ui-translations";
import TermsBody from "../../terms/TermsBody";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const nativeName = LANG_NAMES[langCode];

  const title = `${t("Terms of Service", lang)} | Spire Codex (${nativeName})`;
  const description = `${t("Terms governing use of the Spire Codex website, API, embeddable widgets, and Overwolf overlay.", lang)} ${nativeName}.`;

  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: `${SITE_URL}/${lang}/terms`,
      title,
      description,
      locale: LANG_HREFLANG[langCode],
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description },
    alternates: {
      canonical: `/${lang}/terms`,
      languages: buildLanguageAlternates("/terms"),
    },
  };
}

export default async function LangTermsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  return <TermsBody lang={lang} />;
}
