import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

const title = "Community Showcase - Projects & Tools - Slay the Spire 2 (sts2) | Spire Codex";
const ogDesc = "Discover community projects and tools built with the Spire Codex API.";

export const metadata: Metadata = {
  title,
  description:
    "Discover community projects and tools built with the Spire Codex API. Explore bots, widgets, apps, and more for Slay the Spire 2.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/showcase`,
    title,
    description: ogDesc,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description: ogDesc },
  alternates: {
    canonical: "/showcase",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
