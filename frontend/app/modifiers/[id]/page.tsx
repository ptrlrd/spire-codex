import type { Metadata } from "next";
import ModifierDetail from "./ModifierDetail";
import { stripTags } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/modifiers/${id}`);
    if (!res.ok) return { title: "Modifier Not Found - Spire Codex" };
    const modifier = await res.json();
    const desc = stripTags(modifier.description || "");
    const title = `Slay the Spire 2 Modifier - ${modifier.name} | Spire Codex`;
    const metaDesc = `${modifier.name} is a run modifier in Slay the Spire 2: ${desc}`;
    return {
      title,
      description: metaDesc,
      openGraph: {
        title,
        description: metaDesc,
      },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/modifiers/${id}` },
    };
  } catch {
    return { title: "Spire Codex - Slay the Spire 2 Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let modifier = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/modifiers/${id}`);
    if (res.ok) {
      modifier = await res.json();
      const desc = stripTags(modifier.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: modifier.name,
        description: desc || `${modifier.name} modifier from Slay the Spire 2`,
        path: `/modifiers/${id}`,
        category: "Modifier",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Reference", href: "/reference" },
          { name: modifier.name, href: `/modifiers/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `What does the ${modifier.name} modifier do in Slay the Spire 2?`, answer: desc || `${modifier.name} is a run modifier in Slay the Spire 2.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <ModifierDetail initialModifier={modifier} />
    </>
  );
}
