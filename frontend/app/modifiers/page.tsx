import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import ModifiersClient from "./ModifiersClient";

// Pure client component, no fetches — pre-rendered at build time and
// cached at CF edge indefinitely (modifier data only changes on deploy).

const title = "Custom Mode Modifiers - All Modifiers - Slay the Spire 2 (sts2) | Spire Codex";
const description =
  "All 16 Slay the Spire 2 (sts2) custom-mode modifiers — Draft, Sealed Deck, Insanity, and more. Effects, deck rules, and Neow interactions for each.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/modifiers`,
    title,
    description,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description },
};

export default function ModifiersPage() {
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Modifiers", href: "/modifiers" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Custom Mode Modifiers",
      description:
        "All 16 Slay the Spire 2 custom-mode modifiers — Draft, Sealed Deck, Insanity, and more. Effects, deck rules, and Neow interactions.",
      path: "/modifiers",
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <ModifiersClient />
    </>
  );
}
