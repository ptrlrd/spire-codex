import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, inLanguageOf, listMetadata, localeOf, localePath, type Locale } from "@/lib/locale";
import { LANG_NAMES } from "@/lib/languages";
import type { Character } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import CharactersClient from "./CharactersClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string }> };

function pageCopy(locale: Locale, t: TFn) {
  if (locale === "eng") return { heading: "Slay the Spire 2 (sts2) Characters", title: "Slay the Spire 2 (sts2) Characters | Spire Codex", description: "All playable characters in Slay the Spire 2, view starting decks, relics, HP, gold, energy, and more.", tagline: "All playable characters in Slay the Spire 2, view starting decks, relics, HP, gold, energy, and more." };
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  const heading = `${gameName} ${t("Characters")}`;
  const desc = `${gameName} ${t("Characters")} (${nativeName}). All five playable characters, Ironclad, Silent, Defect, Necrobinder, Regent. Starting decks and stats.`;
  return { heading, title: `${heading} | Spire Codex (${nativeName})`, description: desc, tagline: t("characters_tagline") };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const copy = pageCopy(locale, await getT(locale));
  return listMetadata(locale, { path: "/characters", title: copy.title, description: copy.description });
}

export default async function CharactersPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const copy = pageCopy(locale, t);
  let characters: Character[] = [];
  try {
    const res = await fetch(`${API}/api/characters?lang=${locale}`, { next: { revalidate: 300 } });
    if (res.ok) characters = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Characters"), href: localePath(locale, "/characters") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Characters",
      description: "All playable characters in Slay the Spire 2.",
      path: localePath(locale, "/characters"),
      inLanguage: inLanguageOf(locale),
      items: characters.map((c) => ({ name: c.name, path: `/characters/${c.id.toLowerCase()}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{copy.heading}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">{copy.tagline}</p>

      <CharactersClient initialCharacters={characters} />
    </div>
  );
}
