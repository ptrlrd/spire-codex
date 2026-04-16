import type { Metadata } from "next";
import SubmitRunClient from "./SubmitRunClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Submit a Run - Slay the Spire 2 | Spire Codex",
  description:
    "Submit your Slay the Spire 2 run history to share with the community. Drag and drop your .run files or paste JSON to analyze deck evolution, card choices, and floor-by-floor stats.",
};

export default function SubmitRunPage() {
  return <SubmitRunClient />;
}
