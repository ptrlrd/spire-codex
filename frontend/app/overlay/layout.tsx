import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Overwolf Overlay - Slay the Spire 2 (sts2) | Spire Codex",
  description:
    "Spire Codex Overlay — the official Overwolf companion app for Slay the Spire 2. In-game card, relic, and monster lookups plus one-click run uploads to the community leaderboards.",
  openGraph: {
    title: "Overwolf Overlay - Slay the Spire 2 (sts2) | Spire Codex",
    description:
      "In-game overlay for Slay the Spire 2. Card lookups, relic info, and one-click run uploads.",
  },
  alternates: {
    canonical: "/overlay",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
