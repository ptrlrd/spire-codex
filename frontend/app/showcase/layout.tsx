import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Slay the Spire 2 (STS2) Community Showcase - Projects & Tools | Spire Codex",
  description:
    "Discover community projects and tools built with the Spire Codex API. Explore bots, widgets, apps, and more for Slay the Spire 2.",
  openGraph: {
    title: "Slay the Spire 2 (STS2) Community Showcase - Projects & Tools | Spire Codex",
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
