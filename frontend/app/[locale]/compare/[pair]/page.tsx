import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import type { Character, Card } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import { getT } from "@/lib/i18n-server";
import { gameNameFor, inLanguageOf, langQuery, localeOf, localePath, type Locale } from "@/lib/locale";
import { uiText } from "@/lib/locale-server";
import { buildPageMetadata } from "@/lib/seo";
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

function entityIdOf(camel: string): string {
  return camel.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

function parsePair(pair: string): { a: string; b: string } | null {
  const match = pair.match(/^(\w+)-vs-(\w+)$/);
  if (!match) return null;
  const a = match[1];
  const b = match[2];
  if (!CHARACTERS.includes(a) || !CHARACTERS.includes(b) || a === b) return null;
  return { a, b };
}

type Props = { params: Promise<{ locale: string; pair: string }> };

async function fetchCharacterName(charId: string, locale: Locale): Promise<string> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/characters/${charId}${langQuery(locale)}`, { next: { revalidate: 300 } });
    if (!res.ok) return CHAR_NAMES[charId];
    const character: Character = await res.json();
    return character.name || CHAR_NAMES[charId];
  } catch {
    return CHAR_NAMES[charId];
  }
}

async function fetchRelicNames(ids: string[], locale: Locale): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/relics${langQuery(locale)}`, { next: { revalidate: 300 } });
    if (!res.ok) return {};
    const relics: { id: string; name: string }[] = await res.json();
    const wanted = new Set(ids);
    const names: Record<string, string> = {};
    for (const r of relics) if (wanted.has(r.id.toUpperCase())) names[r.id.toUpperCase()] = r.name;
    return names;
  } catch {
    return {};
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, pair } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const path = `/compare/${pair}`;
  const parsed = parsePair(pair);
  if (!parsed) return buildPageMetadata({ locale, path, title: t("Comparison Not Found"), noIndex: true });

  const [nameA, nameB] = await Promise.all([fetchCharacterName(parsed.a, locale), fetchCharacterName(parsed.b, locale)]);
  return buildPageMetadata({
    locale,
    path,
    title: `${nameA} vs ${nameB} - ${t("Compare")}`,
    description: t("compare_pair_meta_description", { a: nameA, b: nameB }),
    ogType: "article",
  });
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

  const nameA = dataA?.character.name || CHAR_NAMES[parsed.a];
  const nameB = dataB?.character.name || CHAR_NAMES[parsed.b];
  const gameName = gameNameFor(locale, "Slay the Spire 2");
  const relicNames = await fetchRelicNames(
    [...(dataA?.character.starting_relics ?? []), ...(dataB?.character.starting_relics ?? [])].map(entityIdOf),
    locale,
  );

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
        initialRelicNames={relicNames}
      />
    </>
  );
}
