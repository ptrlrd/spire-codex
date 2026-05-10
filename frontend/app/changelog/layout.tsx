import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Slay the Spire 2 (STS2) Changelog - Update History | Spire Codex",
  description:
    "Slay the Spire 2 update history and Spire Codex changelog. Track game patches, balance changes, and new content additions.",
  openGraph: {
    title: "Slay the Spire 2 (STS2) Changelog - Update History | Spire Codex",
    description:
      "Slay the Spire 2 update history and Spire Codex changelog. Track patches, balance changes, and new content.",
  },
  alternates: {
    canonical: "/changelog",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
