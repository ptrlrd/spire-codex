import type { Metadata } from "next";
import {
  isValidLang,
  LANG_NAMES,
  type LangCode,
} from "@/lib/languages";
import { SITE_NAME, SITE_URL, DEFAULT_OG_IMAGE, buildLanguageAlternates } from "@/lib/seo";
import GiveawayClient from "@/app/giveaway/GiveawayClient";

const description =
  "Enter to win a Slay the Spire 2 shadowbox. Sign in with Steam, get the mod, and upload a run. No purchase necessary. US residents only. July 7 to August 7, 2026.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const nativeName = LANG_NAMES[langCode];
  const title = `Slay the Spire 2 Shadowbox Giveaway | ${SITE_NAME} (${nativeName})`;

  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: `${SITE_URL}/${lang}/giveaway`,
      title,
      description,
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description },
    alternates: {
      canonical: `/${lang}/giveaway`,
      languages: buildLanguageAlternates("/giveaway"),
    },
  };
}

export default async function LangGiveawayPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  return <GiveawayClient />;
}
