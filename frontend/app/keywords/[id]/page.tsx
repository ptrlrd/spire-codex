import type { Metadata } from "next";
import KeywordDetail from "./KeywordDetail";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { stripTags, stripTagsFlat, clipMetaDescription, buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

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
  if (!result) return { title: "Term Not Found - Slay the Spire 2 (sts2) | Spire Codex" };

  const { type, data } = result;
  const desc = stripTagsFlat(data.description);

  if (type === "keyword") {
    const title = `Keyword - ${data.name} - Slay the Spire 2 (sts2) | Spire Codex`;
    const metaDesc = clipMetaDescription(
      `Slay the Spire 2 card keyword — ${data.name}${desc ? `: ${desc}` : ""} See every card that uses ${data.name}.`,
    );
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        siteName: SITE_NAME,
        url: `${SITE_URL}/keywords/${id}`,
        title,
        description: metaDesc,
        images: [{ url: DEFAULT_OG_IMAGE }],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: `/keywords/${id}`, languages: buildLanguageAlternates(`/keywords/${id}`) },
    };
  }

  const title = `Term - ${data.name} - Slay the Spire 2 (sts2) | Spire Codex`;
  const metaDesc = clipMetaDescription(
    `Slay the Spire 2 game term — ${data.name}${desc ? `: ${desc}` : ""}`,
  );
  return {
    title,
    description: metaDesc,
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      url: `${SITE_URL}/keywords/${id}`,
      title,
      description: metaDesc,
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description: metaDesc },
    alternates: { canonical: `/keywords/${id}`, languages: buildLanguageAlternates(`/keywords/${id}`) },
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
