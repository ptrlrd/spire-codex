import type { Metadata } from "next";
import ScoringPage from "@/app/leaderboards/scoring/page";
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

// The stats, tier-list, and metrics pages all link "How scoring works" with
// the language prefix, and the English page's hreflang alternates advertise
// /<lang>/leaderboards/scoring — but the route didn't exist, so all 13
// localized variants 404'd. Same shape as the [lang]/modifiers fix; the
// explainer body is shared with the English page.

const PATH = "leaderboards/scoring";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];

  const title = `Codex Score - ${t("How scoring works", lang)} - ${gameName} | Spire Codex (${nativeName})`;
  const description = `How Codex Score ranks every ${gameName} card, relic, and potion. Bayesian-shrunk win rate, S-through-F tier bands, and full formula methodology. ${nativeName}.`;

  const languages: Record<string, string> = {
    "en": `${SITE_URL}/${PATH}`,
    "x-default": `${SITE_URL}/${PATH}`,
  };
  for (const code of SUPPORTED_LANGS) {
    languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/${PATH}`;
  }

  return {
    title,
    description,
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      url: `${SITE_URL}/${lang}/${PATH}`,
      title,
      description,
      locale: LANG_HREFLANG[langCode],
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description },
    alternates: {
      canonical: `/${lang}/${PATH}`,
      languages,
    },
  };
}

export default async function LangScoringPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  return <ScoringPage />;
}
