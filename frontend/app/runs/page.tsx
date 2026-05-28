import type { Metadata } from "next";
import BrowseRunsClient from "./BrowseRunsClient";

export const metadata: Metadata = {
  title: "Browse Runs - Slay the Spire 2 (sts2) | Spire Codex",
  description:
    "Browse, search, and filter every Slay the Spire 2 run submitted to Spire Codex. Filter by character, ascension, username, seed, version, mode, and more.",
  alternates: { canonical: "/runs" },
};

export default function RunsPage() {
  return <BrowseRunsClient />;
}
