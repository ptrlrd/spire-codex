import type { Metadata } from "next";
import AscensionDetail from "./AscensionDetail";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { stripTags } from "@/lib/seo";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/ascensions/${id}`);
    if (!res.ok) return { title: "Ascension Not Found - Spire Codex" };
    const asc = await res.json();
    const desc = stripTags(asc.description);
    const title = `Slay the Spire 2 Ascension - Level ${asc.level} - ${asc.name} | Spire Codex`;
    const metaDesc = `Ascension ${asc.level} (${asc.name}) in Slay the Spire 2: ${desc}`;
    return {
      title,
      description: metaDesc,
      openGraph: { title, description: metaDesc },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/ascensions/${id}` },
    };
  } catch {
    return { title: "Spire Codex - Slay the Spire 2 Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let asc = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/ascensions/${id}`);
    if (res.ok) {
      asc = await res.json();
      const desc = stripTags(asc.description);
      const detailJsonLd = buildDetailPageJsonLd({
        name: `Ascension ${asc.level}: ${asc.name}`,
        description: `${desc} Ascension level ${asc.level} in Slay the Spire 2.`,
        path: `/ascensions/${id}`,
        category: "Ascension",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Reference", href: "/reference" },
          { name: `Ascension ${asc.level}`, href: `/ascensions/${id}` },
        ],
      });
      const faqJsonLd = buildFAQPageJsonLd([
        { question: `What does Ascension ${asc.level} do in Slay the Spire 2?`, answer: desc },
      ]);
      jsonLd = [...detailJsonLd, faqJsonLd];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <AscensionDetail initialAscension={asc} />
    </>
  );
}
