import type { Metadata } from "next";
import RelicDetail from "./RelicDetail";
import { stripTags } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/relics/${id}`);
    if (!res.ok) return { title: "Relic Not Found - Spire Codex" };
    const relic = await res.json();
    const desc = stripTags(relic.description || "");
    const title = `Slay the Spire 2 Relic - ${relic.name} - ${relic.rarity} | Spire Codex`;
    const metaDesc = `${relic.name} is a ${relic.rarity} relic in Slay the Spire 2: ${desc}`;
    return {
      title,
      description: metaDesc,
      openGraph: {
        title,
        description: metaDesc,
        images: relic.image_url ? [{ url: `${API_PUBLIC}${relic.image_url}` }] : [],
      },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/relics/${id}` },
    };
  } catch {
    return { title: "Spire Codex - Slay the Spire 2 Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let relic = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/relics/${id}`);
    if (res.ok) {
      relic = await res.json();
      const desc = stripTags(relic.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: relic.name,
        description: desc || `${relic.name} relic from Slay the Spire 2`,
        path: `/relics/${id}`,
        imageUrl: relic.image_url ? `${API_PUBLIC}${relic.image_url}` : undefined,
        category: "Relic",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Relics", href: "/relics" },
          { name: relic.name, href: `/relics/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `What does ${relic.name} do in Slay the Spire 2?`, answer: desc || `${relic.name} is a relic in Slay the Spire 2.` },
        { question: `How rare is ${relic.name}?`, answer: `${relic.name} is a ${relic.rarity} relic.` },
        { question: `Which characters can find ${relic.name}?`, answer: `${relic.name} belongs to the ${relic.pool} pool.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <RelicDetail initialRelic={relic} />
    </>
  );
}
