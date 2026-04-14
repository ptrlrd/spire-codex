import type { Metadata } from "next";
import type { Card } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import CardsClient from "@/app/cards/CardsClient";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import {
  isValidLang,
  LANG_GAME_NAME,
  LANG_CARDS,
  LANG_NAMES,
  LANG_HREFLANG,
  SUPPORTED_LANGS,
  type LangCode,
} from "@/lib/languages";
import { SITE_URL } from "@/lib/seo";
import { t } from "@/lib/ui-translations";

export const dynamic = "force-dynamic";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const cardsWord = LANG_CARDS[langCode];
  const nativeName = LANG_NAMES[langCode];

  const title = `${gameName} ${cardsWord} | Spire Codex (${nativeName})`;
  const description = `${gameName} ${cardsWord} — Spire Codex. ${nativeName}.`;

  const languages: Record<string, string> = {
    "en": `${SITE_URL}/cards`,
    "x-default": `${SITE_URL}/cards`,
  };
  for (const code of SUPPORTED_LANGS) {
    languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/cards`;
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      locale: LANG_HREFLANG[langCode],
    },
    alternates: {
      canonical: `/${lang}/cards`,
      languages,
    },
  };
}

export default async function LangCardsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const cardsWord = LANG_CARDS[langCode];
  const nativeName = LANG_NAMES[langCode];

  let cards: Card[] = [];
  try {
    const res = await fetch(`${API}/api/cards?lang=${lang}`, { next: { revalidate: 300 } });
    if (res.ok) cards = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: nativeName, href: `/${lang}` },
      { name: cardsWord, href: `/${lang}/cards` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} ${cardsWord}`,
      description: `Browse every card across Ironclad, Silent, Defect, Necrobinder, and Regent.`,
      path: `/${lang}/cards`,
      items: cards.map((c) => ({ name: c.name, path: `/cards/${c.id.toLowerCase()}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{gameName} {cardsWord}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t("cards_tagline", lang)}
      </p>

      <RecentlyAdded entityType="cards" label="Card" pathPrefix={`/${lang}/cards`} />

      <CardsClient initialCards={cards} />
    </div>
  );
}
