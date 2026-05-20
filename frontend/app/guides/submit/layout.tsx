import type { Metadata } from "next";
import { buildLanguageAlternates } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Submit a Guide - Slay the Spire 2 (sts2) | Spire Codex",
  description:
    "Share your Slay the Spire 2 (sts2) knowledge with the community. Submit a guide for review — strategy, character, mechanic, boss, or event walkthroughs welcome.",
  alternates: { canonical: "/guides/submit", languages: buildLanguageAlternates("/guides/submit") },
};

export default function GuideSubmitLayout({ children }: { children: React.ReactNode }) {
  return children;
}
