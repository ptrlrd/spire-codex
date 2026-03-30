import type { Metadata } from "next";
import MetaClient from "./MetaClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Slay the Spire 2 Meta - Community Stats & Pick Rates | Spire Codex",
  description:
    "Community-driven meta stats for Slay the Spire 2. Win rates by character, card pick rates, most common relics, deadliest encounters — all from submitted run data.",
};

export default function MetaPage() {
  return <MetaClient />;
}
