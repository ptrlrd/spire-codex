import type { Metadata } from "next";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

const title = `Guides - Strategy & Tips - Slay the Spire 2 (sts2) | ${SITE_NAME}`;
const ogDesc =
  "Community strategy guides for Slay the Spire 2. Character guides, boss strategies, deck building tips, and more.";

export const metadata: Metadata = {
  title,
  description:
    "Community strategy guides for Slay the Spire 2. Character guides, boss strategies, deck building tips, and more from experienced players.",
  alternates: { canonical: `${SITE_URL}/guides`, languages: buildLanguageAlternates("/guides") },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/guides`,
    title,
    description: ogDesc,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description: ogDesc },
};

export default function GuidesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
