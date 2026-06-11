import type { Metadata } from "next";
import RelicDetail from "@/app/relics/[id]/RelicDetail";

/** Beta-channel relic detail. See beta/cards/[id]/page.tsx for why this is
 * a real route instead of a middleware rewrite of the ISR-cached stable
 * page. Noindexed via the /beta X-Robots-Tag header. */

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ id: string }> };

async function fetchBetaRelic(id: string) {
  const res = await fetch(`${API_INTERNAL}/api/relics/${id}?channel=beta`);
  if (!res.ok) return null;
  return res.json();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const relic = await fetchBetaRelic(id);
    if (!relic) return { title: "Relic Not Found - Beta | Spire Codex" };
    return { title: `${relic.name} (Beta) - Slay the Spire 2 Relic | Spire Codex` };
  } catch {
    return { title: "Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let relic = null;
  try {
    relic = await fetchBetaRelic(id);
  } catch {
    // RelicDetail refetches client-side and renders its own not-found state.
  }
  return <RelicDetail initialRelic={relic} />;
}
