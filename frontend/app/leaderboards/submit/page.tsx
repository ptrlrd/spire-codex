import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import SubmitRunClient from "./SubmitRunClient";

export const dynamic = "force-dynamic";

const title = "Submit a Run - Slay the Spire 2 | Spire Codex";
const description =
  "Upload your Slay the Spire 2 (sts2) run history. Drop .run files or paste JSON to share with the community and feed deck-choice and win-rate analytics.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/leaderboards/submit`,
    title,
    description,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description },
};

export default function SubmitRunPage() {
  const jsonLd = buildBreadcrumbJsonLd([
    { name: "Home", href: "/" },
    { name: "Leaderboards", href: "/leaderboards" },
    { name: "Submit a Run", href: "/leaderboards/submit" },
  ]);
  return (
    <>
      <JsonLd data={jsonLd} />
      <SubmitRunClient />
    </>
  );
}
