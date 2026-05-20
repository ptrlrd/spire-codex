import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import type { Character, Card } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
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

type Props = { params: Promise<{ pair: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pair } = await params;
  const parsed = parsePair(pair);
  if (!parsed) return { title: "Comparison Not Found - Slay the Spire 2 (sts2) | Spire Codex" };

  const nameA = CHAR_NAMES[parsed.a];
  const nameB = CHAR_NAMES[parsed.b];
  const title = `${nameA} vs ${nameB} - Character Comparison - Slay the Spire 2 (sts2) | Spire Codex`;
  const description = `Compare ${nameA} and ${nameB} in Slay the Spire 2. Side-by-side stats, card pool breakdowns by type and rarity, keyword distributions, and starting decks.`;

  return {
    title,
    description,
    openGraph: {
      title: `${nameA} vs ${nameB} - Character Comparison - Slay the Spire 2 (sts2) | Spire Codex`,
      description,
    },
    twitter: { card: "summary_large_image" },
    alternates: { canonical: `/compare/${pair}` },
  };
}

async function fetchCharacterAndCards(
  charId: string
): Promise<{ character: Character; cards: Card[] } | null> {
  try {
    const [charRes, cardsRes] = await Promise.all([
      fetch(`${API_INTERNAL}/api/characters/${charId}`, { next: { revalidate: 300 } }),
      fetch(`${API_INTERNAL}/api/cards?color=${charId}&lang=eng`, {
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
  const { pair } = await params;
  const parsed = parsePair(pair);

  // Invalid pair slug → 308 back to /compare. The slug grammar is
  // strictly `{charA}-vs-{charB}` from a fixed set of five characters,
  // so anything else is a stale URL we'd rather forward equity from.
  if (!parsed) {
    permanentRedirect("/compare");
  }

  const [dataA, dataB] = await Promise.all([
    fetchCharacterAndCards(parsed.a),
    fetchCharacterAndCards(parsed.b),
  ]);

  const nameA = CHAR_NAMES[parsed.a];
  const nameB = CHAR_NAMES[parsed.b];

  let jsonLd = null;
  if (dataA && dataB) {
    jsonLd = buildDetailPageJsonLd({
      name: `${nameA} vs ${nameB}`,
      description: `Side-by-side comparison of ${nameA} and ${nameB} in Slay the Spire 2.`,
      path: `/compare/${pair}`,
      category: "Character Comparison",
      breadcrumbs: [
        { name: "Home", href: "/" },
        { name: "Compare", href: "/compare" },
        { name: `${nameA} vs ${nameB}`, href: `/compare/${pair}` },
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
