import type { Metadata } from "next";
import { entityDescription, entityFallbackDescription, entityTitle, inLanguageOf, langQuery, localeOf, localePath, ogLocaleOf, uiText } from "@/lib/locale";
import CharacterDetail from "./CharacterDetail";
import { stripTags, stripTagsFlat, clipMetaDescription, buildLanguageAlternates, SITE_NAME, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";

import { imageUrl } from "@/lib/image-url";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  try {
    const res = await fetch(`${API_INTERNAL}/api/characters/${id}${langQuery(locale)}`);
    if (!res.ok) return { title: "Character Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const char = await res.json();
    const desc = stripTagsFlat(char.description || "");
    const title = locale === "eng" ? `Character - ${char.name} - Slay the Spire 2 (sts2) | Spire Codex` : entityTitle(locale, char.name, "Character");
    const stats = char.starting_hp ? `${char.starting_hp} HP, ${char.max_energy} Energy.` : "";
    const metaDesc = locale === "eng"
      ? clipMetaDescription(
      `Slay the Spire 2 playable character, ${char.name}.${stats ? ` ${stats}` : ""}${desc ? ` ${desc}` : ""}`,
    )
      : entityDescription(locale, char.name, "character", desc);
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        locale: ogLocaleOf(locale),
        siteName: SITE_NAME,
        url: `${SITE_URL}${localePath(locale, `/characters/${id}`)}`,
        title,
        description: metaDesc,
        images: [{ url: imageUrl(`/static/images/characters/combat_${char.id.toLowerCase()}.webp`) }],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: localePath(locale, `/characters/${id}`), languages: buildLanguageAlternates(`/characters/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  let jsonLd = null;
  let char = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/characters/${id}${langQuery(locale)}`);
    if (res.ok) {
      char = await res.json();
      const desc = stripTags(char.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: char.name,
        description: desc || entityFallbackDescription(locale, char.name, "character"),
        path: localePath(locale, `/characters/${id}`),
        imageUrl: imageUrl(`/static/images/characters/combat_${char.id.toLowerCase()}.webp`),
        category: "Character",
        inLanguage: inLanguageOf(locale),
        breadcrumbs: [
          { name: uiText(locale, "Home"), href: localePath(locale, "/") },
          { name: uiText(locale, "Characters"), href: localePath(locale, "/characters") },
          { name: char.name, href: localePath(locale, `/characters/${id}`) },
        ],
      });
      const faqQuestions = [
        { question: `How do you play ${char.name} in Slay the Spire 2?`, answer: desc || `${char.name} is a playable character in Slay the Spire 2.` },
        { question: `What is ${char.name}'s starting HP in Slay the Spire 2?`, answer: char.starting_hp ? `${char.name} starts with ${char.starting_hp} HP.` : `${char.name}'s HP information is available on the character page.` },
        { question: `What type of deck does ${char.name} use?`, answer: char.deck?.length ? `${char.name} starts with ${char.deck.length} cards in their starting deck.` : `${char.name} uses a unique card pool.` },
      ];
      jsonLd = locale === "eng" ? [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)] : detailJsonLd;
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!char) redirectMissingEntity("characters", id, locale === "eng" ? undefined : locale);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <CharacterDetail initialCharacter={char} />
    </>
  );
}
