import type { Metadata } from "next";
import CardDetail from "@/app/cards/[id]/CardDetail";
import { enchantmentsForCard } from "@/lib/card-enchantments";

/** Beta-channel card detail. A real route (not a middleware rewrite of
 * /cards/[id]) because the stable page is ISR-cached: it must never read
 * per-request state like a channel param, or it loses its cache. This one
 * is per-request by nature, so it can just ask the API for beta data.
 * Noindexed via the /beta X-Robots-Tag header; metadata stays minimal. */

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ id: string }> };

async function fetchBetaCard(id: string) {
  const res = await fetch(`${API_INTERNAL}/api/cards/${id}?channel=beta`);
  if (!res.ok) return null;
  return res.json();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const card = await fetchBetaCard(id);
    if (!card) return { title: "Card Not Found - Beta | Spire Codex" };
    return { title: `${card.name} (Beta) - Slay the Spire 2 Card | Spire Codex` };
  } catch {
    return { title: "Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let card = null;
  try {
    card = await fetchBetaCard(id);
  } catch {
    // CardDetail refetches client-side (with channel=beta via the /beta
    // path) and renders its own not-found state.
  }
  return <CardDetail initialCard={card} initialEnchantments={enchantmentsForCard(id)} />;
}
