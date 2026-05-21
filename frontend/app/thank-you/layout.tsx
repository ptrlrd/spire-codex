import type { Metadata } from "next";
import { SITE_NAME, SITE_URL, DEFAULT_OG_IMAGE } from "@/lib/seo";

const title = "Thank You - Slay the Spire 2 (sts2) | Spire Codex";
const description =
  "Thanks to the Spire Codex community — Ko-fi supporters, contributors, bug reporters, and everyone who's helped grow this Slay the Spire 2 project.";
const ogDesc = "Thank you to the Spire Codex community of supporters and contributors.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/thank-you`,
    title,
    description: ogDesc,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description: ogDesc },
  alternates: {
    canonical: "/thank-you",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
