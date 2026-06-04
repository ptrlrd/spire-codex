import type { Metadata } from "next";
import TierListHome from "./TierListHome";

export const metadata: Metadata = {
  title: "Tier List Maker | Spire Codex",
  description:
    "Build and share Slay the Spire 2 tier lists. Drag and drop cards, relics, potions, and monsters into custom tiers.",
};

export default function Page() {
  return <TierListHome />;
}
