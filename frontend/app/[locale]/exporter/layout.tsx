import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

const title = "Art Exporter - Slay the Spire 2 (sts2) | Spire Codex";
const ogDesc = "The tool that generates every image on Spire Codex, free on the Steam Workshop. Card renders, Spine character art, animations, and full texture dumps.";

export const metadata: Metadata = {
  title,
  description:
    "The Spire Codex Art Exporter for Slay the Spire 2 (sts2), free on the Steam Workshop. It renders card art at every upgrade level, characters and monsters, animations, backgrounds, and full texture dumps straight from the running game.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/exporter`,
    title,
    description: ogDesc,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description: ogDesc },
  alternates: {
    canonical: "/exporter",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
