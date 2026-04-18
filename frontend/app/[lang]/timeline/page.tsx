import type { Metadata } from "next";
import type { Epoch, Story, Card, Relic, Potion } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import TimelineClient from "@/app/timeline/TimelineClient";
import {
  isValidLang,
  LANG_GAME_NAME,
  LANG_NAMES,
  LANG_HREFLANG,
  SUPPORTED_LANGS,
  type LangCode,
} from "@/lib/languages";
import { SITE_URL } from "@/lib/seo";
import { t } from "@/lib/ui-translations";

export const dynamic = "force-dynamic";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const CATEGORY = "timeline";
const CATEGORY_LABEL = "Timeline";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];

  const title = `${gameName} ${t(CATEGORY_LABEL, lang)} | Spire Codex (${nativeName})`;
  const description = `${gameName} ${t(CATEGORY_LABEL, lang)} — Spire Codex. ${nativeName}.`;

  const languages: Record<string, string> = {
    "en": `${SITE_URL}/${CATEGORY}`,
    "x-default": `${SITE_URL}/${CATEGORY}`,
  };
  for (const code of SUPPORTED_LANGS) {
    languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/${CATEGORY}`;
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
      canonical: `/${lang}/${CATEGORY}`,
      languages,
    },
  };
}

export default async function LangTimelinePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];

  let epochs: Epoch[] = [];
  let stories: Story[] = [];
  let cards: Card[] = [];
  let relics: Relic[] = [];
  let potions: Potion[] = [];

  try {
    const [epochsRes, storiesRes, cardsRes, relicsRes, potionsRes] = await Promise.all([
      fetch(`${API}/api/epochs?lang=${lang}`, { next: { revalidate: 300 } }),
      fetch(`${API}/api/stories?lang=${lang}`, { next: { revalidate: 300 } }),
      fetch(`${API}/api/cards?lang=${lang}`, { next: { revalidate: 300 } }),
      fetch(`${API}/api/relics?lang=${lang}`, { next: { revalidate: 300 } }),
      fetch(`${API}/api/potions?lang=${lang}`, { next: { revalidate: 300 } }),
    ]);
    if (epochsRes.ok) epochs = await epochsRes.json();
    if (storiesRes.ok) stories = await storiesRes.json();
    if (cardsRes.ok) cards = await cardsRes.json();
    if (relicsRes.ok) relics = await relicsRes.json();
    if (potionsRes.ok) potions = await potionsRes.json();
  } catch {}

  // Sort epochs by sort_order for initial render
  epochs.sort((a, b) => a.sort_order - b.sort_order);

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: nativeName, href: `/${lang}` },
      { name: CATEGORY_LABEL, href: `/${lang}/${CATEGORY}` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} ${t(CATEGORY_LABEL, lang)}`,
      description: `Explore the full Slay the Spire 2 timeline across every epoch and story arc.`,
      path: `/${lang}/${CATEGORY}`,
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{gameName} {t(CATEGORY_LABEL, lang)}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t("timeline_tagline", lang)}
      </p>

      <TimelineClient
        initialEpochs={epochs}
        initialStories={stories}
        initialCards={cards}
        initialRelics={relics}
        initialPotions={potions}
      />
    </div>
  );
}
