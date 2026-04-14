import type { Metadata } from "next";
import AfflictionDetail from "./AfflictionDetail";
import { stripTags } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/afflictions/${id}`);
    if (!res.ok) return { title: "Affliction Not Found - Spire Codex" };
    const affliction = await res.json();
    const desc = stripTags(affliction.description || "");
    const title = `Slay the Spire 2 Affliction - ${affliction.name} | Spire Codex`;
    const metaDesc = `${affliction.name} is an affliction in Slay the Spire 2: ${desc}`;
    return {
      title,
      description: metaDesc,
      openGraph: {
        title,
        description: metaDesc,
      },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/afflictions/${id}` },
    };
  } catch {
    return { title: "Spire Codex - Slay the Spire 2 Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let affliction = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/afflictions/${id}`);
    if (res.ok) {
      affliction = await res.json();
      const desc = stripTags(affliction.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: affliction.name,
        description: desc || `${affliction.name} affliction from Slay the Spire 2`,
        path: `/afflictions/${id}`,
        category: "Affliction",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Reference", href: "/reference" },
          { name: affliction.name, href: `/afflictions/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `What does ${affliction.name} do in Slay the Spire 2?`, answer: desc || `${affliction.name} is an affliction in Slay the Spire 2.` },
        ...(affliction.is_stackable ? [{ question: `Is ${affliction.name} stackable?`, answer: `Yes, ${affliction.name} is stackable.` }] : []),
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <AfflictionDetail initialAffliction={affliction} />
    </>
  );
}
