import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import type { Character, Card } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import { LANG_NAMES } from "@/lib/languages";
import { gameNameFor, inLanguageOf, langQuery, localeOf, localePath, ogLocaleOf, uiText, type Locale } from "@/lib/locale";
import { DEFAULT_OG_IMAGE, buildLanguageAlternates, SITE_NAME, SITE_URL } from "@/lib/seo";
import CompareDetail from "./CompareDetail";

export const dynamic = "force-static";
export const revalidate = 3600;

const API_INTERNAL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const CHARACTERS = ["ironclad", "silent", "defect", "necrobinder", "regent"];

const CHAR_NAMES: Record<string, string> = {
  ironclad: "Ironclad",
  silent: "Silent",
  defect: "Defect",
  necrobinder: "Necrobinder",
  regent: "Regent",
};

const CHAR_COLORS: Record<string, string> = {
  ironclad: "Red",
  silent: "Green",
  defect: "Blue",
  necrobinder: "Purple",
  regent: "Orange",
};

function parsePair(pair: string): { a: string; b: string } | null {
  const match = pair.match(/^(\w+)-vs-(\w+)$/);
  if (!match) return null;
  const a = match[1];
  const b = match[2];
  if (!CHARACTERS.includes(a) || !CHARACTERS.includes(b) || a === b) return null;
  return { a, b };
}

type Props = { params: Promise<{ locale: string; pair: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, pair } = await params;
  const locale = localeOf(rawLocale);
  const parsed = parsePair(pair);
  if (!parsed) return { title: "Comparison Not Found - Slay the Spire 2 (sts2) | Spire Codex" };

  const nameA = CHAR_NAMES[parsed.a];
  const nameB = CHAR_NAMES[parsed.b];
  const title =
    locale === "eng"
      ? `${nameA} vs ${nameB} - Character Comparison - Slay the Spire 2 (sts2) | Spire Codex`
      : `${gameNameFor(locale)} ${nameA} vs ${nameB} - Character Comparison | Spire Codex (${LANG_NAMES[locale]})`;
  const description =
    locale === "eng"
      ? `Compare ${nameA} and ${nameB} in Slay the Spire 2. Side-by-side stats, card pool breakdowns by type and rarity, keyword distributions, and starting decks.`
      : `Compare ${nameA} and ${nameB} in ${gameNameFor(locale)}. Side-by-side stats, card pool breakdowns by type and rarity, keyword distributions, and starting decks.`;

  return {
    title,
    description,
    openGraph: {
      type: "article",
      locale: ogLocaleOf(locale),
      siteName: SITE_NAME,
      url: `${SITE_URL}${localePath(locale, `/compare/${pair}`)}`,
      title,
      description,
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description },
    alternates: { canonical: localePath(locale, `/compare/${pair}`), languages: buildLanguageAlternates(`/compare/${pair}`) },
  };
}

async function fetchCharacterAndCards(
  charId: string,
  locale: Locale,
): Promise<{ character: Character; cards: Card[] } | null> {
  try {
    const [charRes, cardsRes] = await Promise.all([
      fetch(`${API_INTERNAL}/api/characters/${charId}${langQuery(locale)}`, { next: { revalidate: 300 } }),
      fetch(`${API_INTERNAL}/api/cards?color=${charId}&lang=${locale}`, {
        next: { revalidate: 300 },
      }),
    ]);
    if (!charRes.ok) return null;
    const character: Character = await charRes.json();
    const cards: Card[] = cardsRes.ok ? await cardsRes.json() : [];
    return { character, cards };
  } catch {
    return null;
  }
}

export default async function Page({ params }: Props) {
  const { locale: rawLocale, pair } = await params;
  const locale = localeOf(rawLocale);
  const parsed = parsePair(pair);

  // Invalid pair slug → 308 back to the locale's /compare hub. The slug
  // grammar is strictly `{charA}-vs-{charB}` from a fixed set of five
  // characters, so anything else is a stale URL we'd rather forward equity from.
  if (!parsed) {
    permanentRedirect(localePath(locale, "/compare"));
  }

  const [dataA, dataB] = await Promise.all([
    fetchCharacterAndCards(parsed.a, locale),
    fetchCharacterAndCards(parsed.b, locale),
  ]);

  const nameA = CHAR_NAMES[parsed.a];
  const nameB = CHAR_NAMES[parsed.b];
  const gameName = locale === "eng" ? "Slay the Spire 2" : gameNameFor(locale);

  let jsonLd = null;
  if (dataA && dataB) {
    jsonLd = buildDetailPageJsonLd({
      name: `${nameA} vs ${nameB}`,
      description: `Side-by-side comparison of ${nameA} and ${nameB} in ${gameName}.`,
      path: localePath(locale, `/compare/${pair}`),
      category: "Character Comparison",
      breadcrumbs: [
        { name: uiText(locale, "Home"), href: localePath(locale, "/") },
        { name: uiText(locale, "Compare"), href: localePath(locale, "/compare") },
        { name: `${nameA} vs ${nameB}`, href: localePath(locale, `/compare/${pair}`) },
      ],
      inLanguage: inLanguageOf(locale),
    });
  }

  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <CompareDetail
        pairSlug={pair}
        initialCharA={dataA?.character ?? null}
        initialCharB={dataB?.character ?? null}
        initialCardsA={dataA?.cards ?? []}
        initialCardsB={dataB?.cards ?? []}
      />
    </>
  );
}
