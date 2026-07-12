import type { Metadata } from "next";
import { SITE_NAME, SITE_URL, DEFAULT_OG_IMAGE } from "@/lib/seo";
import TermsBody from "./TermsBody";

const title = `Terms of Service | ${SITE_NAME}`;
const description =
  "Terms governing use of the Spire Codex website, API, embeddable widgets, and Overwolf overlay.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/terms`,
    title,
    description,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description },
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return <TermsBody lang="eng" />;
}
