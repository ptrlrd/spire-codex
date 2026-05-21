import type { Metadata } from "next";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";

const title = "Database - About - Slay the Spire 2 (sts2) | Spire Codex";
const ogDesc = "About Spire Codex — a community-built database for Slay the Spire 2.";

export const metadata: Metadata = {
  title,
  description:
    "About Spire Codex — a community-built database for Slay the Spire 2. Learn about the data pipeline, tech stack, and how the site works.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/about`,
    title,
    description: ogDesc,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description: ogDesc },
  alternates: { canonical: "/about", languages: buildLanguageAlternates("/about") },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  // /about is a `"use client"` page so JSON-LD has to land in the
  // server layout. We model it as an Article describing the site
  // itself — gives Google the breadcrumb + headline pair it needs to
  // index this page properly.
  const jsonLd = buildDetailPageJsonLd({
    name: "About Spire Codex",
    description:
      "About Spire Codex — a community-built database for Slay the Spire 2. The data pipeline, tech stack, and credits behind the site.",
    path: "/about",
    category: "Site",
    breadcrumbs: [
      { name: "Home", href: "/" },
      { name: "About", href: "/about" },
    ],
  });
  return (
    <>
      <JsonLd data={jsonLd} />
      {children}
    </>
  );
}
