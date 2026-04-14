import type { Metadata } from "next";
import PowerDetail from "./PowerDetail";
import { stripTags } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/powers/${id}`);
    if (!res.ok) return { title: "Power Not Found - Spire Codex" };
    const power = await res.json();
    const desc = stripTags(power.description || "");
    const title = `Slay the Spire 2 Power - ${power.name} - ${power.type} | Spire Codex`;
    const metaDesc = `${power.name} is a ${power.type} power in Slay the Spire 2: ${desc}`;
    return {
      title,
      description: metaDesc,
      openGraph: {
        title,
        description: metaDesc,
        images: power.image_url ? [{ url: `${API_PUBLIC}${power.image_url}` }] : [],
      },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/powers/${id}` },
    };
  } catch {
    return { title: "Spire Codex - Slay the Spire 2 Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let power = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/powers/${id}`);
    if (res.ok) {
      power = await res.json();
      const desc = stripTags(power.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: power.name,
        description: desc || `${power.name} power from Slay the Spire 2`,
        path: `/powers/${id}`,
        imageUrl: power.image_url ? `${API_PUBLIC}${power.image_url}` : undefined,
        category: "Power",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Powers", href: "/powers" },
          { name: power.name, href: `/powers/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `What does ${power.name} do in Slay the Spire 2?`, answer: desc || `${power.name} is a power in Slay the Spire 2.` },
        { question: `Is ${power.name} a buff or debuff?`, answer: `${power.name} is a ${power.type} with ${power.stack_type} stacking.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <PowerDetail initialPower={power} />
    </>
  );
}
