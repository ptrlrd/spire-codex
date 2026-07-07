import type { Metadata } from "next";
import { SITE_NAME, SITE_URL, DEFAULT_OG_IMAGE } from "@/lib/seo";
import GiveawayClient from "./GiveawayClient";

const title = "Slay the Spire 2 Shadowbox Giveaway | Spire Codex";
const description =
  "Enter to win a Slay the Spire 2 shadowbox. Sign in with Steam, get the mod, and upload a run. No purchase necessary. US residents only. July 7 to August 7, 2026.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: `${SITE_URL}/giveaway`,
    title,
    description,
    images: [{ url: DEFAULT_OG_IMAGE }],
  },
  twitter: { card: "summary_large_image", title, description },
  alternates: { canonical: "/giveaway" },
};

export default function GiveawayPage() {
  return <GiveawayClient />;
}
