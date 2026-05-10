import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Slay the Spire 2 (STS2) Images - Game Art & Assets | Spire Codex",
  description:
    "Browse and download Slay the Spire 2 game assets — card portraits, relic icons, monster sprites, character art, and more.",
  openGraph: {
    title: "Slay the Spire 2 (STS2) Images - Game Art & Assets | Spire Codex",
    description:
      "Browse and download Slay the Spire 2 game assets — card portraits, relic icons, monster sprites, and more.",
  },
  alternates: {
    canonical: "/images",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
