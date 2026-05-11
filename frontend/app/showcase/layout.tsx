import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Community Showcase - Projects & Tools - Slay the Spire 2 (sts2) | Spire Codex",
  description:
    "Discover community projects and tools built with the Spire Codex API. Explore bots, widgets, apps, and more for Slay the Spire 2.",
  openGraph: {
    title: "Community Showcase - Projects & Tools - Slay the Spire 2 (sts2) | Spire Codex",
    description:
      "Discover community projects and tools built with the Spire Codex API.",
  },
  alternates: {
    canonical: "/showcase",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
