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
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE } from "@/lib/seo";

interface Props {
  params: Promise<{ lang: string }>;
  children: React.ReactNode;
}

export async function generateStaticParams() {
  return SUPPORTED_LANGS.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const dbWord = LANG_DATABASE[langCode];
  const nativeName = LANG_NAMES[langCode];

  const title = `${gameName} ${dbWord} - Spire Codex (${nativeName})`;
  const description = `Spire Codex — ${gameName} ${dbWord}. ${nativeName}.`;

  // Build hreflang alternates: all other localized versions + English
  const languages: Record<string, string> = {
    "en": `${SITE_URL}/`,
    "x-default": `${SITE_URL}/`,
  };
  for (const code of SUPPORTED_LANGS) {
    languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}`;
  }

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
    alternates: {
      canonical: `/${lang}`,
      languages,
    },
  };
}

export default async function LangLayout({ params, children }: Props) {
  const { lang } = await params;

  if (!isValidLang(lang)) {
    notFound();
  }

  return <>{children}</>;
}
