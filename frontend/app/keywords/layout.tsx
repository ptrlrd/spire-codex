import type { Metadata } from "next";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

const title = "Keywords - All Card Keywords - Slay the Spire 2 (sts2) | Spire Codex";
const ogDesc =
  "Browse all card keywords in Slay the Spire 2 (sts2) — Exhaust, Ethereal, Innate, Retain, Sly, Eternal, and more.";

export const metadata: Metadata = {
  title,
  description:
    "Browse all card keywords in Slay the Spire 2 (sts2) — Exhaust, Ethereal, Innate, Retain, Sly, Eternal, and more. See every card with each keyword.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/keywords`,
    title,
    description: ogDesc,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description: ogDesc },
  alternates: { canonical: "/keywords", languages: buildLanguageAlternates("/keywords") },
};

export default function KeywordsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
