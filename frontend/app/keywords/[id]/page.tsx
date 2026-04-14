import type { Metadata } from "next";
import KeywordDetail from "./KeywordDetail";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { stripTags } from "@/lib/seo";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ id: string }> };

async function fetchKeywordOrGlossary(id: string) {
  // Try keyword first
  try {
    const res = await fetch(`${API_INTERNAL}/api/keywords/${id}`);
    if (res.ok) return { type: "keyword" as const, data: await res.json() };
  } catch {}
  // Fall back to glossary
  try {
    const res = await fetch(`${API_INTERNAL}/api/glossary/${id}`);
    if (res.ok) return { type: "glossary" as const, data: await res.json() };
  } catch {}
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const result = await fetchKeywordOrGlossary(id);
  if (!result) return { title: "Term Not Found - Spire Codex" };

  const { type, data } = result;
  const desc = stripTags(data.description);

  if (type === "keyword") {
    const title = `Slay the Spire 2 Keyword - ${data.name} | Spire Codex`;
    const metaDesc = `${data.name} is a card keyword in Slay the Spire 2: ${desc}`;
    return {
      title,
      description: metaDesc,
      openGraph: {
        title,
        description: metaDesc,
      },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/keywords/${id}` },
    };
  }

  const title = `Slay the Spire 2 Term - ${data.name} | Spire Codex`;
  const metaDesc = `${data.name} is a game term in Slay the Spire 2: ${desc}`;
  return {
    title,
    description: metaDesc,
    openGraph: {
      title,
      description: metaDesc,
    },
    twitter: { card: "summary_large_image" },
    alternates: { canonical: `/keywords/${id}` },
  };
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  const result = await fetchKeywordOrGlossary(id);

  let jsonLd = null;
  if (result) {
    const { type, data } = result;
    const desc = stripTags(data.description);

    if (type === "keyword") {
      const detailJsonLd = buildDetailPageJsonLd({
        name: `${data.name} Cards`,
        description: `${desc} All cards with the ${data.name} keyword in Slay the Spire 2.`,
        path: `/keywords/${id}`,
        category: "Keyword",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Keywords", href: "/keywords" },
          { name: data.name, href: `/keywords/${id}` },
        ],
      });
      const faqJsonLd = buildFAQPageJsonLd([
        { question: `What does ${data.name} do in Slay the Spire 2?`, answer: desc },
        { question: `Which cards have ${data.name}?`, answer: `View the full list of ${data.name} cards on this page.` },
      ]);
      jsonLd = [...detailJsonLd, faqJsonLd];
    } else {
      const detailJsonLd = buildDetailPageJsonLd({
        name: data.name,
        description: `${desc} Game term definition for Slay the Spire 2.`,
        path: `/keywords/${id}`,
        category: "Game Term",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Keywords & Game Terms", href: "/keywords" },
          { name: data.name, href: `/keywords/${id}` },
        ],
      });
      const faqJsonLd = buildFAQPageJsonLd([
        { question: `What does ${data.name} mean in Slay the Spire 2?`, answer: desc },
      ]);
      jsonLd = [...detailJsonLd, faqJsonLd];
    }
  }

  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <KeywordDetail initialResult={result} />
    </>
  );
}
