import type { Metadata } from "next";
import { buildLanguageAlternates } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Slay the Spire 2 (STS2) Keywords - All Card Keywords | Spire Codex",
  description:
    "Browse all card keywords in Slay the Spire 2 (STS2) — Exhaust, Ethereal, Innate, Retain, Sly, Eternal, and more. See every card with each keyword.",
  openGraph: {
    title: "Slay the Spire 2 (STS2) Keywords - All Card Keywords | Spire Codex",
    description:
      "Browse all card keywords in Slay the Spire 2 (STS2) — Exhaust, Ethereal, Innate, Retain, Sly, Eternal, and more.",
  },
  alternates: { canonical: "/keywords", languages: buildLanguageAlternates("/keywords") },
};

export default function KeywordsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
