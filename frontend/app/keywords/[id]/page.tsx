import type { Metadata } from "next";
import KeywordDetail from "./KeywordDetail";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { stripTags } from "@/lib/seo";
import { redirectMissingEntity } from "@/lib/redirect-helpers";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ id: string }> };

// Shape of the keyword/glossary row returned by the API. Mirrors
// the `Keyword`/`GlossaryTerm` interfaces in `KeywordDetail.tsx` —
// the client component is the source of truth, so we type the data
// payload loosely here and let TS narrow on the consumer side.
interface KeywordRow {
  id: string;
  name: string;
  description: string;
}
interface GlossaryRow extends KeywordRow {
  category: string;
}

async function fetchKeywordOrGlossary(
  id: string,
): Promise<
  | { type: "keyword"; data: KeywordRow }
  | { type: "glossary"; data: GlossaryRow }
  | { type: "not-found" }
  | { type: "unreachable" }
> {
  let unreachable = false;
  // Try keyword first
  try {
    const res = await fetch(`${API_INTERNAL}/api/keywords/${id}`);
    if (res.ok) return { type: "keyword", data: await res.json() };
    // Non-2xx (e.g. 404): backend is up but the slug isn't a keyword.
    // Fall through to glossary check.
  } catch {
    unreachable = true;
  }
  // Fall back to glossary
  try {
    const res = await fetch(`${API_INTERNAL}/api/glossary/${id}`);
    if (res.ok) return { type: "glossary", data: await res.json() };
  } catch {
    unreachable = true;
  }
  return unreachable ? { type: "unreachable" } : { type: "not-found" };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const result = await fetchKeywordOrGlossary(id);
  if (result.type === "not-found" || result.type === "unreachable") {
    return { title: "Term Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
  }

  const { type, data } = result;
  const desc = stripTags(data.description);

  if (type === "keyword") {
    const title = `Keyword - ${data.name} - Slay the Spire 2 (sts2) | Spire Codex`;
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

  const title = `Term - ${data.name} - Slay the Spire 2 (sts2) | Spire Codex`;
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

  // Unknown term → 308 back to the keywords hub. Skip the redirect on
  // backend-unreachable so we don't 308-storm the hub on outages —
  // the client-side `KeywordDetail` will retry on mount.
  if (result.type === "not-found") redirectMissingEntity("keywords", id);

  let jsonLd = null;
  if (result.type === "keyword" || result.type === "glossary") {
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

  // Narrow the result to the shape `KeywordDetail` accepts (it doesn't
  // know about our internal "not-found" / "unreachable" tags).
  const initialResult =
    result.type === "keyword" || result.type === "glossary" ? result : null;

  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <KeywordDetail initialResult={initialResult} />
    </>
  );
}
