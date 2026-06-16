import fs from "fs";
import path from "path";
import { notFound } from "next/navigation";
import CardRender from "@/app/components/CardRender";
import type { Card } from "@/lib/api";

/**
 * Bake-only render surface. tools/bake_mod_cards.py points headless Chrome at
 * this route to screenshot each modded card into a full card image for the CDN
 * (the game engine bakes base/beta cards; mods have no engine, so CardRender is
 * the renderer). Gated behind ENABLE_MOD_RENDER so it never serves in prod.
 *
 * The card sits at the top-left of an opaque magenta overlay sized to the
 * viewport; the bake sizes the window to the card and keys the magenta out to
 * transparency, so the site chrome can never bleed into the shot.
 */
export const dynamic = "force-dynamic";

export default async function ModRenderPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string; id: string }>;
  searchParams: Promise<{ lang?: string; upg?: string; w?: string }>;
}) {
  if (!process.env.ENABLE_MOD_RENDER) notFound();
  const { key, id } = await params;
  const sp = await searchParams;
  const lang = sp.lang || "eng";
  const upgraded = sp.upg === "1";
  const width = Number(sp.w) || 600;

  const file = path.join(process.cwd(), "..", "data-mod", key, lang, "cards.json");
  let cards: Card[] = [];
  try {
    cards = JSON.parse(fs.readFileSync(file, "utf-8")) as Card[];
  } catch {
    notFound();
  }
  const card = cards.find((c) => c.id === decodeURIComponent(id));
  if (!card) notFound();

  return (
    <div
      id="mod-render-root"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        background: "#ff00ff",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-start",
      }}
    >
      <CardRender card={card} width={width} upgraded={upgraded} />
    </div>
  );
}
