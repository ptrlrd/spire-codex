import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Changelog - Update History - Slay the Spire 2 (sts2) | Spire Codex",
  description:
    "Slay the Spire 2 update history and Spire Codex changelog. Track game patches, balance changes, and new content additions.",
  openGraph: {
    title: "Changelog - Update History - Slay the Spire 2 (sts2) | Spire Codex",
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
