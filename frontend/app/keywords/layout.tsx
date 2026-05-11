import type { Metadata } from "next";
import { buildLanguageAlternates } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Keywords - All Card Keywords - Slay the Spire 2 (sts2) | Spire Codex",
  description:
    "Browse all card keywords in Slay the Spire 2 (sts2) — Exhaust, Ethereal, Innate, Retain, Sly, Eternal, and more. See every card with each keyword.",
  openGraph: {
    title: "Keywords - All Card Keywords - Slay the Spire 2 (sts2) | Spire Codex",
    description:
      "Browse all card keywords in Slay the Spire 2 (sts2) — Exhaust, Ethereal, Innate, Retain, Sly, Eternal, and more.",
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
