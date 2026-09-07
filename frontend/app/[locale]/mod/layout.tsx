import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

const title = "Steam Workshop Mod - Slay the Spire 2 (sts2) | Spire Codex";
const ogDesc = "The official Spire Codex mod for Slay the Spire 2. Automatic run uploads, in-game community insights, and a route planner.";

export const metadata: Metadata = {
  title,
  description:
    "The Spire Codex mod for Slay the Spire 2 (sts2), installed from the Steam Workshop. Automatic run uploads, post-run community insights in game, ancient pick tips, and a route planner.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/mod`,
    title,
    description: ogDesc,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description: ogDesc },
  alternates: {
    canonical: "/mod",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
