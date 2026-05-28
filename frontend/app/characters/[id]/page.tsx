import type { Metadata } from "next";
import CharacterDetail from "./CharacterDetail";
import { stripTags, stripTagsFlat, clipMetaDescription, buildLanguageAlternates, SITE_NAME, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";

import { imageUrl } from "@/lib/image-url";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/characters/${id}`);
    if (!res.ok) return { title: "Character Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const char = await res.json();
    const desc = stripTagsFlat(char.description || "");
    const title = `Character - ${char.name} - Slay the Spire 2 (sts2) | Spire Codex`;
    const stats = char.starting_hp ? `${char.starting_hp} HP, ${char.max_energy} Energy.` : "";
    const metaDesc = clipMetaDescription(
      `Slay the Spire 2 playable character — ${char.name}.${stats ? ` ${stats}` : ""}${desc ? ` ${desc}` : ""}`,
    );
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        siteName: SITE_NAME,
        url: `${SITE_URL}/characters/${id}`,
        title,
        description: metaDesc,
        images: [{ url: imageUrl(`/static/images/characters/combat_${char.id.toLowerCase()}.webp`) }],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: `/characters/${id}`, languages: buildLanguageAlternates(`/characters/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
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
      const detailJsonLd = buildDetailPageJsonLd({
        name: char.name,
        description: desc || `${char.name} from Slay the Spire 2`,
        path: `/characters/${id}`,
        imageUrl: imageUrl(`/static/images/characters/combat_${char.id.toLowerCase()}.webp`),
        category: "Character",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Characters", href: "/characters" },
          { name: char.name, href: `/characters/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `How do you play ${char.name} in Slay the Spire 2?`, answer: desc || `${char.name} is a playable character in Slay the Spire 2.` },
        { question: `What is ${char.name}'s starting HP in Slay the Spire 2?`, answer: char.starting_hp ? `${char.name} starts with ${char.starting_hp} HP.` : `${char.name}'s HP information is available on the character page.` },
        { question: `What type of deck does ${char.name} use?`, answer: char.deck?.length ? `${char.name} starts with ${char.deck.length} cards in their starting deck.` : `${char.name} uses a unique card pool.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <CharacterDetail initialCharacter={char} />
    </>
  );
}
