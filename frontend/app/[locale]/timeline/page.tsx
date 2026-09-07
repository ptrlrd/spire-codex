import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, inLanguageOf, listMetadata, localeOf, localePath, type Locale } from "@/lib/locale";
import { LANG_NAMES } from "@/lib/languages";
import type { Epoch, Story, Card, Relic, Potion } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import TimelineClient from "./TimelineClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string }> };

function pageCopy(locale: Locale, t: TFn) {
  if (locale === "eng") return { heading: "Slay the Spire 2 (sts2) Timeline", title: "Slay the Spire 2 (sts2) Timeline | Spire Codex", description: "Explore the full Slay the Spire 2 timeline across every epoch, story arc, and era. Track story progression, unlockable cards, relics, and potions.", tagline: "Explore the full Slay the Spire 2 timeline across every epoch, story arc, and era. Track story progression, unlockable cards, relics, and potions." };
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  const heading = `${gameName} ${t("Timeline")}`;
  const desc = `${gameName} ${t("Timeline")} (${nativeName}). All epochs, eras, and story arcs with cards, relics, and potions unlocked at each step.`;
  return { heading, title: `${heading} | Spire Codex (${nativeName})`, description: desc, tagline: t("timeline_tagline") };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const copy = pageCopy(locale, await getT(locale));
  return listMetadata(locale, { path: "/timeline", title: copy.title, description: copy.description });
}

export default async function TimelinePage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const copy = pageCopy(locale, t);
  let epochs: Epoch[] = [];
  let stories: Story[] = [];
  let cards: Card[] = [];
  let relics: Relic[] = [];
  let potions: Potion[] = [];

  try {
    const [epochsRes, storiesRes, cardsRes, relicsRes, potionsRes] = await Promise.all([
      fetch(`${API}/api/epochs?lang=${locale}`, { next: { revalidate: 300 } }),
      fetch(`${API}/api/stories?lang=${locale}`, { next: { revalidate: 300 } }),
      fetch(`${API}/api/cards?lang=${locale}`, { next: { revalidate: 300 } }),
      fetch(`${API}/api/relics?lang=${locale}`, { next: { revalidate: 300 } }),
      fetch(`${API}/api/potions?lang=${locale}`, { next: { revalidate: 300 } }),
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
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Timeline"), href: localePath(locale, "/timeline") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Timeline",
      description: "Explore the full Slay the Spire 2 timeline across every epoch and story arc.",
      path: localePath(locale, "/timeline"),
      inLanguage: inLanguageOf(locale),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{copy.heading}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">{copy.tagline}</p>

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
