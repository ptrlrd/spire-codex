import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

const title =
  "Slay the Spire 2 Reference - Keywords, Orbs, Afflictions & More | Spire Codex";
const ogDesc =
  "Slay the Spire 2 reference guide covering keywords, orbs, afflictions, intents, modifiers, achievements, and more.";

export const metadata: Metadata = {
  title,
  description:
    "Slay the Spire 2 reference guide covering keywords, orbs, afflictions, intents, modifiers, achievements, acts, and ascension levels all in one place.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/reference`,
    title,
    description: ogDesc,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description: ogDesc },
  alternates: {
    canonical: "/reference",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
