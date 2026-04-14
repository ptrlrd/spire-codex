import type { Metadata } from "next";
import EnchantmentDetail from "./EnchantmentDetail";
import { stripTags } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/enchantments/${id}`);
    if (!res.ok) return { title: "Enchantment Not Found - Spire Codex" };
    const enchantment = await res.json();
    const desc = stripTags(enchantment.description || "");
    const title = `Slay the Spire 2 Enchantment - ${enchantment.name} | Spire Codex`;
    const metaDesc = `${enchantment.name} is an enchantment in Slay the Spire 2: ${desc}`;
    return {
      title,
      description: metaDesc,
      openGraph: {
        title,
        description: metaDesc,
        images: enchantment.image_url ? [{ url: `${API_PUBLIC}${enchantment.image_url}` }] : [],
      },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/enchantments/${id}` },
    };
  } catch {
    return { title: "Spire Codex - Slay the Spire 2 Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let enchantment = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/enchantments/${id}`);
    if (res.ok) {
      enchantment = await res.json();
      const desc = stripTags(enchantment.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: enchantment.name,
        description: desc || `${enchantment.name} enchantment from Slay the Spire 2`,
        path: `/enchantments/${id}`,
        imageUrl: enchantment.image_url ? `${API_PUBLIC}${enchantment.image_url}` : undefined,
        category: "Enchantment",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Enchantments", href: "/enchantments" },
          { name: enchantment.name, href: `/enchantments/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `What does ${enchantment.name} do in Slay the Spire 2?`, answer: desc || `${enchantment.name} is an enchantment in Slay the Spire 2.` },
        { question: `What card type is ${enchantment.name} for?`, answer: enchantment.applicable_to ? `${enchantment.name} can be applied to ${enchantment.applicable_to}.` : enchantment.card_type ? `${enchantment.name} can be applied to ${enchantment.card_type} cards.` : `${enchantment.name} can be applied to any card type.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <EnchantmentDetail initialEnchantment={enchantment} />
    </>
  );
}
