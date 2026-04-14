import type { Metadata } from "next";
import CharacterDetail from "./CharacterDetail";
import { stripTags } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/characters/${id}`);
    if (!res.ok) return { title: "Character Not Found - Spire Codex" };
    const char = await res.json();
    const desc = stripTags(char.description || "");
    const title = `Slay the Spire 2 Character - ${char.name} | Spire Codex`;
    const metaDesc = `${char.name} is a playable character in Slay the Spire 2. ${char.starting_hp ? `${char.starting_hp} HP, ${char.max_energy} Energy.` : ""} ${desc}`;
    return {
      title,
      description: metaDesc,
      openGraph: {
        title,
        description: metaDesc,
        images: [{ url: `${API_PUBLIC}/static/images/characters/combat_${char.id.toLowerCase()}.webp` }],
      },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/characters/${id}` },
    };
  } catch {
    return { title: "Spire Codex - Slay the Spire 2 Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let char = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/characters/${id}`);
    if (res.ok) {
      char = await res.json();
      const desc = stripTags(char.description || "");
      jsonLd = buildDetailPageJsonLd({
        name: char.name,
        description: desc || `${char.name} from Slay the Spire 2`,
        path: `/characters/${id}`,
        imageUrl: `${API_PUBLIC}/static/images/characters/combat_${char.id.toLowerCase()}.webp`,
        category: "Character",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Characters", href: "/characters" },
          { name: char.name, href: `/characters/${id}` },
        ],
      });
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <CharacterDetail initialCharacter={char} />
    </>
  );
}
