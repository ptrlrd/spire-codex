import type { Metadata } from "next";
import CardDetail from "@/app/cards/[id]/CardDetail";
import { stripTags, stripTagsFlat, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { isValidLang, LANG_HREFLANG, LANG_NAMES, LANG_GAME_NAME, SUPPORTED_LANGS, type LangCode } from "@/lib/languages";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ lang: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return {};
  try {
    const res = await fetch(`${API_INTERNAL}/api/cards/${id}?lang=${lang}`);
    if (!res.ok) return { title: "Card Not Found - Spire Codex" };
    const card = await res.json();
    const langCode = lang as LangCode;
    const gameName = LANG_GAME_NAME[langCode];
    const color = (card.color || "").replace(/^\w/, (c: string) => c.toUpperCase());
    const title = `${gameName} Card - ${card.name} - ${card.rarity} ${card.type} | Spire Codex (${LANG_NAMES[langCode]})`;
    const descFlat = stripTagsFlat(card.description || "");
    const keywords = card.keywords?.length ? ` ${card.keywords.join(". ")}.` : "";
    const metaDesc = `${card.name} is a ${card.cost ?? "X"} cost ${card.rarity} ${card.type} used by ${color}.\n${descFlat}${keywords}`;
    const languages: Record<string, string> = { "en": `${SITE_URL}/cards/${id}`, "x-default": `${SITE_URL}/cards/${id}` };
    for (const code of SUPPORTED_LANGS) languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/cards/${id}`;
    return {
      title,
      description: metaDesc,
      openGraph: { title, description: metaDesc, locale: LANG_HREFLANG[langCode], images: card.image_url ? [{ url: `${API_PUBLIC}${card.image_url}` }] : [] },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/${lang}/cards/${id}`, languages },
    };
  } catch {
    return { title: "Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return null;
  let jsonLd = null;
  let card = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/cards/${id}?lang=${lang}`);
    if (res.ok) {
      card = await res.json();
      const desc = stripTags(card.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: card.name, description: desc || card.name, path: `/${lang}/cards/${id}`,
        imageUrl: card.image_url ? `${API_PUBLIC}${card.image_url}` : undefined, category: "Card",
        breadcrumbs: [{ name: "Home", href: `/${lang}` }, { name: "Cards", href: `/${lang}/cards` }, { name: card.name, href: `/${lang}/cards/${id}` }],
      });
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd([{ question: `${card.name}?`, answer: desc || card.name }])];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <CardDetail initialCard={card} />
    </>
  );
}
