import type { Metadata } from "next";
import KnowledgeDemonBody from "@/app/knowledge-demon/KnowledgeDemonBody";
import {
  isValidLang,
  LANG_GAME_NAME,
  LANG_NAMES,
  LANG_HREFLANG,
  type LangCode,
} from "@/lib/languages";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";

const CATEGORY = "knowledge-demon";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];

  const title = `Knowledge Demon - ${gameName} Discord Bot | Spire Codex (${nativeName})`;
  const description = `Knowledge Demon, a Discord bot for ${gameName} communities. Slash-command lookups for cards, relics, monsters, and events, plus moderation and news feeds. ${nativeName}.`;

  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: `${SITE_URL}/${lang}/${CATEGORY}`,
      title,
      description,
      locale: LANG_HREFLANG[langCode],
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description },
    alternates: {
      canonical: `/${lang}/${CATEGORY}`,
      languages: buildLanguageAlternates(`/${CATEGORY}`),
    },
  };
}

export default async function LangKnowledgeDemonPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  return <KnowledgeDemonBody lang={lang} />;
}
