import type { Metadata } from "next";
import { buildLanguageAlternates } from "@/lib/seo";
import UnlocksClient from "./UnlocksClient";

export const metadata: Metadata = {
  title: "Slay the Spire 2 (STS2) Unlocks - All Unlockable Cards, Relics & Potions | Spire Codex",
  description:
    "Complete list of all unlockable content in Slay the Spire 2 — 60 cards, 45 relics, 21 potions, and 4 characters unlocked through timeline progression.",
  alternates: { canonical: "/unlocks", languages: buildLanguageAlternates("/unlocks") },
};

export default function Page() {
  return <UnlocksClient />;
}
