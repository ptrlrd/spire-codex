import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Characters - All Playable Characters - Slay the Spire 2 (sts2) | Spire Codex",
  description:
    "Slay the Spire 2 characters — Ironclad, Silent, Defect, Necrobinder, and Regent. View starting decks, relics, HP, gold, energy stats, and NPC dialogues for every character.",
  openGraph: {
    title: "Characters - All Playable Characters - Slay the Spire 2 (sts2) | Spire Codex",
    description:
      "Slay the Spire 2 characters — Ironclad, Silent, Defect, Necrobinder, and Regent. Starting decks, relics, stats, and more.",
  },
  alternates: {
    canonical: "/characters",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
