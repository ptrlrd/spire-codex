import type { Metadata } from "next";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

const title = "Submit a Guide - Slay the Spire 2 (sts2) | Spire Codex";
const ogDesc =
  "Submit a community strategy guide for Slay the Spire 2. Share tips, character breakdowns, boss strategies, or deck-building advice with the Spire Codex community.";

export const metadata: Metadata = {
  title,
  description:
    "Submit a community strategy guide for Slay the Spire 2 (sts2). Share character guides, boss strategies, and deck-building tips with the Spire Codex community.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/guides/submit`,
    title,
    description: ogDesc,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description: ogDesc },
  alternates: { canonical: "/guides/submit", languages: buildLanguageAlternates("/guides/submit") },
};

export default function GuideSubmitLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
