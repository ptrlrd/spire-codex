import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Images - Game Art & Assets - Slay the Spire 2 (sts2) | Spire Codex",
  description:
    "Browse and download Slay the Spire 2 game assets — card portraits, relic icons, monster sprites, character art, and more.",
  openGraph: {
    title: "Images - Game Art & Assets - Slay the Spire 2 (sts2) | Spire Codex",
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
