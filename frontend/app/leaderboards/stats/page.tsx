import type { Metadata } from "next";
import StatsClient from "./StatsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stats - Slay the Spire 2 | Spire Codex",
  description:
    "Slay the Spire 2 stats — win rates by character, card pick rates, most common relics, deadliest encounters. Community-driven data from submitted runs.",
};

export default function StatsPage() {
  return <StatsClient />;
}
