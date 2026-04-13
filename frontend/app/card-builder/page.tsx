import type { Metadata } from "next";
import CardBuilderClient from "./CardBuilderClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Slay the Spire 2 Card Builder - Create Custom Cards | Spire Codex",
  description:
    "Design custom Slay the Spire 2 cards and export C# code compatible with Alchyr's ModTemplate-StS2. Set cost, type, rarity, damage, block, powers, keywords, and upgrade logic.",
};

export default function CardBuilderPage() {
  return <CardBuilderClient />;
}
