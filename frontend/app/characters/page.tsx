import type { Character } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import CharactersClient from "./CharactersClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default async function CharactersPage() {
  let characters: Character[] = [];
  try {
    const res = await fetch(`${API}/api/characters?lang=eng`, { next: { revalidate: 300 } });
    if (res.ok) characters = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Characters", href: "/characters" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Characters",
      description: "All playable characters in Slay the Spire 2.",
      path: "/characters",
      items: characters.map((c) => ({ name: c.name, path: `/characters/${c.id.toLowerCase()}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Slay the Spire 2 (STS2) Characters</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        All playable characters in Slay the Spire 2 — view starting decks, relics, HP, gold, energy, and more.
      </p>

      <CharactersClient initialCharacters={characters} />
    </div>
  );
}
