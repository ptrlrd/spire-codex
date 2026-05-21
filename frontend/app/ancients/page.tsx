import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import AncientsClient from "./AncientsClient";

export const revalidate = 3600;

const title = "Ancient Relic Pools - All Ancient Offerings - Slay the Spire 2 (sts2) | Spire Codex";
const description =
  "Relic pools for all 8 Slay the Spire 2 (sts2) Ancients — Neow, Tezcatara, Pael, Orobas, Darv, Nonupeipe, Tanx, Vakuu. Every offering and condition.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/ancients`,
    title,
    description,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description },
};

export default function AncientsPage() {
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Ancients", href: "/ancients" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Ancient Relic Pools",
      description:
        "Relic pools for all 8 Slay the Spire 2 Ancients — every offering and the conditions required to receive it.",
      path: "/ancients",
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <AncientsClient />
    </>
  );
}
