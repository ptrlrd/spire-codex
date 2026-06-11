import type { Metadata } from "next";
import EncounterDetail from "@/app/encounters/[id]/EncounterDetail";

/** Beta-channel encounter detail. See beta/cards/[id]/page.tsx for why this
 * is a real route instead of a middleware rewrite of the ISR-cached stable
 * page. Noindexed via the /beta X-Robots-Tag header. */

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ id: string }> };

async function fetchBeta(id: string) {
  const res = await fetch(`${API_INTERNAL}/api/encounters/${id}?channel=beta`);
  if (!res.ok) return null;
  return res.json();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const item = await fetchBeta(id);
    if (!item) return { title: "Encounter Not Found - Beta | Spire Codex" };
    return { title: `${item.name} (Beta) - Slay the Spire 2 Encounter | Spire Codex` };
  } catch {
    return { title: "Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let item = null;
  try {
    item = await fetchBeta(id);
  } catch {
    // EncounterDetail refetches client-side (with channel=beta via the /beta
    // path) and renders its own not-found state.
  }
  return <EncounterDetail initialEncounter={item} />;
}
