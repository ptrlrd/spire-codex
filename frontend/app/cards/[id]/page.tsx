import type { Metadata } from "next";
import CardDetail from "./CardDetail";
import { stripTags, stripTagsFlat, clipMetaDescription, buildLanguageAlternates, SITE_NAME, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { imageUrl } from "@/lib/image-url";

// 1h on-demand ISR. force-static + revalidate forces Next.js to
// cache even with async-params pages — without it, Next 15+ sees
// `await params` and marks the page dynamic, emitting
// `Cache-Control: no-store` which makes CF refuse to cache.
// dynamicParams=true (default) means any [id] is generated on demand
// then cached for the revalidate window.
export const dynamic = "force-static";
export const revalidate = 3600;

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/cards/${id}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { title: "Card Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const card = await res.json();
    const desc = stripTags(card.description || "");
    const color = (card.color || "").replace(/^\w/, (c: string) => c.toUpperCase());
    const title = `Card - ${card.name} - ${card.rarity} ${card.type} - Slay the Spire 2 (sts2) | Spire Codex`;
    const descFlat = stripTagsFlat(card.description || "");
    const keywords = card.keywords?.length ? ` Keywords: ${card.keywords.join(", ")}.` : "";
    const metaDesc = clipMetaDescription(
      `Slay the Spire 2 card — ${card.name} (${card.cost ?? "X"}-cost ${card.rarity} ${card.type}, ${color}). ${descFlat}${keywords}`,
    );
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        siteName: SITE_NAME,
        url: `${SITE_URL}/cards/${id}`,
        title,
        description: metaDesc,
        images: card.image_url ? [{ url: imageUrl(card.image_url) }] : [],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: `/cards/${id}`, languages: buildLanguageAlternates(`/cards/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let card = null;
  let apiUnreachable = false;
  try {
    const res = await fetch(`${API_INTERNAL}/api/cards/${id}`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      card = await res.json();
      const desc = stripTags(card.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: card.name,
        description: desc || `${card.name} card from Slay the Spire 2`,
        path: `/cards/${id}`,
        imageUrl: card.image_url ? imageUrl(card.image_url) : undefined,
        category: "Card",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Cards", href: "/cards" },
          { name: card.name, href: `/cards/${id}` },
        ],
      });
      const costText = card.is_x_cost ? "X energy" : card.is_x_star_cost ? "X stars" : card.star_cost ? `${card.star_cost} star(s)` : `${card.cost} energy`;
      const faqQuestions = [
        { question: `What does ${card.name} do in Slay the Spire 2?`, answer: desc || `${card.name} is a card in Slay the Spire 2.` },
        { question: `How much does ${card.name} cost?`, answer: `${card.name} costs ${costText}.` },
        { question: `What type of card is ${card.name}?`, answer: `${card.name} is a ${card.rarity} ${card.type} card for ${card.color}.` },
      ];
      if (card.keywords?.length) {
        faqQuestions.push({ question: `Does ${card.name} have any keywords?`, answer: `Yes, ${card.name} has: ${card.keywords.join(", ")}.` });
      }
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    // Network / DNS / backend-down. Don't redirect blindly here — if
    // the backend is offline we'd send every detail page request into
    // a 308 storm at the hub. Fall through to render the client
    // component, which has its own retry-on-mount + Not Found UI.
    apiUnreachable = true;
  }
  // 308 unknown IDs to the cards list so search engines transfer
  // link equity and humans land on something useful.
  if (!card && !apiUnreachable) redirectMissingEntity("cards", id);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <CardDetail initialCard={card} />
    </>
  );
}
