import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

const title = "Overwolf Overlay - Slay the Spire 2 (sts2) | Spire Codex";
const ogDesc = "In-game overlay for Slay the Spire 2. Card lookups, relic info, and one-click run uploads.";

export const metadata: Metadata = {
  title,
  description:
    "Spire Codex Overlay — the Overwolf companion for Slay the Spire 2 (sts2). In-game card, relic, and monster lookups plus one-click run uploads.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/overlay`,
    title,
    description: ogDesc,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description: ogDesc },
  alternates: {
    canonical: "/overlay",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
