import type { Metadata } from "next";
import KeywordDetail from "./KeywordDetail";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { stripTags } from "@/lib/seo";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/keywords/${id}`);
    if (!res.ok) return { title: "Keyword Not Found - Spire Codex" };
    const kw = await res.json();
    const desc = stripTags(kw.description);
    const title = `${kw.name} Cards - Spire Codex - Slay the Spire 2 Database`;
    return {
      title,
      description: `${desc} Browse all ${kw.name} cards in Slay the Spire 2.`,
      openGraph: {
        title: `${kw.name} Cards - Spire Codex - Slay the Spire 2`,
        description: `${desc} Browse all ${kw.name} cards in Slay the Spire 2.`,
      },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/keywords/${id}` },
    };
  } catch {
    return { title: "Spire Codex - Slay the Spire 2 Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/keywords/${id}`);
    if (res.ok) {
      const kw = await res.json();
      const desc = stripTags(kw.description);
      const detailJsonLd = buildDetailPageJsonLd({
        name: `${kw.name} Cards`,
        description: `${desc} All cards with the ${kw.name} keyword in Slay the Spire 2.`,
        path: `/keywords/${id}`,
        category: "Keyword",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Keywords", href: "/keywords" },
          { name: kw.name, href: `/keywords/${id}` },
        ],
      });
      const faqJsonLd = buildFAQPageJsonLd([
        { question: `What does ${kw.name} do in Slay the Spire 2?`, answer: desc },
        { question: `Which cards have ${kw.name}?`, answer: `View the full list of ${kw.name} cards on this page.` },
      ]);
      jsonLd = [...detailJsonLd, faqJsonLd];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <KeywordDetail />
    </>
  );
}
