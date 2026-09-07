import type { Metadata } from "next";
import CardDetail from "@/app/cards/[id]/CardDetail";
import { stripTags, stripTagsFlat, clipMetaDescription, SITE_NAME, SITE_URL, buildLanguageAlternates } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import type { EntityStats } from "@/app/components/EntityRunStats";
import { fetchEntityStats } from "@/lib/entity-stats";
import { isValidLang, LANG_HREFLANG, LANG_NAMES, LANG_GAME_NAME, type LangCode } from "@/lib/languages";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { cardOgImages } from "@/lib/image-url";
import { enchantmentsForCard } from "@/lib/card-enchantments";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ lang: string; id: string }>; searchParams: Promise<{ channel?: string }> };

/** The /beta rewrites inject ?channel=beta; forward it to the API. */
async function channelQS(searchParams: Props["searchParams"]): Promise<string> {
  const { channel } = await searchParams;
  return channel === "beta" ? "&channel=beta" : "";
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { lang, id } = await params;
  const qs = await channelQS(searchParams);
  if (!isValidLang(lang)) return {};
  try {
    const res = await fetch(`${API_INTERNAL}/api/cards/${id}?lang=${lang}${qs}`);
    if (!res.ok) return { title: "Card Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const card = await res.json();
    const langCode = lang as LangCode;
    const gameName = LANG_GAME_NAME[langCode];
    const color = (card.color || "").replace(/^\w/, (c: string) => c.toUpperCase());
    const title = `${card.name} - ${gameName} ${card.rarity} ${card.type} | Spire Codex (${LANG_NAMES[langCode]})`;
    const descFlat = stripTagsFlat(card.description || "");
    const keywords = card.keywords?.length ? ` Keywords: ${card.keywords.join(", ")}.` : "";
    const metaDesc = clipMetaDescription(
      `${gameName}, ${card.name} (${card.cost ?? "X"}-cost ${card.rarity} ${card.type}, ${color}). ${descFlat}${keywords}`,
    );
    const languages = buildLanguageAlternates(`/cards/${id}`);
    const ogImages = cardOgImages(card, lang);
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        siteName: SITE_NAME,
        url: `${SITE_URL}/${lang}/cards/${id}`,
        title,
        description: metaDesc,
        locale: LANG_HREFLANG[langCode],
        // Full game-rendered card (base + upgraded) in this language.
        images: ogImages,
      },
      twitter: { card: "summary_large_image", title, description: metaDesc, images: ogImages.map((i) => i.url) },
      alternates: { canonical: `/${lang}/cards/${id}`, languages },
    };
  } catch {
    return { title: "Spire Codex" };
  }
}

export default async function Page({ params, searchParams }: Props) {
  const { lang, id } = await params;
  const qs = await channelQS(searchParams);
  if (!isValidLang(lang)) return null;
  const langCode = lang as LangCode;
  let jsonLd = null;
  let card = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/cards/${id}?lang=${lang}${qs}`);
    if (res.ok) {
      card = await res.json();
      const desc = stripTags(card.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: card.name, description: desc || card.name, path: `/${lang}/cards/${id}`,
        imageUrl: cardOgImages(card, lang)[0]?.url, category: "Card",
        breadcrumbs: [{ name: "Home", href: `/${lang}` }, { name: "Cards", href: `/${lang}/cards` }, { name: card.name, href: `/${lang}/cards/${id}` }],
        inLanguage: LANG_HREFLANG[langCode],
      });
      jsonLd = detailJsonLd;
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!card) redirectMissingEntity("cards", id, lang);
  const initialStats: EntityStats | null = await fetchEntityStats("cards", id);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <CardDetail initialCard={card} initialEnchantments={enchantmentsForCard(id)} initialStats={initialStats} />
    </>
  );
}
