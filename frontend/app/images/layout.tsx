import type { Metadata } from "next";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";

const title = "Images - Game Art & Assets - Slay the Spire 2 (sts2) | Spire Codex";
const ogDesc =
  "Browse and download Slay the Spire 2 game assets — card portraits, relic icons, monster sprites, and more.";

export const metadata: Metadata = {
  title,
  description:
    "Browse and download Slay the Spire 2 game assets — card portraits, relic icons, monster sprites, character art, and more.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/images`,
    title,
    description: ogDesc,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description: ogDesc },
  alternates: { canonical: "/images", languages: buildLanguageAlternates("/images") },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Images", href: "/images" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Images & Game Art",
      description:
        "Browse and download Slay the Spire 2 game assets — card portraits, relic icons, monster sprites, character art, and more.",
      path: "/images",
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      {children}
    </>
  );
}
