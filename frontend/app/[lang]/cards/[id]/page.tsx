import type { Metadata } from "next";
import CardDetail from "@/app/cards/[id]/CardDetail";
import { stripTags, stripTagsFlat, clipMetaDescription, SITE_NAME, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { isValidLang, LANG_HREFLANG, LANG_NAMES, LANG_GAME_NAME, SUPPORTED_LANGS, type LangCode } from "@/lib/languages";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { imageUrl } from "@/lib/image-url";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ lang: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return {};
  try {
    const res = await fetch(`${API_INTERNAL}/api/cards/${id}?lang=${lang}`);
    if (!res.ok) return { title: "Card Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const card = await res.json();
    const langCode = lang as LangCode;
    const gameName = LANG_GAME_NAME[langCode];
    const color = (card.color || "").replace(/^\w/, (c: string) => c.toUpperCase());
    const title = `${gameName} Card - ${card.name} - ${card.rarity} ${card.type} | Spire Codex (${LANG_NAMES[langCode]})`;
    const descFlat = stripTagsFlat(card.description || "");
    const keywords = card.keywords?.length ? ` Keywords: ${card.keywords.join(", ")}.` : "";
    const metaDesc = clipMetaDescription(
      `${gameName} — ${card.name} (${card.cost ?? "X"}-cost ${card.rarity} ${card.type}, ${color}). ${descFlat}${keywords}`,
    );
    const languages: Record<string, string> = { "en": `${SITE_URL}/cards/${id}`, "x-default": `${SITE_URL}/cards/${id}` };
    for (const code of SUPPORTED_LANGS) languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/cards/${id}`;
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
        images: card.image_url ? [{ url: imageUrl(card.image_url) }] : [],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: `/${lang}/cards/${id}`, languages },
    };
  } catch {
    return { title: "Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return null;
  const langCode = lang as LangCode;
  let jsonLd = null;
  let card = null;
  let apiUnreachable = false;
  try {
    const res = await fetch(`${API_INTERNAL}/api/cards/${id}?lang=${lang}`);
    if (res.ok) {
      card = await res.json();
      const desc = stripTags(card.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: card.name, description: desc || card.name, path: `/${lang}/cards/${id}`,
        imageUrl: card.image_url ? imageUrl(card.image_url) : undefined, category: "Card",
        breadcrumbs: [{ name: "Home", href: `/${lang}` }, { name: "Cards", href: `/${lang}/cards` }, { name: card.name, href: `/${lang}/cards/${id}` }],
        inLanguage: LANG_HREFLANG[langCode],
      });
      const costText = card.is_x_cost ? "X" : card.star_cost ? `${card.star_cost}★` : `${card.cost}`;
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd([
        { question: `What does ${card.name} do in Slay the Spire 2?`, answer: desc || card.name },
        { question: `How much does ${card.name} cost?`, answer: `${card.name} costs ${costText} energy.` },
        { question: `What type of card is ${card.name}?`, answer: `${card.name} is a ${card.rarity} ${card.type} card for ${card.color}.` },
      ])];
    }
  } catch {
    apiUnreachable = true;
  }
  if (!card && !apiUnreachable) redirectMissingEntity("cards", id, lang);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <CardDetail initialCard={card} />
    </>
  );
}
