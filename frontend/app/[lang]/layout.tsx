import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  SUPPORTED_LANGS,
  isValidLang,
  LANG_HREFLANG,
  LANG_NAMES,
  LANG_GAME_NAME,
  LANG_DATABASE,
  type LangCode,
} from "@/lib/languages";
import { SITE_NAME, DEFAULT_OG_IMAGE } from "@/lib/seo";
import { LanguageProvider } from "@/app/contexts/LanguageContext";
import HtmlLang from "@/app/components/HtmlLang";

interface Props {
  params: Promise<{ lang: string }>;
  children: React.ReactNode;
}

export async function generateStaticParams() {
  return SUPPORTED_LANGS.map((lang) => ({ lang }));
}

// No `alternates` here on purpose: a layout's canonical is inherited by every
// child page that doesn't set its own, which pointed list pages at the locale
// home. The locale home sets its own canonical and hreflang in page.tsx.
export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const dbWord = LANG_DATABASE[langCode];
  const nativeName = LANG_NAMES[langCode];

  const title = `${gameName} ${dbWord} - Spire Codex (${nativeName})`;
  const description = `Spire Codex, ${gameName} ${dbWord}. ${nativeName}.`;


  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      locale: LANG_HREFLANG[langCode],
      images: [{ url: DEFAULT_OG_IMAGE, width: 3000, height: 3000 }],
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function LangLayout({ params, children }: Props) {
  const { lang } = await params;

  if (!isValidLang(lang)) {
    notFound();
  }

  // A nested provider seeded with the URL segment: client components under
  // /<lang>/ now server-render their UI strings in the page's language
  // instead of the English default (crawlers were detecting every localized
  // page as English content). HtmlLang fixes the <html lang> attribute
  // after hydration, since the root layout can't see this segment.
  return (
    <LanguageProvider initialLang={lang}>
      <HtmlLang lang={lang} />
      {children}
    </LanguageProvider>
  );
}
