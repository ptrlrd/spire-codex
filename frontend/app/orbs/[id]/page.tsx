import type { Metadata } from "next";
import OrbDetail from "./OrbDetail";
import { stripTags } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/orbs/${id}`);
    if (!res.ok) return { title: "Orb Not Found - Spire Codex" };
    const orb = await res.json();
    const desc = stripTags(orb.description || "");
    const title = `Slay the Spire 2 Orb - ${orb.name} | Spire Codex`;
    const metaDesc = `${orb.name} is an orb in Slay the Spire 2: ${desc}`;
    return {
      title,
      description: metaDesc,
      openGraph: {
        title,
        description: metaDesc,
      },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/orbs/${id}` },
    };
  } catch {
    return { title: "Spire Codex - Slay the Spire 2 Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let orb = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/orbs/${id}`);
    if (res.ok) {
      orb = await res.json();
      const desc = stripTags(orb.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: orb.name,
        description: desc || `${orb.name} orb from Slay the Spire 2`,
        path: `/orbs/${id}`,
        category: "Orb",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Reference", href: "/reference" },
          { name: orb.name, href: `/orbs/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `What does the ${orb.name} orb do in Slay the Spire 2?`, answer: desc || `${orb.name} is an orb in Slay the Spire 2.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <OrbDetail initialOrb={orb} />
    </>
  );
}
