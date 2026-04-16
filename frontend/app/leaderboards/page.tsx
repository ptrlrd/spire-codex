import type { Metadata } from "next";
import LeaderboardBrowseClient from "./LeaderboardBrowseClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leaderboards - Slay the Spire 2 | Spire Codex",
  description:
    "Browse community-submitted Slay the Spire 2 runs. Filter by character, ascension level, and outcome. View leaderboards and detailed run breakdowns.",
};

export default function ToolsPage() {
  return <LeaderboardBrowseClient />;
}
