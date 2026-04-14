import type { Metadata } from "next";
import PotionDetail from "./PotionDetail";
import { stripTags } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/potions/${id}`);
    if (!res.ok) return { title: "Potion Not Found - Spire Codex" };
    const potion = await res.json();
    const desc = stripTags(potion.description || "");
    const title = `Slay the Spire 2 Potion - ${potion.name} - ${potion.rarity} | Spire Codex`;
    const metaDesc = `${potion.name} is a ${potion.rarity} potion in Slay the Spire 2: ${desc}`;
    return {
      title,
      description: metaDesc,
      openGraph: {
        title,
        description: metaDesc,
        images: potion.image_url ? [{ url: `${API_PUBLIC}${potion.image_url}` }] : [],
      },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/potions/${id}` },
    };
  } catch {
    return { title: "Spire Codex - Slay the Spire 2 Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let potion = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/potions/${id}`);
    if (res.ok) {
      potion = await res.json();
      const desc = stripTags(potion.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: potion.name,
        description: desc || `${potion.name} potion from Slay the Spire 2`,
        path: `/potions/${id}`,
        imageUrl: potion.image_url ? `${API_PUBLIC}${potion.image_url}` : undefined,
        category: "Potion",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Potions", href: "/potions" },
          { name: potion.name, href: `/potions/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `What does ${potion.name} do in Slay the Spire 2?`, answer: desc || `${potion.name} is a potion in Slay the Spire 2.` },
        { question: `How rare is ${potion.name}?`, answer: `${potion.name} is a ${potion.rarity} potion.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <PotionDetail initialPotion={potion} />
    </>
  );
}
