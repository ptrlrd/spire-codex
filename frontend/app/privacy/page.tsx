import type { Metadata } from "next";
import { SITE_NAME, SITE_URL, DEFAULT_OG_IMAGE } from "@/lib/seo";
import PrivacyBody from "./PrivacyBody";

const title = `Privacy Policy | ${SITE_NAME}`;
const description =
  "How Spire Codex collects, uses, and retains data submitted through the website, API, and Overwolf overlay.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/privacy`,
    title,
    description,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description },
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <PrivacyBody lang="eng" />;
}
