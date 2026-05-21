import { Suspense } from "react";
import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import LeaderboardBrowseClient from "./LeaderboardBrowseClient";

export const dynamic = "force-dynamic";

const title = "Leaderboards - Slay the Spire 2 (sts2) | Spire Codex";
const description =
  "Browse community-submitted Slay the Spire 2 (sts2) runs. Filter by character, ascension level, and outcome. View leaderboards and detailed run breakdowns.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/leaderboards`,
    title,
    description,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description, images: [DEFAULT_OG_IMAGE] },
  alternates: { canonical: `${SITE_URL}/leaderboards`, languages: buildLanguageAlternates("/leaderboards") },
};

export default function ToolsPage() {
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Leaderboards", href: "/leaderboards" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Leaderboards",
      description:
        "Community-submitted runs across every character and ascension. Filter by character, ascension, and outcome.",
      path: "/leaderboards",
    }),
  ];

  // LeaderboardBrowseClient calls `useSearchParams()`, which opts the
  // whole tree out of static prerender and was preventing the JSON-LD
  // sibling from making it into the SSR HTML — GSC saw zero
  // structured data on /leaderboards. Wrapping the client component
  // in <Suspense> isolates the bailout so the JsonLd ships in the
  // initial server response.
  return (
    <>
      <JsonLd data={jsonLd} />
      <Suspense>
        <LeaderboardBrowseClient />
      </Suspense>
    </>
  );
}
