import type { Metadata } from "next";
import type { Character, Card } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import CompareDetail from "@/app/compare/[pair]/CompareDetail";
import { isValidLang, LANG_HREFLANG, LANG_NAMES, LANG_GAME_NAME, SUPPORTED_LANGS, type LangCode } from "@/lib/languages";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";

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

function parsePair(pair: string): { a: string; b: string } | null {
  const match = pair.match(/^(\w+)-vs-(\w+)$/);
  if (!match) return null;
  const a = match[1];
  const b = match[2];
  if (!CHARACTERS.includes(a) || !CHARACTERS.includes(b) || a === b) return null;
  return { a, b };
}

type Props = { params: Promise<{ lang: string; pair: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, pair } = await params;
  if (!isValidLang(lang)) return {};
  const parsed = parsePair(pair);
  if (!parsed) return { title: "Comparison Not Found - Spire Codex" };

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nameA = CHAR_NAMES[parsed.a];
  const nameB = CHAR_NAMES[parsed.b];
  const title = `${gameName} ${nameA} vs ${nameB} - Character Comparison | Spire Codex (${LANG_NAMES[langCode]})`;
  const description = `Compare ${nameA} and ${nameB} in ${gameName}. Side-by-side stats, card pool breakdowns by type and rarity, keyword distributions, and starting decks.`;

  const languages: Record<string, string> = { "en": `${SITE_URL}/compare/${pair}`, "x-default": `${SITE_URL}/compare/${pair}` };
  for (const code of SUPPORTED_LANGS) languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/compare/${pair}`;

  return {
    title,
    description,
    openGraph: { title, description, locale: LANG_HREFLANG[langCode] },
    twitter: { card: "summary_large_image" },
    alternates: { canonical: `/${lang}/compare/${pair}`, languages },
  };
}

async function fetchCharacterAndCards(
  charId: string,
  lang: string
): Promise<{ character: Character; cards: Card[] } | null> {
  try {
    const [charRes, cardsRes] = await Promise.all([
      fetch(`${API_INTERNAL}/api/characters/${charId}?lang=${lang}`, { next: { revalidate: 300 } }),
      fetch(`${API_INTERNAL}/api/cards?color=${charId}&lang=${lang}`, {
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
  const { lang, pair } = await params;
  if (!isValidLang(lang)) return null;
  const parsed = parsePair(pair);

  if (!parsed) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold mb-4 text-[var(--accent-gold)]">
          Comparison Not Found
        </h1>
        <p className="text-[var(--text-muted)]">
          Invalid comparison pair. Please choose a valid character pair from the{" "}
          <a href={`/${lang}/compare`} className="text-[var(--accent-gold)] underline">
            comparisons page
          </a>
          .
        </p>
      </div>
    );
  }

  const [dataA, dataB] = await Promise.all([
    fetchCharacterAndCards(parsed.a, lang),
    fetchCharacterAndCards(parsed.b, lang),
  ]);

  const nameA = CHAR_NAMES[parsed.a];
  const nameB = CHAR_NAMES[parsed.b];
  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];

  let jsonLd = null;
  if (dataA && dataB) {
    jsonLd = buildDetailPageJsonLd({
      name: `${nameA} vs ${nameB}`,
      description: `Side-by-side comparison of ${nameA} and ${nameB} in ${gameName}.`,
      path: `/${lang}/compare/${pair}`,
      category: "Character Comparison",
      breadcrumbs: [
        { name: "Home", href: `/${lang}` },
        { name: "Compare", href: `/${lang}/compare` },
        { name: `${nameA} vs ${nameB}`, href: `/${lang}/compare/${pair}` },
      ],
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
