import type { Metadata } from "next";
import IntentDetail from "./IntentDetail";
import { stripTags } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/intents/${id}`);
    if (!res.ok) return { title: "Intent Not Found - Spire Codex" };
    const intent = await res.json();
    const desc = stripTags(intent.description || "");
    const title = `Slay the Spire 2 Intent - ${intent.name} | Spire Codex`;
    const metaDesc = `${intent.name} is a monster intent in Slay the Spire 2: ${desc}`;
    return {
      title,
      description: metaDesc,
      openGraph: {
        title,
        description: metaDesc,
      },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/intents/${id}` },
    };
  } catch {
    return { title: "Spire Codex - Slay the Spire 2 Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let intent = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/intents/${id}`);
    if (res.ok) {
      intent = await res.json();
      const desc = stripTags(intent.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: intent.name,
        description: desc || `${intent.name} intent from Slay the Spire 2`,
        path: `/intents/${id}`,
        category: "Intent",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Reference", href: "/reference" },
          { name: intent.name, href: `/intents/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `What does the ${intent.name} intent mean in Slay the Spire 2?`, answer: desc || `${intent.name} is a monster intent in Slay the Spire 2.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <IntentDetail initialIntent={intent} />
    </>
  );
}
