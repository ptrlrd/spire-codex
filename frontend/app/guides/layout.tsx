import type { Metadata } from "next";
import { buildLanguageAlternates } from "@/lib/seo";
import { SITE_URL, SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: `Guides - Strategy & Tips - Slay the Spire 2 (sts2) | ${SITE_NAME}`,
  description:
    "Community strategy guides for Slay the Spire 2. Character guides, boss strategies, deck building tips, and more from experienced players.",
  alternates: { canonical: `${SITE_URL}/guides` },
  openGraph: {
    title: `Guides - Strategy & Tips - Slay the Spire 2 (sts2) | ${SITE_NAME}`,
    description:
      "Community strategy guides for Slay the Spire 2. Character guides, boss strategies, deck building tips, and more.",
    url: `${SITE_URL}/guides`,
    siteName: SITE_NAME,
    type: "website",
  },
};

export default function GuidesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
