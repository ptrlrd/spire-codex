import type { Metadata } from "next";
import KeywordDetail from "@/app/keywords/[id]/KeywordDetail";

/** Beta-channel keyword/glossary detail. See beta/cards/[id]/page.tsx for
 * why this is a real route instead of a middleware rewrite of the stable
 * page. Noindexed via the /beta X-Robots-Tag header. */

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ id: string }> };

async function fetchBetaKeywordOrGlossary(id: string) {
  try {
    const res = await fetch(`${API_INTERNAL}/api/keywords/${id}?channel=beta`);
    if (res.ok) return { type: "keyword" as const, data: await res.json() };
  } catch {}
  try {
    const res = await fetch(`${API_INTERNAL}/api/glossary/${id}?channel=beta`);
    if (res.ok) return { type: "glossary" as const, data: await res.json() };
  } catch {}
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const result = await fetchBetaKeywordOrGlossary(id);
  if (!result) return { title: "Term Not Found - Beta | Spire Codex" };
  return { title: `${result.data.name} (Beta) - Slay the Spire 2 Keyword | Spire Codex` };
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  const result = await fetchBetaKeywordOrGlossary(id);
  return <KeywordDetail initialResult={result ?? undefined} />;
}
