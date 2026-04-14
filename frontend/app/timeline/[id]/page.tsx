import type { Metadata } from "next";
import EpochDetail from "./EpochDetail";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { stripTags } from "@/lib/seo";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/epochs/${id}`);
    if (!res.ok) return { title: "Epoch Not Found - Spire Codex" };
    const epoch = await res.json();
    const desc = stripTags(epoch.description || "");
    const title = `Slay the Spire 2 Timeline - ${epoch.title} | Spire Codex`;
    const metaDesc = `${epoch.title} is a timeline epoch in Slay the Spire 2: ${desc.slice(0, 150)}`;
    return {
      title,
      description: metaDesc,
      openGraph: {
        title,
        description: metaDesc,
      },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/timeline/${id}` },
    };
  } catch {
    return { title: "Spire Codex - Slay the Spire 2 Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let epoch = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/epochs/${id}`);
    if (res.ok) {
      epoch = await res.json();
      const desc = stripTags(epoch.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: epoch.title,
        description: `${desc.slice(0, 150)} Timeline epoch in Slay the Spire 2.`,
        path: `/timeline/${id}`,
        category: "Timeline",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Timeline", href: "/timeline" },
          { name: epoch.title, href: `/timeline/${id}` },
        ],
      });
      const faqJsonLd = buildFAQPageJsonLd([
        { question: `What happens in the ${epoch.title} epoch in Slay the Spire 2?`, answer: desc || `Explore the ${epoch.title} epoch.` },
      ]);
      jsonLd = [...detailJsonLd, faqJsonLd];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <EpochDetail initialEpoch={epoch} />
    </>
  );
}
