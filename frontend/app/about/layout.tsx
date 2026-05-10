import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Slay the Spire 2 (STS2) Database - About | Spire Codex",
  description:
    "About Spire Codex — a community-built database for Slay the Spire 2. Learn about the data pipeline, tech stack, and how the site works.",
  openGraph: {
    title: "Slay the Spire 2 (STS2) Database - About | Spire Codex",
    description:
      "About Spire Codex — a community-built database for Slay the Spire 2.",
  },
  alternates: {
    canonical: "/about",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
