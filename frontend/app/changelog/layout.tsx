import type { Metadata } from "next";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";

const title = "Changelog - Update History - Slay the Spire 2 (sts2) | Spire Codex";
const ogDesc =
  "Slay the Spire 2 update history and Spire Codex changelog. Track patches, balance changes, and new content.";

export const metadata: Metadata = {
  title,
  description:
    "Slay the Spire 2 update history and Spire Codex changelog. Track game patches, balance changes, and new content additions.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/changelog`,
    title,
    description: ogDesc,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description: ogDesc },
  alternates: { canonical: "/changelog", languages: buildLanguageAlternates("/changelog") },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  // Client-rendered changelog page — emit JSON-LD from the server
  // layout so the structured data appears in initial HTML for crawlers.
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Changelog", href: "/changelog" },
    ]),
    buildCollectionPageJsonLd({
      name: "Spire Codex Changelog",
      description:
        "Slay the Spire 2 update history and Spire Codex changelog — patches, balance changes, and new content additions.",
      path: "/changelog",
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      {children}
    </>
  );
}
