import type { Metadata } from "next";
import CardDetail from "./CardDetail";
import { stripTags, stripTagsFlat } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/cards/${id}`);
    if (!res.ok) return { title: "Card Not Found - Spire Codex" };
    const card = await res.json();
    const desc = stripTags(card.description || "");
    const color = (card.color || "").replace(/^\w/, (c: string) => c.toUpperCase());
    const title = `Slay the Spire 2 Card - ${card.name} - ${card.rarity} ${card.type} | Spire Codex`;
    const descFlat = stripTagsFlat(card.description || "");
    const keywords = card.keywords?.length ? ` ${card.keywords.join(". ")}.` : "";
    const metaDesc = `${card.name} is a ${card.cost ?? "X"} cost ${card.rarity} ${card.type} used by ${color}.\n${descFlat}${keywords}`;
    return {
      title,
      description: metaDesc,
      openGraph: {
        title,
        description: metaDesc,
        images: card.image_url ? [{ url: `${API_PUBLIC}${card.image_url}` }] : [],
      },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/cards/${id}` },
    };
  } catch {
    return { title: "Spire Codex - Slay the Spire 2 Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let card = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/cards/${id}`);
    if (res.ok) {
      card = await res.json();
      const desc = stripTags(card.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: card.name,
        description: desc || `${card.name} card from Slay the Spire 2`,
        path: `/cards/${id}`,
        imageUrl: card.image_url ? `${API_PUBLIC}${card.image_url}` : undefined,
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
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <CardDetail initialCard={card} />
    </>
  );
}
