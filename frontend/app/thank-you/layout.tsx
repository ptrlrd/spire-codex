import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Database - Thank You - Slay the Spire 2 (sts2) | Spire Codex",
  description:
    "Thank you to the Spire Codex community — Ko-fi supporters, contributors, and everyone who's helped report bugs, share the site, and make this project what it is.",
  openGraph: {
    title: "Database - Thank You - Slay the Spire 2 (sts2) | Spire Codex",
    description:
      "Thank you to the Spire Codex community of supporters and contributors.",
  },
  alternates: {
    canonical: "/thank-you",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
